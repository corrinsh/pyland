/* PyLand 出题器自检：
   1. 结构完整性（options/answer/expected 齐全）
   2. 连续批次指纹重复率
   3. code 题 expected 用真 Python 实测（按 starter 反推标准答案） */
const { genBatch } = require("./out/generator.js");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PYTHON = "D:\\Python314\\python.exe";
let fails = 0;

function norm(s) {
  return s.replace(/\r\n/g, "\n").split("\n").map(l => l.replace(/\s+$/, "")).join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
}

function runPy(code) {
  const f = path.join(os.tmpdir(), `pyland_gen_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);
  fs.writeFileSync(f, code, "utf8");
  try {
    return execFileSync(PYTHON, [f], { encoding: "utf8", timeout: 15000, env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" } });
  } catch (e) {
    console.log(`[FAIL] Python 执行异常: ${e.signal || e.status || e.message}\n  代码:\n${code}`);
    fails++;
    return "\u0000__PY_FAIL__";
  } finally {
    try { fs.unlinkSync(f); } catch (e) {}
  }
}

/* 按 starter / q 文本反推 code 题标准答案 */
function solveCode(q) {
  // codeTwo: 先显示「X」，再显示「Y」
  let m = q.q.match(/先显示「(.+?)」，再显示「(.+?)」/);
  if (m) return `print('${m[1]}')\nprint('${m[2]}')\n`;
  // codeStrRep: 把「X」显示成连续 N 个
  m = q.q.match(/把「(.+?)」显示成连续 (\d+) 个/);
  if (m) return `print('${m[1]}' * ${m[2]})\n`;
  // codeVarCalc: dmg1 装 A、dmg2 装 B → 显示两者之和
  m = q.starter.match(/dmg1 = (\d+)\ndmg2 = (\d+)/);
  if (m) return `${q.starter}print(dmg1 + dmg2)\n`;
  // codeIf / codeOddEven: score = N 或 num = N
  m = q.starter.match(/score = (\d+)/);
  if (m) return `${q.starter}if score >= 90:\n    print('优秀')\nelif score >= 60:\n    print('及格')\nelse:\n    print('不及格')\n`;
  m = q.starter.match(/num = (\d+)/);
  if (m) return `${q.starter}if num % 2 == 0:\n    print('偶数')\nelse:\n    print('奇数')\n`;
  // codeFor: 用 for 循环显示 1 到 N
  m = q.q.match(/用 for 循环显示 1 到 (\d+)/);
  if (m) return `for i in range(1, ${parseInt(m[1], 10) + 1}):\n    print(i)\n`;
  // codeFilter / codeSum: nums = [...]
  m = q.starter.match(/nums = \[([\d, ]+)\]/);
  if (m) {
    if (q.q.includes("大于")) {
      const th = parseInt(q.q.match(/大于 (\d+) 的数/)[1], 10);
      return `${q.starter}for n in nums:\n    if n > ${th}:\n        print(n)\n`;
    }
    if (q.q.includes("总和")) {
      return `${q.starter}print(sum(nums))\n`;
    }
  }
  // codeDict: hero = {'name': 'X', 'hp': H}
  m = q.starter.match(/hero = \{'name': '(.+?)', 'hp': (\d+)\}/);
  if (m) return `${q.starter}print(hero['name'])\nprint(hero['hp'])\n`;
  return null;
}

/* ---- 1+3. 结构验证 + code 题真跑（每模式各 2 批） ---- */
const batches = [];
const modes = ["theory", "code", "all"];
for (const mode of modes) {
  for (let b = 0; b < 2; b++) {
    const qs = genBatch(mode, 10, undefined, batches.flat().map(q => JSON.stringify([q.type, q.q, q.code, q.expected])));
    batches.push(qs);
    for (const q of qs) {
      if (q.type === "choice" || q.type === "predict") {
        if (!q.options || q.options.length < 3 || typeof q.answer !== "number" || q.answer < 0 || q.answer >= q.options.length) {
          console.log("[FAIL] 结构错误:", JSON.stringify(q).slice(0, 100)); fails++;
        }
      } else if (q.type === "judge") {
        if (typeof q.answer !== "boolean") { console.log("[FAIL] judge 缺 answer"); fails++; }
      } else if (q.type === "blank") {
        if (!q.answer || !q.code) { console.log("[FAIL] blank 缺字段"); fails++; }
      } else if (q.type === "code") {
        if (!q.expected) { console.log("[FAIL] code 缺 expected:", q.q.slice(0, 40)); fails++; continue; }
        const solver = solveCode(q);
        if (!solver) { console.log("[FAIL] 找不到 solver（脚本缺口）:", q.q.slice(0, 50)); fails++; continue; }
        const got = norm(runPy(solver));
        if (got !== norm(q.expected)) {
          console.log(`[FAIL] expected 不符\n  题: ${q.q.slice(0, 60)}\n  期望: ${JSON.stringify(q.expected)}\n  实得: ${JSON.stringify(got)}`); fails++;
        }
      }
    }
  }
}

/* 分章验证 */
for (const ch of ["ch1", "ch2", "ch3"]) {
  const qs = genBatch("all", 10, ch, []);
  if (qs.length < 8) { console.log(`[FAIL] ${ch} 出题不足: ${qs.length}`); fails++; }
}

/* ---- 2. 重复率：连续 8 批 × 10 题 ---- */
const seen = [];
let dup = 0, total = 0;
for (let b = 0; b < 8; b++) {
  const qs = genBatch("all", 10, undefined, seen.slice(-60));
  for (const q of qs) {
    const h = JSON.stringify([q.type, q.q, q.code, q.expected]);
    if (seen.includes(h)) dup++;
    seen.push(h);
    total++;
  }
}
const dupRate = (dup / total * 100).toFixed(1);
console.log(`重复率验证：${total} 题中重复 ${dup} 道（${dupRate}%）${dupRate <= 20 ? " ✓ 达标" : " ✗ 超标"}`);
if (dupRate > 20) fails++;

console.log(`\n结构+语义验证 ${batches.flat().length} 题，失败 ${fails} 处`);
process.exit(fails ? 1 : 0);
