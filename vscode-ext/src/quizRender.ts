import type { Question } from "./types";

/* 公共题目渲染——关卡 Webview 和训练场 Webview 共用 */

export function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function escapeCode(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 单题 HTML（与 lessonView 原实现一致，供两处复用） */
export function questionHTML(q: Question, idx: number): string {
  const qNum = idx + 1;
  let typeLabel = "";
  let body = "";

  switch (q.type) {
    case "choice":
      typeLabel = "选择题";
      body = `<div class="options">
          ${q.options!.map((opt: string, i: number) =>
            `<button class="opt-btn" onclick="selectOption(${idx}, ${i}, ${q.answer as number}, this)" data-explain="${escape(q.explain)}">${escape(opt)}</button>`
          ).join("\n")}
        </div>`;
      break;

    case "predict":
      typeLabel = "预测题";
      body = `${q.code ? `<div class="q-code">${escapeCode(q.code)}</div>` : ""}
        <div class="options">
          ${q.options!.map((opt: string, i: number) =>
            `<button class="opt-btn" onclick="selectOption(${idx}, ${i}, ${q.answer as number}, this)" data-explain="${escape(q.explain)}">${escape(opt)}</button>`
          ).join("\n")}
        </div>`;
      break;

    case "judge":
      typeLabel = "判断题";
      body = `<div class="judge-row">
          <button class="opt-btn" style="flex:1" onclick="judgeAnswer(${idx}, true, ${q.answer}, this)" data-explain="${escape(q.explain)}">✓ 对</button>
          <button class="opt-btn" style="flex:1" onclick="judgeAnswer(${idx}, false, ${q.answer}, this)" data-explain="${escape(q.explain)}">✗ 错</button>
        </div>`;
      break;

    case "blank":
      typeLabel = "填空题";
      body = `${q.code ? `<div class="q-code">${escapeCode(q.code)}</div>` : ""}
        <div class="blank-input">
          <input type="text" id="blank_${idx}" placeholder="输入答案…" onkeydown="if(event.key==='Enter')blankSubmit(${idx}, '${escape(String(q.answer))}', this)" />
          <button onclick="blankSubmit(${idx}, '${escape(String(q.answer))}', document.getElementById('blank_${idx}'))">提交</button>
        </div>`;
      break;

    case "code":
      typeLabel = "实操编程";
      body = `<div class="q-code">${escapeCode(q.code || "")}</div>
        ${q.expected ? `<div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:8px">期望输出：</div><div class="q-code" style="color:var(--ok)">${escapeCode(q.expected)}</div>` : ""}
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
      <div class="q-text">${escape(q.q)}</div>
      ${body}
      <div class="feedback">
        <div class="label"></div>
        <div class="explain"></div>
      </div>
    </div>`;
}

/** Webview 端答题脚本（关卡/练习共用；finishLevel/goNext 按钮不存在时不触发） */
export function quizScript(): string {
  return /*js*/ `
const vscode = acquireVsCodeApi();

function markAnswered(qIdx, correct) {
  vscode.postMessage({ cmd: 'answer', qIdx, correct, picked: '' });
  if (typeof window.__pylandOnAnswer === 'function') window.__pylandOnAnswer(qIdx, correct);
}

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

function blankSubmit(qIdx, answer, input) {
  const val = input.value.trim();
  const card = input.closest('.q-card');
  const fb = card.querySelector('.feedback');
  const correct = val.toLowerCase() === String(answer).toLowerCase();
  fb.className = 'feedback ' + (correct ? 'ok' : 'bad');
  fb.querySelector('.label').textContent = correct ? '✓ 答对了！' : '✗ 答错了';
  fb.querySelector('.explain').textContent = '正确答案：' + answer;
  markAnswered(qIdx, correct);
}

function openCode(qIdx) {
  vscode.postMessage({ cmd: 'openCode', qIdx });
}

function checkCode(qIdx) {
  vscode.postMessage({ cmd: 'checkCode', qIdx });
}

function showHint(qIdx) {
  vscode.postMessage({ cmd: 'hint', qIdx });
}

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
});
`;
}

/** Webview 公共 CSS（关卡/练习共用） */
export function quizCSS(): string {
  return /*css*/ `
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
    font-size: 14px; font-family: inherit; transition: all 0.15s; white-space: pre-wrap;
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
`;
}
