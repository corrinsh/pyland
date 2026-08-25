import * as vscode from "vscode";
import { COURSES } from "./courses";
import { CHAPTER_INTROS } from "./tutorials";

/* ═══════════════════════════════════════════════════════════
   轻量 Markdown 渲染器（自研，无外部依赖）
   支持：标题 #~#### / 代码块 ``` / 行内代码 ` / 粗体 **
        表格 | | / 无序列表 - / 有序列表 1. / 引用 > / 分隔线 ---
   ═══════════════════════════════════════════════════════════ */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 行内标记：先抽 `code` → 转义 → **bold** → 放回 code */
function renderInline(s: string): string {
  const codes: string[] = [];
  let text = s.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push("<code>" + escapeHtml(c) + "</code>");
    return "\x00" + (codes.length - 1) + "\x00";
  });
  text = escapeHtml(text);
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\x00(\d+)\x00/g, (_m, i: string) => codes[parseInt(i, 10)]);
  return text;
}

export function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  let para: string[] = [];

  const flushPara = (): void => {
    if (para.length > 0) {
      out.push("<p>" + renderInline(para.join(" ")) + "</p>");
      para = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    // 代码块
    if (t.startsWith("```")) {
      flushPara();
      i++;
      const code: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        code.push(lines[i]);
        i++;
      }
      i++; // 跳过收尾 ```
      out.push("<pre><code>" + escapeHtml(code.join("\n")) + "</code></pre>");
      continue;
    }

    // 空行
    if (t === "") {
      flushPara();
      i++;
      continue;
    }

    // 标题
    const h = t.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushPara();
      const n = h[1].length;
      out.push(`<h${n}>` + renderInline(h[2]) + `</h${n}>`);
      i++;
      continue;
    }

    // 分隔线
    if (/^(-{3,}|\*{3,})$/.test(t)) {
      flushPara();
      out.push("<hr>");
      i++;
      continue;
    }

    // 表格：当前行 | 开头，下一行是 |---|---|
    if (t.startsWith("|") && i + 1 < lines.length && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1].trim())) {
      flushPara();
      const parseRow = (l: string): string[] =>
        l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
      const heads = parseRow(lines[i]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(parseRow(lines[i]));
        i++;
      }
      out.push('<table><thead><tr>' + heads.map(x => "<th>" + renderInline(x) + "</th>").join("") + "</tr></thead><tbody>");
      for (const r of rows) {
        out.push("<tr>" + r.map(x => "<td>" + renderInline(x) + "</td>").join("") + "</tr>");
      }
      out.push("</tbody></table>");
      continue;
    }

    // 引用块
    if (t.startsWith(">")) {
      flushPara();
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quote.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      out.push("<blockquote><p>" + renderInline(quote.join(" ")) + "</p></blockquote>");
      continue;
    }

    // 无序列表
    if (/^[-*]\s+/.test(t)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push("<li>" + renderInline(lines[i].trim().replace(/^[-*]\s+/, "")) + "</li>");
        i++;
      }
      out.push("<ul>" + items.join("") + "</ul>");
      continue;
    }

    // 有序列表
    if (/^\d+\.\s+/.test(t)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push("<li>" + renderInline(lines[i].trim().replace(/^\d+\.\s+/, "")) + "</li>");
        i++;
      }
      out.push("<ol>" + items.join("") + "</ol>");
      continue;
    }

    // 普通段落（软换行合并）
    para.push(t);
    i++;
  }
  flushPara();
  return out.join("\n");
}

/* ═══════════════════════════════════════════════════════════
   讲堂 Webview 管理器
   布局：左侧章节导航（含搜索过滤）+ 右侧讲解内容 + 底部翻页
   纯讲解、不设门槛：所有章节全部可见，与关卡解锁无关
   ═══════════════════════════════════════════════════════════ */

interface TPage {
  id: string;          // "intro-ch1" | "l1"
  kind: "intro" | "level";
  levelId?: string;    // 关卡页才有 → 「去闯关」按钮
  chLabel: string;     // 所属章节 "第一章 · 初识咒语"
  navTitle: string;    // 导航栏标题（含 icon）
}

export class TutorialViewManager {
  private panel: vscode.WebviewPanel | null = null;

  constructor(private ctx: vscode.ExtensionContext) {}

  /** 打开讲堂；带 levelId 时直接定位到该关讲解 */
  openTutorial(levelId?: string): void {
    if (this.panel) {
      this.panel.reveal();
      if (levelId) {
        this.panel.webview.postMessage({ cmd: "show", id: levelId });
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "pyland.tutorial",
      "📖 知识讲堂",
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    panel.webview.html = this.generateHTML(levelId || "");
    this.panel = panel;

    panel.webview.onDidReceiveMessage(
      (msg: { cmd: string; levelId?: string }) => {
        if (msg.cmd === "openLesson" && msg.levelId) {
          vscode.commands.executeCommand("pyland.openLesson", msg.levelId);
        }
      },
      undefined,
      this.ctx.subscriptions,
    );

    panel.onDidDispose(() => {
      this.panel = null;
    });
  }

  /** 生成完整讲堂页面：全部讲解预渲染，前端零请求切换 */
  private generateHTML(initialId: string): string {
    // 页面序列：章节导览 + 各关讲解（顺序即翻页顺序）
    const pages: TPage[] = [];
    for (const ch of COURSES) {
      const chLabel = `${ch.no} · ${ch.title}`;
      pages.push({ id: `intro-${ch.id}`, kind: "intro", chLabel, navTitle: "📋 章节导览" });
      for (const lv of ch.levels) {
        pages.push({
          id: lv.id,
          kind: "level",
          levelId: lv.id,
          chLabel,
          navTitle: `${lv.icon} ${lv.title}`,
        });
      }
    }

    // 左侧导航 HTML
    const navHTML = COURSES.map(ch => {
      const introId = `intro-${ch.id}`;
      const items = [
        `<div class="nav-item" data-id="${introId}">📋 章节导览</div>`,
        ...ch.levels.map(lv =>
          `<div class="nav-item" data-id="${lv.id}">${lv.icon} ${lv.title}<span class="nav-desc">${lv.desc}</span></div>`,
        ),
      ].join("\n");
      return `<div class="chap" data-ch="${ch.id}">
  <div class="chap-head">${ch.no} · ${ch.title}<span class="chap-sub">${ch.sub}</span></div>
  <div class="chap-items">${items}</div>
</div>`;
    }).join("\n");

    // 右侧文档 HTML
    const docsHTML = COURSES.map(ch => {
      const introMd = CHAPTER_INTROS[ch.id] || `# ${ch.no} · ${ch.title}\n\n（导览待补充）`;
      const introDoc = `<section class="doc" id="doc-intro-${ch.id}">
  <div class="doc-body">${renderMarkdown(introMd)}</div>
</section>`;

      const levelDocs = ch.levels.map(lv => {
        const md = lv.tutorial || `# ${lv.title}\n\n（讲解待补充）`;
        return `<section class="doc" id="doc-${lv.id}">
  <div class="doc-body">${renderMarkdown(md)}</div>
</section>`;
      }).join("\n");

      return introDoc + "\n" + levelDocs;
    }).join("\n");

    const pagesJSON = JSON.stringify(pages);
    const initialJSON = JSON.stringify(initialId);

    return `<!DOCTYPE html>
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
    --muted: var(--vscode-descriptionForeground, #888);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    font-family: var(--vscode-font-family);
    background: var(--bg);
    color: var(--fg);
    font-size: 14px;
    line-height: 1.75;
  }
  .layout { display: flex; height: 100vh; overflow: hidden; }

  /* ── 左侧导航 ── */
  .sidebar {
    width: 250px;
    min-width: 250px;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }
  .brand {
    padding: 14px 16px 10px;
    font-size: 16px;
    font-weight: 700;
    background: linear-gradient(135deg, rgba(232,112,58,.18), rgba(108,92,231,.18));
    border-bottom: 1px solid var(--border);
  }
  .brand small { display: block; font-size: 11px; font-weight: 400; color: var(--muted); margin-top: 2px; }
  .search-box { padding: 10px 12px 6px; }
  .search-box input {
    width: 100%;
    padding: 6px 10px;
    font-size: 12px;
    color: var(--fg);
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    outline: none;
  }
  .search-box input:focus { border-color: var(--accent); }
  .nav { flex: 1; overflow-y: auto; padding: 4px 0 20px; }
  .chap-head {
    padding: 10px 14px 6px;
    font-size: 12px;
    font-weight: 700;
    color: var(--accent2);
    letter-spacing: .5px;
  }
  .chap-sub { display: block; font-size: 10px; font-weight: 400; color: var(--muted); margin-top: 1px; }
  .nav-item {
    padding: 7px 14px 7px 20px;
    font-size: 13px;
    cursor: pointer;
    border-left: 3px solid transparent;
    transition: background .12s;
  }
  .nav-item:hover { background: rgba(255,255,255,.05); }
  .nav-item.active {
    background: rgba(232,112,58,.14);
    border-left-color: var(--accent);
    font-weight: 600;
  }
  .nav-desc { display: block; font-size: 10px; color: var(--muted); }
  .nav-empty { padding: 20px 14px; font-size: 12px; color: var(--muted); text-align: center; display: none; }

  /* ── 右侧内容 ── */
  .content { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .content-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 24px;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
  }
  .crumb { font-size: 12px; color: var(--muted); }
  .crumb b { color: var(--fg); font-size: 14px; }
  .btn-play {
    padding: 5px 14px;
    font-size: 12px;
    color: #fff;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }
  .btn-play:hover { filter: brightness(1.15); }

  .docs { flex: 1; overflow-y: auto; }
  .doc { display: none; padding: 28px 36px 60px; max-width: 860px; }
  .doc.on { display: block; }

  /* ── Markdown 排版 ── */
  .doc-body h1 { font-size: 24px; margin: 8px 0 18px; padding-bottom: 10px; border-bottom: 2px solid var(--accent); }
  .doc-body h2 { font-size: 19px; margin: 30px 0 12px; color: var(--accent); }
  .doc-body h3 { font-size: 16px; margin: 22px 0 10px; color: var(--accent2); }
  .doc-body h4 { font-size: 14px; margin: 18px 0 8px; }
  .doc-body p { margin: 10px 0; }
  .doc-body hr { border: none; border-top: 1px dashed var(--border); margin: 22px 0; }
  .doc-body code {
    padding: 2px 6px;
    font-family: var(--vscode-editor-font-family, Consolas, monospace);
    font-size: 13px;
    background: var(--code-bg);
    border-radius: 4px;
    color: #e8a06a;
  }
  .doc-body pre {
    margin: 14px 0;
    padding: 14px 16px;
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow-x: auto;
  }
  .doc-body pre code { padding: 0; background: none; color: var(--fg); font-size: 13px; line-height: 1.6; }
  .doc-body blockquote {
    margin: 14px 0;
    padding: 10px 16px;
    border-left: 4px solid var(--accent2);
    background: rgba(108,92,231,.08);
    border-radius: 0 8px 8px 0;
  }
  .doc-body blockquote p { margin: 4px 0; }
  .doc-body ul, .doc-body ol { margin: 10px 0 10px 26px; }
  .doc-body li { margin: 6px 0; }
  .doc-body table { margin: 16px 0; border-collapse: collapse; width: 100%; font-size: 13px; }
  .doc-body th, .doc-body td { padding: 8px 12px; border: 1px solid var(--border); text-align: left; }
  .doc-body th { background: var(--card-bg); font-weight: 600; }
  .doc-body tr:nth-child(even) td { background: rgba(255,255,255,.025); }

  /* ── 底部翻页 ── */
  .pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 24px;
    border-top: 1px solid var(--border);
    background: var(--bg);
  }
  .pager button {
    padding: 7px 18px;
    font-size: 13px;
    color: var(--fg);
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
  }
  .pager button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .pager button:disabled { opacity: .35; cursor: default; }
  .pager-pos { font-size: 12px; color: var(--muted); }
</style>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="brand">📖 知识讲堂<small>纯讲解 · 不进关卡 · 全程无门槛</small></div>
    <div class="search-box"><input id="searchInput" type="text" placeholder="🔍 搜索关卡 / 知识点…"></div>
    <nav class="nav" id="nav">
      ${navHTML}
      <div class="nav-empty" id="navEmpty">没找到，换个关键词试试</div>
    </nav>
  </aside>
  <main class="content">
    <header class="content-head">
      <div class="crumb" id="crumb"></div>
      <button class="btn-play" id="btnPlay" style="display:none">🎮 去闯关</button>
    </header>
    <div class="docs" id="docs">
      ${docsHTML}
    </div>
    <footer class="pager">
      <button id="btnPrev">← 上一课</button>
      <span class="pager-pos" id="pagerPos"></span>
      <button id="btnNext">下一课 →</button>
    </footer>
  </main>
</div>

<script>
(function () {
  const vscode = acquireVsCodeApi();
  const PAGES = ${pagesJSON};
  const INITIAL = ${initialJSON};
  let cur = 0;

  const docsEl = document.getElementById('docs');
  const crumbEl = document.getElementById('crumb');
  const btnPlay = document.getElementById('btnPlay');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const pagerPos = document.getElementById('pagerPos');

  function show(idx) {
    if (idx < 0 || idx >= PAGES.length) return;
    cur = idx;
    const pg = PAGES[idx];
    document.querySelectorAll('.doc').forEach(d => d.classList.remove('on'));
    const doc = document.getElementById('doc-' + pg.id);
    if (doc) doc.classList.add('on');
    document.querySelectorAll('.nav-item').forEach(n =>
      n.classList.toggle('active', n.dataset.id === pg.id));
    crumbEl.innerHTML = pg.chLabel + ' &nbsp;→&nbsp; <b>' + pg.navTitle + '</b>';
    btnPlay.style.display = pg.levelId ? '' : 'none';
    btnPrev.disabled = idx <= 0;
    btnNext.disabled = idx >= PAGES.length - 1;
    pagerPos.textContent = (idx + 1) + ' / ' + PAGES.length;
    docsEl.scrollTop = 0;
    const active = document.querySelector('.nav-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  // 导航点击
  document.querySelectorAll('.nav-item').forEach(n => {
    n.addEventListener('click', () => {
      const idx = PAGES.findIndex(p => p.id === n.dataset.id);
      if (idx >= 0) show(idx);
    });
  });

  // 翻页
  btnPrev.addEventListener('click', () => show(cur - 1));
  btnNext.addEventListener('click', () => show(cur + 1));
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') show(cur - 1);
    if (e.key === 'ArrowRight') show(cur + 1);
  });

  // 去闯关
  btnPlay.addEventListener('click', () => {
    const pg = PAGES[cur];
    if (pg && pg.levelId) vscode.postMessage({ cmd: 'openLesson', levelId: pg.levelId });
  });

  // 搜索过滤
  const searchInput = document.getElementById('searchInput');
  const navEmpty = document.getElementById('navEmpty');
  searchInput.addEventListener('input', () => {
    const kw = searchInput.value.trim().toLowerCase();
    let any = false;
    document.querySelectorAll('.chap').forEach(chap => {
      let chapAny = false;
      chap.querySelectorAll('.nav-item').forEach(item => {
        const hit = !kw || item.textContent.toLowerCase().includes(kw);
        item.style.display = hit ? '' : 'none';
        if (hit) { chapAny = true; any = true; }
      });
      chap.style.display = chapAny ? '' : 'none';
    });
    navEmpty.style.display = any ? 'none' : '';
  });

  // 扩展端指令：跳到某关
  window.addEventListener('message', e => {
    if (e.data && e.data.cmd === 'show') {
      const idx = PAGES.findIndex(p => p.id === e.data.id);
      if (idx >= 0) show(idx);
    }
  });

  // 初始定位
  let start = PAGES.findIndex(p => p.id === INITIAL);
  if (start < 0) start = 0;
  show(start);
})();
</script>
</body>
</html>`;
  }
}
