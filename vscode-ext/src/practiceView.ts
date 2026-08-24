import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";
import { COURSES, findLevel } from "./courses";
import type { Question } from "./types";
import { genBatch, pickFromLevel } from "./generator";
import { quizCSS, quizScript, questionHTML, escape, escapeCode } from "./quizRender";
import { runAndCheck } from "./checker";

/** Webview 消息协议（训练场） */
type ArenaMsg =
  | { cmd: "startLevelPractice"; levelId: string }
  | { cmd: "startGen"; mode: "theory" | "code" | "all"; chapterIds: string[] }
  | { cmd: "openPlayground" }
  | { cmd: "runPlayground" }
  | { cmd: "answer"; qIdx: number; correct: boolean; picked: string }
  | { cmd: "openCode"; qIdx: number }
  | { cmd: "checkCode"; qIdx: number }
  | { cmd: "hint"; qIdx: number }
  | { cmd: "backToMenu" };

const PRACTICE_COUNT = 10;

/** 训练场管理器 */
export class PracticeViewManager {
  private panel: vscode.WebviewPanel | null = null;
  private questions: Question[] = [];
  private results = new Map<number, boolean>();
  private codeFiles = new Map<number, string>();
  /** 本 session 已经为哪些 qIdx 写过文件——避免重复打开同一题时把用户的代码覆盖 */
  private openedInSession = new Set<number>();
  private recentHashes: string[] = [];
  private sessionLabel = "";
  private playgroundChannel: vscode.OutputChannel = vscode.window.createOutputChannel("PyLand Playground");

  constructor(private ctx: vscode.ExtensionContext) {}

  /** 打开训练场（菜单页） */
  openArena(): void {
    if (this.panel) {
      this.panel.reveal();
      this.renderMenu();
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      "pyland.arena",
      "🏋️ 实操训练场",
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.panel.webview.onDidReceiveMessage(
      (msg: ArenaMsg) => this.handleMessage(msg),
      undefined,
      this.ctx.subscriptions,
    );
    this.panel.onDidDispose(() => { this.panel = null; });
    this.renderMenu();
  }

  /** 供 onDidSaveTextDocument 调用：检查当前练习的 code 题 */
  async checkActiveByFile(fileName: string): Promise<boolean> {
    const m = fileName.match(/practice_q(\d+)\.py$/);
    if (!m || !this.panel || this.questions.length === 0) return false;
    await this.checkCode(parseInt(m[1], 10) - 1);
    return true;
  }

  private async handleMessage(msg: ArenaMsg): Promise<void> {
    switch (msg.cmd) {
      case "startLevelPractice": {
        const found = findLevel(msg.levelId);
        if (!found) return;
        this.questions = pickFromLevel(found.level.questions, PRACTICE_COUNT);
        this.sessionLabel = `关卡练习 · ${found.level.icon} ${found.level.title}`;
        this.startSession();
        break;
      }
      case "startGen": {
        this.questions = genBatch(msg.mode, PRACTICE_COUNT, msg.chapterIds, this.recentHashes);
        if (this.questions.length === 0) {
          vscode.window.showWarningMessage("出题器没出够题，换个组合试试。");
          return;
        }
        const modeName = msg.mode === "theory" ? "理论卷" : msg.mode === "code" ? "实操卷" : "混合卷";
        const chName = msg.chapterIds.length > 0
          ? msg.chapterIds.map(id => COURSES.find(c => c.id === id)?.title || id).join("+") + " · "
          : "";
        this.sessionLabel = `无限出题 · ${chName}${modeName}`;
        this.startSession();
        break;
      }
      case "openPlayground":
        await this.openPlayground();
        break;
      case "runPlayground":
        await this.runPlayground();
        break;
      case "answer":
        this.results.set(msg.qIdx, msg.correct);
        break;
      case "openCode":
        await this.openCodeFile(msg.qIdx);
        break;
      case "checkCode":
        await this.checkCode(msg.qIdx);
        break;
      case "hint":
        this.showHint(msg.qIdx);
        break;
      case "backToMenu":
        this.renderMenu();
        break;
    }
  }

  private startSession(): void {
    this.results = new Map();
    this.codeFiles = new Map();
    this.openedInSession.clear();
    // 记录指纹（去重窗口，保留最近 60）
    for (const q of this.questions) {
      const h = JSON.stringify([q.type, q.q, q.code, q.expected]);
      this.recentHashes.push(h);
    }
    if (this.recentHashes.length > 60) {
      this.recentHashes = this.recentHashes.slice(-60);
    }
    this.renderQuiz();
  }

  /** 创建/打开 code 题练习文件 */
  private async openCodeFile(qIdx: number): Promise<void> {
    if (!this.panel) return;
    const q = this.questions[qIdx];
    if (!q || q.type !== "code") return;

    const config = vscode.workspace.getConfiguration("pyland");
    const dirName = config.get<string>("exerciseDir", "pyland-exercises");

    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    if (!wsFolder) {
      vscode.window.showErrorMessage("请先打开一个文件夹（工作区），PyLand 需要在其中创建练习文件。");
      return;
    }

    const dirPath = path.join(wsFolder.uri.fsPath, dirName);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const fileName = `practice_q${qIdx + 1}.py`;
    const filePath = path.join(dirPath, fileName);

    const header = `# ═══════════════════════════════════════════════════════════
# PyLand 训练场 · ${this.sessionLabel} · 第 ${qIdx + 1} 题
# ═══════════════════════════════════════════════════════════
# ${q.q.replace(/\n/g, "\n# ")}
# 期望输出:
${(q.expected || "").split("\n").map((l: string) => `#   ${l}`).join("\n")}
# ═══════════════════════════════════════════════════════════
# ↓↓↓ 在下面写你的代码 ↓↓↓

`;
    const content = header + (q.starter || "");

    // 同一 session 内首次打开该 qIdx：无条件覆盖（防止新题写到旧文件里）；
    // 同一 session 内重复打开：保留用户已写代码。
    // 文件被用户手动删了也补回去。
    const needWrite = !this.openedInSession.has(qIdx) || !fs.existsSync(filePath);
    if (needWrite) {
      fs.writeFileSync(filePath, content, "utf8");
    }
    this.openedInSession.add(qIdx);

    this.codeFiles.set(qIdx, filePath);

    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Two);

    this.panel.webview.postMessage({ cmd: "codeFileOpened", qIdx, fileName });
  }

  /** 检查练习 code 题 */
  private async checkCode(qIdx: number): Promise<void> {
    if (!this.panel) return;
    const q = this.questions[qIdx];
    if (!q || q.type !== "code" || !q.expected) return;

    const filePath = this.codeFiles.get(qIdx);
    if (!filePath || !fs.existsSync(filePath)) {
      await this.openCodeFile(qIdx);
    }
    const actualPath = this.codeFiles.get(qIdx);
    if (!actualPath) return;

    const config = vscode.workspace.getConfiguration("pyland");
    const pythonPath = config.get<string>("pythonPath", "python");

    this.panel.webview.postMessage({ cmd: "checking", qIdx });

    const result = await runAndCheck(pythonPath, actualPath, q.expected);

    if (result.passed) {
      this.results.set(qIdx, true);
    }

    this.panel.webview.postMessage({ cmd: "checkResult", qIdx, result });
  }

  private showHint(qIdx: number): void {
    const q = this.questions[qIdx];
    if (!q) return;
    vscode.window.showInformationMessage(`💡 提示：${q.explain}`);
  }

  /** 自由编码台：打开 playground.py */
  private async openPlayground(): Promise<void> {
    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    if (!wsFolder) {
      vscode.window.showErrorMessage("请先打开一个文件夹（工作区）。");
      return;
    }
    const filePath = path.join(wsFolder.uri.fsPath, "playground.py");
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, "# PyLand 自由编码台——随便写，Ctrl+F5 跑起来\n# 试试：\n# print('hello')\n\n", "utf8");
    }
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    const choice = await vscode.window.showInformationMessage(
      "⌨️ 自由编码台已打开——写完代码点下面的「▶ 立即运行」按钮。",
      "▶ 立即运行",
      "打开输出面板"
    );
    if (choice === "▶ 立即运行") {
      await this.runPlayground();
    } else if (choice === "打开输出面板") {
      this.playgroundChannel.show(true);
    }
  }

  /**
   * 运行 playground.py——直接 child_process.spawn，绕开 PowerShell 5.1 的解析坑。
   * 输出写到独立 "PyLand Playground" OutputChannel。
   */
  public async runPlayground(): Promise<void> {
    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    if (!wsFolder) {
      vscode.window.showErrorMessage("请先打开一个文件夹（工作区）。");
      return;
    }
    const filePath = path.join(wsFolder.uri.fsPath, "playground.py");
    if (!fs.existsSync(filePath)) {
      vscode.window.showWarningMessage("playground.py 不存在，请先打开自由编码台。");
      return;
    }
    // 优先用 settings.json 配的 pyland.pythonPath，回退到 PATH 里的 python
    const cfg = vscode.workspace.getConfiguration("pyland");
    const python = (cfg.get<string>("pythonPath") || "python").trim();
    const cwd = wsFolder.uri.fsPath;

    this.playgroundChannel.clear();
    this.playgroundChannel.appendLine(`▶ ${python} ${filePath}`);
    this.playgroundChannel.show(true);

    return new Promise<void>((resolve) => {
      const child = spawn(python, [filePath], {
        cwd,
        env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
      });
      const timer = setTimeout(() => {
        child.kill();
        this.playgroundChannel.appendLine("\n⏱️ 运行超时（15s）已强制结束。");
        resolve();
      }, 15000);
      child.stdout.on("data", (d: Buffer) => this.playgroundChannel.append(d.toString("utf8")));
      child.stderr.on("data", (d: Buffer) => this.playgroundChannel.append("[stderr] " + d.toString("utf8")));
      child.on("error", (e) => {
        clearTimeout(timer);
        this.playgroundChannel.appendLine(`\n❌ 启动失败：${e.message}`);
        vscode.window.showErrorMessage(`找不到 Python（${python}）。请确认 pythonPath 配置正确。`);
        resolve();
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        this.playgroundChannel.appendLine(`\n— 进程退出，code=${code} —`);
        resolve();
      });
    });
  }

  /* ═══════════ 渲染 ═══════════ */

  private renderMenu(): void {
    if (!this.panel) return;
    const chaptersHTML = COURSES.filter(c => !c.locked && c.levels.length > 0).map(ch => `
      <div class="ch-block">
        <div class="ch-title">${escape(ch.no)} · ${escape(ch.title)} <span class="ch-sub">${escape(ch.sub)}</span></div>
        <div class="lv-grid">
          ${ch.levels.map(lv => `
            <button class="lv-btn" onclick="startLevelPractice('${lv.id}')">
              <span class="lv-icon">${lv.icon}</span>
              <span class="lv-name">${escape(lv.title)}</span>
              <span class="lv-desc">${escape(lv.desc)}</span>
            </button>`).join("")}
        </div>
      </div>`).join("");

    this.panel.webview.html = /*html*/ `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><style>
${quizCSS()}
.arena-header { border-bottom: 2px solid var(--accent); padding-bottom: 14px; margin-bottom: 20px; }
.arena-header h1 { font-size: 22px; }
.arena-header .sub { color: var(--vscode-descriptionForeground); font-size: 13px; margin-top: 4px; }
.mode-card {
  background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px;
  padding: 18px 20px; margin-bottom: 16px;
}
.mode-card h2 { font-size: 16px; color: var(--accent); margin-bottom: 8px; }
.mode-card .desc { font-size: 13px; color: var(--vscode-descriptionForeground); margin-bottom: 12px; }
.gen-row { display: flex; gap: 10px; flex-wrap: wrap; }
.gen-btn {
  background: var(--accent2); color: #fff; border: none; border-radius: 6px;
  padding: 8px 18px; cursor: pointer; font-size: 14px; font-family: inherit;
}
.gen-btn:hover { opacity: 0.85; }
.gen-btn.warm { background: var(--accent); }
.gen-btn.ghost { background: transparent; border: 1px solid var(--border); color: var(--fg); }
.gen-row .label { font-size: 13px; color: var(--vscode-descriptionForeground); align-self: center; margin-right: 4px; }
.chip {
  display: inline-block; padding: 7px 14px; border-radius: 18px;
  border: 1px solid var(--border); background: transparent; color: var(--fg);
  cursor: pointer; font-size: 13px; font-family: inherit; user-select: none;
  transition: all 0.12s;
}
.chip:hover { border-color: var(--accent); }
.chip.on {
  background: var(--accent); border-color: var(--accent); color: #fff;
  box-shadow: 0 2px 6px rgba(232,112,58,0.25);
}
.chip.on.chip-accent2 {
  background: var(--accent2); border-color: var(--accent2); color: #fff;
  box-shadow: 0 2px 6px rgba(91,99,255,0.25);
}
.preview-line {
  margin-top: 14px; padding: 10px 14px; border-radius: 8px;
  background: var(--card-bg); border: 1px dashed var(--border);
  font-size: 13px; color: var(--fg);
}
.preview-line .label { color: var(--vscode-descriptionForeground); margin-right: 6px; }
.preview-line .val { color: var(--accent); font-weight: 600; }
.start-btn {
  display: block; width: 100%; margin-top: 14px; padding: 14px 0;
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%);
  color: #fff; border: none; border-radius: 8px; cursor: pointer;
  font-size: 15px; font-weight: 600; font-family: inherit;
  transition: transform 0.1s, box-shadow 0.15s;
}
.start-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(232,112,58,0.35); }
.start-btn:active { transform: translateY(0); }
.ch-block { margin-bottom: 6px; }
.ch-title { font-weight: bold; font-size: 14px; margin: 10px 0 8px; }
.ch-sub { font-weight: normal; color: var(--vscode-descriptionForeground); font-size: 12px; }
.lv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.lv-btn {
  background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px;
  padding: 12px 14px; cursor: pointer; text-align: left; color: var(--fg);
  font-family: inherit; transition: all 0.15s;
}
.lv-btn:hover { border-color: var(--accent); background: rgba(232,112,58,0.08); }
.lv-icon { font-size: 20px; margin-right: 6px; }
.lv-name { font-size: 14px; font-weight: bold; }
.lv-desc { display: block; font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 4px; }
.hint-line { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 6px; }
</style></head>
<body>
<div class="arena-header">
  <h1>🏋️ 实操训练场</h1>
  <div class="sub">想刷实操就刷实操，想闯关就闯关——这里不计 XP、不影响关卡进度，随便练。</div>
</div>

<div class="mode-card">
  <h2>🤖 无限出题器</h2>
  <div class="desc">参数化出题，每次都是新题，重复率极低。一批 ${PRACTICE_COUNT} 题。自由组合题型+章节。</div>

  <div class="gen-row" style="margin-top:6px">
    <span class="label">题型</span>
    <span class="chip on chip-accent2" data-mode="all" onclick="pickMode(this)">🎲 混合</span>
    <span class="chip chip-accent2" data-mode="theory" onclick="pickMode(this)">📖 理论</span>
    <span class="chip chip-accent2" data-mode="code" onclick="pickMode(this)">⌨️ 实操</span>
  </div>

  <div class="gen-row" style="margin-top:10px">
    <span class="label">章节</span>
    <span class="chip on" data-ch="__all__" onclick="toggleChapter(this)">全章节</span>
    ${COURSES.filter(c => !c.locked && c.levels.length > 0).map(ch =>
      `<span class="chip" data-ch="${ch.id}" data-title="${escape(ch.title)}" onclick="toggleChapter(this)">${ch.no} · ${escape(ch.title)}</span>`
    ).join("")}
  </div>

  <div class="preview-line" id="genPreview">
    <span class="label">将出题：</span>
    <span class="val" id="genPreviewVal"></span>
  </div>

  <button class="start-btn" onclick="startGen()">▶ 开始 ${PRACTICE_COUNT} 题</button>

  <div class="hint-line">出过的题会记住指纹——连刷多批基本不撞题。</div>
</div>

<div class="mode-card">
  <h2>📖 关卡针对性练习</h2>
  <div class="desc">从指定关卡的原题里随机抽 ${PRACTICE_COUNT} 题乱序练。哪关薄弱练哪关。</div>
  ${chaptersHTML}
</div>

<div class="mode-card">
  <h2>⌨️ 自由编码台</h2>
  <div class="desc">无题目无分数，打开 playground.py 随便写随便跑。运行结果走 PyLand Playground 输出面板（不经过 PowerShell）。</div>
  <div class="gen-row">
    <button class="gen-btn" onclick="openPlayground()">打开 playground.py</button>
    <button class="gen-btn warm" onclick="runPlayground()">▶ 立即运行</button>
  </div>
  <div class="hint-line">建议：改完代码按 Ctrl+S 保存，再点「▶ 立即运行」看结果。</div>
</div>

<script>
const vscode = acquireVsCodeApi();
function startLevelPractice(levelId) { vscode.postMessage({ cmd: 'startLevelPractice', levelId }); }
function openPlayground() { vscode.postMessage({ cmd: 'openPlayground' }); }
function runPlayground() { vscode.postMessage({ cmd: 'runPlayground' }); }

/* 无限出题器：chip 状态管理 + 实时预览 */
const __genState = { mode: 'all', chapters: [] };
function pickMode(el) {
  document.querySelectorAll('.chip[data-mode]').forEach(c => c.classList.remove('on'));
  el.classList.add('on');
  __genState.mode = el.dataset.mode;
  refreshPreview();
}
function toggleChapter(el) {
  const id = el.dataset.ch;
  if (id === '__all__') {
    document.querySelectorAll('.chip[data-ch]').forEach(c => c.classList.remove('on'));
    el.classList.add('on');
    __genState.chapters = [];
  } else {
    const allChip = document.querySelector('.chip[data-ch="__all__"]');
    if (allChip) allChip.classList.remove('on');
    el.classList.toggle('on');
    const on = Array.from(document.querySelectorAll('.chip[data-ch]:not([data-ch="__all__"]).on')).map(c => c.dataset.ch);
    if (on.length === 0) {
      if (allChip) allChip.classList.add('on');
      __genState.chapters = [];
    } else {
      __genState.chapters = on;
    }
  }
  refreshPreview();
}
function refreshPreview() {
  const modeMap = { all: '混合卷', theory: '理论卷', code: '实操卷' };
  const modeTxt = modeMap[__genState.mode] || '混合卷';
  const chTxt = __genState.chapters.length === 0
    ? '全章节'
    : __genState.chapters.map(id => {
        const c = document.querySelector('.chip[data-ch="' + id + '"]');
        return c ? (c.dataset.title || id) : id;
      }).join('+');
  const el = document.getElementById('genPreviewVal');
  if (el) el.textContent = modeTxt + ' · ' + chTxt;
}
function startGen() {
  vscode.postMessage({ cmd: 'startGen', mode: __genState.mode, chapterIds: __genState.chapters });
}

/* 页面加载完刷一次预览 */
window.addEventListener('load', refreshPreview);
</script>
</body>
</html>`;
  }

  private renderQuiz(): void {
    if (!this.panel) return;
    const questionsHTML = this.questions.map((q, i) => questionHTML(q, i)).join("\n");

    this.panel.webview.html = /*html*/ `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><style>
${quizCSS()}
.quiz-header { border-bottom: 2px solid var(--accent); padding-bottom: 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
.quiz-header h1 { font-size: 18px; }
.quiz-header .score { font-size: 14px; color: var(--vscode-descriptionForeground); }
.quiz-header .score strong { color: var(--ok); }
.back-btn {
  background: transparent; border: 1px solid var(--border); border-radius: 6px;
  padding: 6px 14px; color: var(--fg); cursor: pointer; font-size: 13px; font-family: inherit;
}
.back-btn:hover { border-color: var(--accent); }
.done-banner {
  display: none; background: rgba(78,201,176,0.12); border: 1px solid var(--ok);
  border-radius: 8px; padding: 14px 20px; margin-bottom: 16px; font-size: 15px;
}
.done-banner.show { display: block; }
</style></head>
<body>
<div class="quiz-header">
  <div>
    <h1>🎯 ${escape(this.sessionLabel)}</h1>
    <div class="score">答对 <strong id="okCount">0</strong> / 已答 <span id="doneCount">0</span> / 共 ${this.questions.length} 题</div>
  </div>
  <button class="back-btn" onclick="backToMenu()">← 返回训练场</button>
</div>
<div class="done-banner" id="doneBanner">🎉 本组完成！<span id="finalScore"></span> —— 点右上角「返回训练场」再来一组新题。</div>
<div class="questions">${questionsHTML}</div>
<script>
${quizScript()}

window.__pylandOnAnswer = function(qIdx, correct) {
  updateScore();
};
function updateScore() {
  const cards = document.querySelectorAll('.q-card');
  let done = 0, ok = 0;
  cards.forEach(c => {
    const fb = c.querySelector('.feedback');
    if (fb && (fb.classList.contains('ok') || fb.classList.contains('bad'))) done++;
    if (fb && fb.classList.contains('ok')) ok++;
  });
  document.getElementById('doneCount').textContent = done;
  document.getElementById('okCount').textContent = ok;
  if (done >= ${this.questions.length}) {
    document.getElementById('doneBanner').className = 'done-banner show';
    document.getElementById('finalScore').textContent = '答对 ' + ok + ' / ' + ${this.questions.length};
  }
}
function backToMenu() { vscode.postMessage({ cmd: 'backToMenu' }); }
</script>
</body>
</html>`;
  }
}
