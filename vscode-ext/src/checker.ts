import * as vscode from "vscode";
import * as cp from "child_process";
import type { CheckResult } from "./types";

/** 标准化输出：统一换行、去行尾空格、去首尾空行 */
function normOut(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l: string) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

/** 差异对比：找出第一处不同的位置 */
function diffOutput(expected: string, got: string): string {
  const expLines = expected.split("\n");
  const gotLines = got.split("\n");
  const maxLines = Math.max(expLines.length, gotLines.length);

  for (let i = 0; i < maxLines; i++) {
    const el = expLines[i] ?? "";
    const gl = gotLines[i] ?? "";
    if (el === gl) continue;

    // 找第一个不同的字符
    const maxLen = Math.max(el.length, gl.length);
    for (let j = 0; j < maxLen; j++) {
      const ec = el[j] ?? "";
      const gc = gl[j] ?? "";
      if (ec !== gc) {
        const lineNum = i + 1;
        const charNum = j + 1;
        const eCode = ec.length ? `U+${ec.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}` : "空";
        return `第 ${lineNum} 行 第 ${charNum} 个字符不同：期望「${ec || "（无）"}」(${eCode})，得到「${gc || "（无）"}」`;
      }
    }

    // 一行是另一行的前缀（长度不同）
    const lineNum = i + 1;
    if (el.length !== gl.length) {
      return `第 ${lineNum} 行长度不同：期望 ${el.length} 字，得到 ${gl.length} 字`;
    }
  }

  if (expLines.length !== gotLines.length) {
    return `行数不同：期望 ${expLines.length} 行，得到 ${gotLines.length} 行`;
  }

  return "输出完全一致";
}

/** 运行 Python 代码并检查输出 */
export async function runAndCheck(
  pythonPath: string,
  filePath: string,
  expected: string,
  stdin?: string,
  cwd?: string,
): Promise<CheckResult> {
  return new Promise((resolve) => {
    const args: string[] = [filePath];
    // 如果有 stdin，用 -c 包裹方式不可行，直接传文件路径，stdin 通过 spawn options
    const options: cp.SpawnOptions = {
      cwd,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
    };

    const proc = cp.spawn(pythonPath, args, options);
    let stdout = "";
    let stderr = "";

    if (proc.stdout) {
      proc.stdout.on("data", (d: Buffer) => {
        stdout += d.toString("utf8");
      });
    }
    if (proc.stderr) {
      proc.stderr.on("data", (d: Buffer) => {
        stderr += d.toString("utf8");
      });
    }

    if (stdin && proc.stdin) {
      proc.stdin.write(stdin);
    }
    if (proc.stdin) {
      proc.stdin.end();
    }

    // 超时保护 15 秒（防死循环）
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      resolve({
        passed: false,
        expected,
        got: "",
        error: "代码运行超过 15 秒，可能死循环了。检查是否有 while 循环没退出条件。",
      });
    }, 15000);

    proc.on("close", (code: number) => {
      clearTimeout(timer);

      // 有 stderr 输出（报错）
      if (stderr.trim()) {
        resolve({
          passed: false,
          expected,
          got: stdout,
          error: stderr.trim(),
        });
        return;
      }

      const normExp = normOut(expected);
      const normGot = normOut(stdout);
      const passed = normExp === normGot;

      resolve({
        passed,
        expected,
        got: stdout,
        diff: passed ? undefined : diffOutput(normExp, normGot),
      });
    });

    proc.on("error", (err: Error) => {
      clearTimeout(timer);
      resolve({
        passed: false,
        expected,
        got: "",
        error: `Python 启动失败：${err.message}\n请检查设置里的 pyland.pythonPath（当前: ${pythonPath}）`,
      });
    });
  });
}

/** 解析 Python traceback 提取行号和错误类型 */
export function parsePyError(stderr: string): { line?: number; type?: string; msg?: string } {
  // 格式: File "...", line 3 ... SyntaxError: invalid syntax
  // 或:   File "<string>", line 5, in <module> ... NameError: name 'x' is not defined
  const lines = stderr.split("\n");
  let line: number | undefined;
  let type: string | undefined;
  let msg: string | undefined;

  for (const l of lines) {
    const m = l.match(/line\s+(\d+)/);
    if (m && !line) line = parseInt(m[1], 10);
  }

  // 最后一行通常是 ErrorType: message
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^(\w+)(?:Error|Exception|Warning):\s*(.*)/);
    if (m) {
      type = m[1] + "Error";
      msg = lines[i];
      break;
    }
  }

  return { line, type, msg };
}
