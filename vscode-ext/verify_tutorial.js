/* 验证 tutorialView：renderMarkdown 输出 + 讲堂页面完整性 */
const path = require("path");

// mock vscode 模块（纯 Node 环境没有）
const Module = require("module");
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "vscode") {
    return { window: {}, commands: {}, Uri: { file: (f) => f }, ViewColumn: { One: 1 } };
  }
  return origLoad.apply(this, arguments);
};

// 直接加载编译产物 out/tutorialView.js（CommonJS）
const tv = require(path.join(__dirname, "out", "tutorialView.js"));
const { COURSES } = require(path.join(__dirname, "out", "courses.js"));
const { CHAPTER_INTROS } = require(path.join(__dirname, "out", "tutorials.js"));

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) fail++; };

/* ── 1. Markdown 渲染器 ── */
console.log("\n[1] renderMarkdown 渲染器");
const md = [
  "# 标题一",
  "",
  "普通**加粗**和 `inline code` 段落。",
  "",
  "```python",
  "print(\"你好\")  # <b>不会被解析</b>",
  "```",
  "",
  "| a | b |",
  "|---|---|",
  "| 1 | `x` |",
  "",
  "- 项目一",
  "- 项目二",
  "",
  "1. 第一",
  "2. 第二",
  "",
  "> 引用内容",
  "",
  "---",
  "",
  "结尾段落",
].join("\n");

const html = tv.renderMarkdown(md);
ok(html.includes("<h1>标题一</h1>"), "h1 标题");
ok(html.includes("<strong>加粗</strong>"), "粗体");
ok(html.includes("<code>inline code</code>"), "行内代码");
ok(html.includes("&lt;b&gt;不会被解析&lt;/b&gt;"), "代码块内 HTML 已转义");
ok(html.includes("<th>a</th>") && html.includes("<td><code>x</code></td>"), "表格 + 单元格行内代码");
ok(html.includes("<ul><li>项目一</li><li>项目二</li></ul>"), "无序列表");
ok(html.includes("<ol><li>第一</li><li>第二</li></ol>"), "有序列表");
ok(html.includes("<blockquote>"), "引用块");
ok(html.includes("<hr>"), "分隔线");
ok(!html.includes("\x00"), "无残留占位符");

/* ── 2. 数据层完整性 ── */
console.log("\n[2] 讲堂数据层");
const allLevels = COURSES.flatMap(c => c.levels);
ok(allLevels.length === 15, `15 关齐全（当前 ${allLevels.length}）`);
const withTutorial = allLevels.filter(l => l.tutorial && l.tutorial.length > 100);
ok(withTutorial.length === 15, `每关都有 tutorial（当前 ${withTutorial.length}/15）`);
ok(Object.keys(CHAPTER_INTROS).length === 3, "3 个章节导览齐全");

/* ── 3. 渲染真实讲义 ── */
console.log("\n[3] 真实讲义渲染（15 关全查）");
let minLen = Infinity;
for (const lv of allLevels) {
  const h = tv.renderMarkdown(lv.tutorial);
  const bad = h.includes("\x00") || h.includes("[object") || h.length < 200;
  if (bad) { ok(false, `${lv.id} 渲染异常`); }
  minLen = Math.min(minLen, lv.tutorial.length);
}
ok(true, "15 关讲义全部渲染无异常");
const l1html = tv.renderMarkdown(allLevels[0].tutorial);
ok(l1html.includes("<table>"), "l1 报错速查表渲染为表格");
ok(l1html.split("<h2>").length >= 10, `l1 小节数量充足（${l1html.split("<h2>").length - 1} 个 h2）`);
ok(minLen > 3000, `全部 15 关均为超详细版（最短 ${minLen} 字符）`);

console.log(fail === 0 ? "\n全部通过 ✅" : `\n${fail} 项失败 ❌`);
process.exit(fail === 0 ? 0 : 1);
