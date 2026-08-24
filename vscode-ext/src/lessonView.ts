import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { findLevel, nextLevelId, COURSES } from "./courses";
import type { Question, LevelProgress } from "./types";
import { ProgressManager } from "./progress";
import { runAndCheck, parsePyError } from "./checker";

/** 活跃关卡状态 */
interface ActiveLesson {
  levelId: string;
  panel: vscode.WebviewPanel;
  results: Map<number, boolean>;  // qIdx → correct
  codeFileUris: Map<number, string>; // qIdx → file path
}

/** Webview 消息协议 */
type MsgFromWebview =
  | { cmd: "answer"; qIdx: number; correct: boolean; picked: string }
  | { cmd: "openCode"; qIdx: number }
  | { cmd: "checkCode"; qIdx: number }
  | { cmd: "finishLevel" }
  | { cmd: "hint"; qIdx: number }
  | { cmd: "goNext" };

/** 关卡 Webview 管理器 */
export class LessonViewManager {
  private active: ActiveLesson | null = null;

  constructor(
    private ctx: vscode.ExtensionContext,
    private pm: ProgressManager,
  ) {}

  get activeLevelId(): string | null {
    return this.active?.levelId ?? null;
  }

  /** 打开关卡 */
  async openLesson(levelId: string): Promise<void> {
    const found = findLevel(levelId);
    if (!found) {
      vscode.window.showErrorMessage(`找不到关卡：${levelId}`);
      return;
    }

    const { level } = found;

    // 如果已有面板，先关
    this.active?.panel.dispose();

    const panel = vscode.window.createWebviewPanel(
      "pyland.lesson",
      `${level.icon} ${level.title}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    panel.webview.html = this.generateHTML(level);

    this.active = {
      levelId,
      panel,
      results: new Map(),
      codeFileUris: new Map(),
    };

    panel.webview.onDidReceiveMessage(
      (msg: MsgFromWebview) => this.handleMessage(msg),
      undefined,
      this.ctx.subscriptions,
    );

    panel.onDidDispose(() => {
      this.active = null;
    });
  }

  /** 处理 webview 消息 */
  private async handleMessage(msg: MsgFromWebview): Promise<void> {
    if (!this.active) return;

    switch (msg.cmd) {
      case "answer":
        this.active.results.set(msg.qIdx, msg.correct);
        this.pm.recordAnswer(msg.correct);
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

      case "finishLevel":
        this.finishLevel();
        break;

      case "goNext":
        const next = nextLevelId(this.active.levelId);
        if (next) {
          await this.openLesson(next);
        }
        break;
    }
  }

  /** 创建/打开代码练习文件 */
  private async openCodeFile(qIdx: number): Promise<void> {
    if (!this.active) return;
    const found = findLevel(this.active.levelId);
    if (!found) return;
    const q = found.level.questions[qIdx];
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

    const fileName = `${this.active.levelId}_q${qIdx + 1}.py`;
    const filePath = path.join(dirPath, fileName);

    // 文件头：题目说明
    const header = `# ═══════════════════════════════════════════════════════════
# PyLand · ${found.level.title} · 第 ${qIdx + 1} 题
# ═══════════════════════════════════════════════════════════
# ${q.q.replace(/\n/g, "\n# ")}
# 期望输出:
${(q.expected || "").split("\n").map((l: string) => `#   ${l}`).join("\n")}
# ═══════════════════════════════════════════════════════════
# ↓↓↓ 在下面写你的代码 ↓↓↓

`;

    const content = header + (q.starter || "");

    // 如果文件已存在，不覆盖（保留用户写的代码）
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, "utf8");
    }

    this.active.codeFileUris.set(qIdx, filePath);

    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Two);

    // 通知 webview 文件已打开
    this.active.panel.webview.postMessage({
      cmd: "codeFileOpened",
      qIdx,
      fileName,
    });
  }

  /** 检查代码 */
  private async checkCode(qIdx: number): Promise<void> {
    if (!this.active) return;
    const found = findLevel(this.active.levelId);
    if (!found) return;
    const q = found.level.questions[qIdx];
    if (!q || q.type !== "code" || !q.expected) return;

    const filePath = this.active.codeFileUris.get(qIdx);
    if (!filePath || !fs.existsSync(filePath)) {
      // 文件还没创建，先创建
      await this.openCodeFile(qIdx);
    }

    const actualPath = this.active.codeFileUris.get(qIdx);
    if (!actualPath) return;

    const config = vscode.workspace.getConfiguration("pyland");
    const pythonPath = config.get<string>("pythonPath", "python");

    this.pm.recordRun();

    // 通知 webview 正在检查
    this.active.panel.webview.postMessage({
      cmd: "checking",
      qIdx,
    });

    const result = await runAndCheck(pythonPath, actualPath, q.expected);

    if (result.passed) {
      this.active.results.set(qIdx, true);
      this.pm.recordAnswer(true);
    }

    // 发结果回 webview
    this.active.panel.webview.postMessage({
      cmd: "checkResult",
      qIdx,
      result,
    });
  }

  /** 显示提示 */
  private showHint(qIdx: number): void {
    if (!this.active) return;
    const found = findLevel(this.active.levelId);
    if (!found) return;
    const q = found.level.questions[qIdx];

    vscode.window.showInformationMessage(
      `💡 提示（会扣分）：${q.explain}`,
      { modal: false },
    );
  }

  /** 完成关卡 */
  private finishLevel(): void {
    if (!this.active) return;
    const found = findLevel(this.active.levelId);
    if (!found) return;

    const total = found.level.questions.length;
    const answered = this.active.results.size;
    const firstTry = Array.from(this.active.results.values()).filter(Boolean).length;

    if (answered < total) {
      vscode.window.showWarningMessage(`还有 ${total - answered} 题没答完，确定提交吗？`, "确定提交", "继续答题")
        .then(choice => {
          if (choice === "确定提交") {
            this.doFinish(firstTry, total);
          }
        });
      return;
    }

    this.doFinish(firstTry, total);
  }

  private doFinish(firstTry: number, total: number): void {
    if (!this.active) return;

    const lp = this.pm.finishLevel(this.active.levelId, firstTry, total);
    const next = nextLevelId(this.active.levelId);

    // 通知 webview 显示通关画面
    this.active.panel.webview.postMessage({
      cmd: "levelComplete",
      stars: lp.stars,
      xp: lp.bestXp,
      firstTry,
      total,
      hasNext: !!next,
    });

    // 触发树刷新
    vscode.commands.executeCommand("pyland.refreshTree");

    if (lp.stars === 3) {
      vscode.window.showInformationMessage(
        `🎉 ${findLevel(this.active.levelId)!.level.title} 通关！${firstTry}/${total} 首答全对，3 星！`,
      );
    } else {
      vscode.window.showInformationMessage(
        `🎉 ${findLevel(this.active.levelId)!.level.title} 通关！${firstTry}/${total} 首答正确，${lp.stars} 星。`,
      );
    }
  }

  /** 命令入口：检查当前活跃关卡的代码 */
  async checkActiveCode(): Promise<void> {
    if (!this.active) {
      vscode.window.showWarningMessage("请先从侧边栏打开一个关卡。");
      return;
    }
    // 找当前代码题（最近的未通过 code 题）
    const found = findLevel(this.active.levelId);
    if (!found) return;
    const codeQs = found.level.questions
      .map((q, i) => ({ q, i }))
      .filter(x => x.q.type === "code");
    if (codeQs.length === 0) return;

    // 如果有打开的编辑器文件，找到对应的 code 题
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const fileName = path.basename(activeEditor.document.fileName);
      const m = fileName.match(/_q(\d+)\.py$/);
      if (m) {
        const qIdx = parseInt(m[1], 10) - 1;
        await this.checkCode(qIdx);
        return;
      }
    }

    // 否则检查第一个未通过的 code 题
    for (const { i } of codeQs) {
      if (!this.active.results.get(i)) {
        await this.checkCode(i);
        return;
      }
    }
    vscode.window.showInformationMessage("所有实操题都通过了！");
  }

  /** 生成 HTML */
  private generateHTML(level: import("./types").Level): string {
    const pm = this.pm;
    const xp = pm.getXP();
    const lv = pm.getLevel();
    const streak = pm.getStreak();
    const done = pm.isLevelDone(level.id);

    const questionsHTML = level.questions.map((q, i) => this.questionHTML(q, i)).join("\n");

    return /*html*/ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root {
    --accent: #e8703a;
    --accent2: #6c5ce7;
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-editor-foreground);
    --border: var(--vscode-panel-border, #333);
    --card-bg: var(--vscode-editorWidget-background, #1e1e2e);
    --code-bg: var(--vscode-textCodeBlock-background, #1a1a2e);
    --ok: #4ec9b0;
    --bad: #f44747;
    --warn: #dcdcaa;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-editor-font-family, 'Inter', 'Segoe UI', sans-serif);
    color: var(--fg);
    background: var(--bg);
    line-height: 1.7;
    padding: 20px 24px;
    max-width: 820px;
    margin: 0 auto;
  }
  .header { border-bottom: 2px solid var(--accent); padding-bottom: 16px; margin-bottom: 20px; }
  .header .icon { font-size: 32px; }
  .header h1 { font-size: 22px; display: inline-block; margin-left: 8px; }
  .header .desc { color: var(--vscode-descriptionForeground); font-size: 14px; margin-top: 4px; }
  .stats { display: flex; gap: 16px; margin-top: 12px; font-size: 13px; }
  .stat { background: var(--card-bg); border: 1px solid var(--border); border-radius: 6px; padding: 4px 12px; }
  .stat strong { color: var(--accent); }

  .story {
    background: var(--card-bg); border-left: 3px solid var(--accent2);
    border-radius: 0 8px 8px 0; padding: 14px 18px; margin-bottom: 20px;
    font-style: italic; color: var(--vscode-descriptionForeground);
  }

  .teach { margin-bottom: 28px; }
  .teach h2 { font-size: 16px; color: var(--accent); margin-bottom: 10px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
  .teach ol { padding-left: 20px; }
  .teach li { margin-bottom: 8px; font-size: 14px; }
  .teach code { background: var(--code-bg); padding: 1px 5px; border-radius: 3px; font-size: 13px; color: var(--warn); }

  .q-card {
    background: var(--card-bg); border: 1px solid var(--border);
    border-radius: 8px; padding: 16px 20px; margin-bottom: 14px;
  }
  .q-card .q-tag { font-size: 11px; color: var(--accent2); font-weight: bold; text-transform: uppercase; }
  .q-card .q-text { font-size: 15px; margin: 6px 0 12px; }
  .q-card .q-code { background: var(--code-bg); border-radius: 4px; padding: 10px 14px; margin: 8px 0; font-family: var(--vscode-editor-font-family, monospace); font-size: 13px; white-space: pre-wrap; }

  .options { display: flex; flex-direction: column; gap: 8px; }
  .opt-btn {
    background: transparent; border: 1px solid var(--border); border-radius: 6px;
    padding: 8px 14px; color: var(--fg); cursor: pointer; text-align: left;
    font-size: 14px; font-family: inherit; transition: all 0.15s;
  }
  .opt-btn:hover { border-color: var(--accent); background: rgba(232,112,58,0.08); }
  .opt-btn.correct { border-color: var(--ok); background: rgba(78,201,176,0.12); }
  .opt-btn.wrong { border-color: var(--bad); background: rgba(244,71,71,0.12); }
  .opt-btn:disabled { cursor: default; }

  .judge-row { display: flex; gap: 12px; }
  .blank-input { display: flex; gap: 8px; align-items: center; }
  .blank-input input {
    flex: 1; background: var(--code-bg); border: 1px solid var(--border);
    border-radius: 4px; padding: 6px 10px; color: var(--fg); font-family: inherit; font-size: 14px;
  }
  .blank-input button {
    background: var(--accent); border: none; border-radius: 4px; padding: 6px 16px;
    color: #fff; cursor: pointer; font-size: 14px;
  }

  .feedback { margin-top: 10px; padding: 8px 14px; border-radius: 6px; font-size: 13px; display: none; }
  .feedback.ok { background: rgba(78,201,176,0.12); border-left: 3px solid var(--ok); display: block; }
  .feedback.bad { background: rgba(244,71,71,0.12); border-left: 3px solid var(--bad); display: block; }
  .feedback .label { font-weight: bold; }
  .feedback .explain { color: var(--vscode-descriptionForeground); margin-top: 4px; }

  .code-section { margin-top: 10px; }
  .code-btn-row { display: flex; gap: 10px; flex-wrap: wrap; }
  .code-btn {
    background: var(--accent2); border: none; border-radius: 6px; padding: 8px 18px;
    color: #fff; cursor: pointer; font-size: 14px; font-family: inherit; transition: all 0.15s;
  }
  .code-btn:hover { opacity: 0.85; }
  .code-btn.check { background: var(--accent); }
  .code-btn.hint { background: transparent; border: 1px solid var(--border); color: var(--vscode-descriptionForeground); }
  .code-btn:disabled { opacity: 0.5; cursor: wait; }

  .code-result { margin-top: 10px; display: none; }
  .code-result.show { display: block; }
  .code-result .result-title { font-weight: bold; font-size: 14px; margin-bottom: 6px; }
  .code-result .result-diff { background: var(--code-bg); border-radius: 4px; padding: 8px 12px; font-size: 13px; font-family: monospace; }
  .code-result .result-err { background: rgba(244,71,71,0.08); border-radius: 4px; padding: 8px 12px; font-size: 13px; font-family: monospace; white-space: pre-wrap; color: var(--bad); }

  .progress-bar { position: fixed; top: 0; left: 0; right: 0; height: 3px; background: transparent; z-index: 100; }
  .progress-fill { height: 100%; background: var(--accent); transition: width 0.3s; width: 0%; }

  .footer { margin-top: 28px; padding: 20px 0; border-top: 2px solid var(--border); text-align: center; }
  .finish-btn {
    background: var(--accent); border: none; border-radius: 8px; padding: 12px 40px;
    color: #fff; cursor: pointer; font-size: 16px; font-weight: bold; font-family: inherit;
  }
  .finish-btn:hover { opacity: 0.85; }
  .finish-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .complete-overlay {
    display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85);
    z-index: 200; justify-content: center; align-items: center; flex-direction: column;
  }
  .complete-overlay.show { display: flex; }
  .complete-overlay .emoji { font-size: 64px; }
  .complete-overlay h2 { font-size: 28px; color: var(--accent); margin: 12px 0; }
  .complete-overlay .stars { font-size: 32px; margin: 8px 0; }
  .complete-overlay .xp-gain { color: var(--ok); font-size: 18px; margin: 4px 0; }
  .complete-overlay .next-btn {
    margin-top: 24px; background: var(--accent); border: none; border-radius: 8px;
    padding: 10px 30px; color: #fff; cursor: pointer; font-size: 16px; font-family: inherit;
  }
</style>
</head>
<body>

<div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>

<div class="header">
  <span class="icon">${level.icon}</span>
  <h1>${level.title}</h1>
  <div class="desc">${level.desc}</div>
  <div class="stats">
    <span class="stat">⚔️ Lv.<strong>${lv}</strong></span>
    <span class="stat">⭐ XP <strong>${xp}</strong></span>
    <span class="stat">🔥 连修 <strong>${streak}</strong> 天</span>
    ${done ? '<span class="stat" style="color:var(--ok)">✓ 已通关</span>' : ""}
  </div>
</div>

<div class="story">📖 ${level.story}</div>

<div class="teach">
  <h2>📜 修行讲义</h2>
  <ol>
    ${level.teach.map((t: string) => `<li>${this.renderInline(t)}</li>`).join("\n")}
  </ol>
</div>

<div class="questions">
  ${questionsHTML}
</div>

<div class="footer">
  <button class="finish-btn" id="finishBtn" onclick="finishLevel()">提交关卡 · ${level.questions.length} 题</button>
  <div style="margin-top:8px;font-size:13px;color:var(--vscode-descriptionForeground)">
    答对 <span id="answeredCount">0</span> / ${level.questions.length}
  </div>
</div>

<div class="complete-overlay" id="completeOverlay">
  <div class="emoji">🎉</div>
  <h2>关卡通关！</h2>
  <div class="stars" id="starsText"></div>
  <div class="xp-gain" id="xpText"></div>
  <button class="next-btn" id="nextBtn" onclick="goNext()" style="display:none">下一关 →</button>
</div>

<script>
const vscode = acquireVsCodeApi();
const total = ${level.questions.length};
let answered = 0;

function updateProgress() {
  const pct = (answered / total * 100).toFixed(0);
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('answeredCount').textContent = answered;
}

function markAnswered(qIdx, correct) {
  answered++;
  updateProgress();
  vscode.postMessage({ cmd: 'answer', qIdx, correct, picked: '' });
}

// 选择题 / 预测题
function selectOption(qIdx, optIdx, correctIdx, btn) {
  const card = btn.closest('.q-card');
  const buttons = card.querySelectorAll('.opt-btn');
  buttons.forEach(b => b.disabled = true);
  const correct = optIdx === correctIdx;
  btn.classList.add(correct ? 'correct' : 'wrong');
  if (!correct) buttons[correctIdx].classList.add('correct');
  const fb = card.querySelector('.feedback');
  fb.className = 'feedback ' + (correct ? 'ok' : 'bad');
  fb.querySelector('.label').textContent = correct ? '✓ 答对了！' : '✗ 答错了';
  fb.querySelector('.explain').textContent = btn.dataset.explain || '';
  markAnswered(qIdx, correct);
}

// 判断题
function judgeAnswer(qIdx, picked, answer, btn) {
  const card = btn.closest('.q-card');
  const buttons = card.querySelectorAll('.opt-btn');
  buttons.forEach(b => b.disabled = true);
  const correct = picked === answer;
  btn.classList.add(correct ? 'correct' : 'wrong');
  if (!correct) buttons[answer ? 0 : 1].classList.add('correct');
  const fb = card.querySelector('.feedback');
  fb.className = 'feedback ' + (correct ? 'ok' : 'bad');
  fb.querySelector('.label').textContent = correct ? '✓ 答对了！' : '✗ 答错了';
  fb.querySelector('.explain').textContent = btn.dataset.explain || '';
  markAnswered(qIdx, correct);
}

// 填空题
function blankSubmit(qIdx, answer, input) {
  const val = input.value.trim();
  const card = input.closest('.q-card');
  const fb = card.querySelector('.feedback');
  // 宽松匹配：去首尾空格 + 大小写不敏感
  const correct = val.toLowerCase() === String(answer).toLowerCase();
  fb.className = 'feedback ' + (correct ? 'ok' : 'bad');
  fb.querySelector('.label').textContent = correct ? '✓ 答对了！' : '✗ 答错了';
  fb.querySelector('.explain').textContent = '正确答案：' + answer;
  markAnswered(qIdx, correct);
}

// 代码题：打开编辑器
function openCode(qIdx) {
  vscode.postMessage({ cmd: 'openCode', qIdx });
}

// 代码题：检查
function checkCode(qIdx) {
  const btn = document.querySelector('[data-check-btn="' + qIdx + '"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 检查中…'; }
  vscode.postMessage({ cmd: 'checkCode', qIdx });
}

// 代码题：提示
function showHint(qIdx) {
  vscode.postMessage({ cmd: 'hint', qIdx });
}

// 收到检查结果
window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.cmd === 'checking') {
    const btn = document.querySelector('[data-check-btn="' + msg.qIdx + '"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 检查中…'; }
    return;
  }
  if (msg.cmd === 'codeFileOpened') {
    const btn = document.querySelector('[data-open-btn="' + msg.qIdx + '"]');
    if (btn) { btn.textContent = '✓ 已在编辑器中打开'; btn.disabled = true; }
    const checkBtn = document.querySelector('[data-check-btn="' + msg.qIdx + '"]');
    if (checkBtn) checkBtn.style.display = '';
    return;
  }
  if (msg.cmd === 'checkResult') {
    const r = msg.result;
    const card = document.querySelector('[data-q-card="' + msg.qIdx + '"]');
    if (!card) return;
    const result = card.querySelector('.code-result');
    result.className = 'code-result show';
    const btn = document.querySelector('[data-check-btn="' + msg.qIdx + '"]');
    if (btn) { btn.disabled = false; btn.textContent = '🔍 检查代码'; }

    if (r.passed) {
      result.querySelector('.result-title').textContent = '🎉 通关！输出完全正确';
      result.querySelector('.result-title').style.color = 'var(--ok)';
      result.querySelector('.result-diff').textContent = '';
      result.querySelector('.result-err').textContent = '';
      markAnswered(msg.qIdx, true);
      if (btn) btn.disabled = true;
    } else if (r.error) {
      result.querySelector('.result-title').textContent = '❌ 代码报错了';
      result.querySelector('.result-title').style.color = 'var(--bad)';
      result.querySelector('.result-err').textContent = r.error;
      result.querySelector('.result-diff').textContent = '';
    } else {
      result.querySelector('.result-title').textContent = '❌ 输出不对';
      result.querySelector('.result-title').style.color = 'var(--bad)';
      result.querySelector('.result-diff').textContent = r.diff || '';
      result.querySelector('.result-err').textContent = '';
    }
    return;
  }
  if (msg.cmd === 'levelComplete') {
    const overlay = document.getElementById('completeOverlay');
    overlay.className = 'complete-overlay show';
    document.getElementById('starsText').textContent = '⭐'.repeat(msg.stars) + '☆'.repeat(3 - msg.stars);
    document.getElementById('xpText').textContent = '+' + msg.xp + ' XP  ·  ' + msg.firstTry + '/' + msg.total + ' 首答正确';
    if (msg.hasNext) {
      document.getElementById('nextBtn').style.display = '';
    }
    return;
  }
});

function finishLevel() {
  vscode.postMessage({ cmd: 'finishLevel' });
}

function goNext() {
  vscode.postMessage({ cmd: 'goNext' });
}

updateProgress();
</script>
</body>
</html>`;
  }

  /** 行内代码渲染（把反引号包裹的内容变成 <code>） */
  private renderInline(text: string): string {
    // 转义 HTML
    let s = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // 行内代码：用「文字中不存在的标记」暂存
    // 原始 teach 里没有反引号，但有引号包裹的代码示例
    // 简单处理：把 "xxx" 形式的短代码用 <code> 包裹（这个太激进，会误伤中文引号）
    // 改为：不做行内代码处理，只保留 HTML 转义后的纯文本
    return s;
  }

  /** 单题 HTML */
  private questionHTML(q: Question, idx: number): string {
    const qNum = idx + 1;
    let typeLabel = "";
    let body = "";

    switch (q.type) {
      case "choice":
        typeLabel = "选择题";
        body = `<div class="options">
          ${q.options!.map((opt: string, i: number) =>
            `<button class="opt-btn" onclick="selectOption(${idx}, ${i}, ${q.answer as number}, this)" data-explain="${this.escape(q.explain)}">${this.escape(opt)}</button>`
          ).join("\n")}
        </div>`;
        break;

      case "predict":
        typeLabel = "预测题";
        body = `${q.code ? `<div class="q-code">${this.escapeCode(q.code)}</div>` : ""}
        <div class="options">
          ${q.options!.map((opt: string, i: number) =>
            `<button class="opt-btn" onclick="selectOption(${idx}, ${i}, ${q.answer as number}, this)" data-explain="${this.escape(q.explain)}">${this.escape(opt)}</button>`
          ).join("\n")}
        </div>`;
        break;

      case "judge":
        typeLabel = "判断题";
        body = `<div class="judge-row">
          <button class="opt-btn" style="flex:1" onclick="judgeAnswer(${idx}, true, ${q.answer}, this)" data-explain="${this.escape(q.explain)}">✓ 对</button>
          <button class="opt-btn" style="flex:1" onclick="judgeAnswer(${idx}, false, ${q.answer}, this)" data-explain="${this.escape(q.explain)}">✗ 错</button>
        </div>`;
        break;

      case "blank":
        typeLabel = "填空题";
        body = `${q.code ? `<div class="q-code">${this.escapeCode(q.code)}</div>` : ""}
        <div class="blank-input">
          <input type="text" id="blank_${idx}" placeholder="输入答案…" onkeydown="if(event.key==='Enter')blankSubmit(${idx}, '${this.escape(String(q.answer))}', this)" />
          <button onclick="blankSubmit(${idx}, '${this.escape(String(q.answer))}', document.getElementById('blank_${idx}'))">提交</button>
        </div>`;
        break;

      case "code":
        typeLabel = "实操编程";
        body = `<div class="q-code">${this.escapeCode(q.code || "")}</div>
        ${q.expected ? `<div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:8px">期望输出：</div><div class="q-code" style="color:var(--ok)">${this.escapeCode(q.expected)}</div>` : ""}
        <div class="code-section">
          <div class="code-btn-row">
            <button class="code-btn" data-open-btn="${idx}" onclick="openCode(${idx})">📝 在编辑器中写代码</button>
            <button class="code-btn check" data-check-btn="${idx}" onclick="checkCode(${idx})" style="display:none">🔍 检查代码</button>
            <button class="code-btn hint" onclick="showHint(${idx})">💡 提示</button>
          </div>
          <div class="code-result" data-q-card="${idx}">
            <div class="result-title"></div>
            <div class="result-diff"></div>
            <div class="result-err"></div>
          </div>
        </div>`;
        break;
    }

    return /*html*/ `<div class="q-card" data-q-card="${idx}">
      <span class="q-tag">${typeLabel} · 第 ${qNum} 题</span>
      <div class="q-text">${this.escape(q.q)}</div>
      ${body}
      <div class="feedback">
        <div class="label"></div>
        <div class="explain"></div>
      </div>
    </div>`;
  }

  private escape(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  private escapeCode(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}
