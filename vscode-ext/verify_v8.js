// 验证 V8：模拟老师匹配 + 关卡针对性练习去重
const { askTeacher } = require("./out/teacher.js");
const { pickFromLevel, genBatch } = require("./out/generator.js");
const { findLevel } = require("./out/courses.js");

let fail = 0;

/* ── 1. 模拟老师：常见问法应命中正确知识点 ── */
const teacherCases = [
  ["我想让一段代码重复执行5次", "for 循环"],
  ["怎么判断一个数是不是偶数", "if / elif / else"],
  ["想存一堆物品名字", "列表"],
  ["想按名字取值", "字典"],
  ["想把变量放进句子里", "f-string"],
  ["想从列表里取前三个", "切片"],
  ["程序停不下来了", "死循环"],
  ["报错了有红字", "看懂报错"],
  ["想掷骰子", "random 随机"],
  ["想让玩家输入名字", "input() 输入"],
  ["想求一组数的总和", "累加器"],
  ["为什么10除2是5.0", "5.0"],
];
console.log("── 模拟老师匹配 ──");
for (const [q, expect] of teacherCases) {
  const html = askTeacher(q);
  const ok = html.includes(expect);
  if (!ok) fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  "${q}" ${ok ? "" : "→ 没命中「" + expect + "」，实际：" + (html.match(/你需要「(.+?)」/) || [])[1]}`);
}
// 空输入/胡言乱语 → fallback
const fb = askTeacher("今天天气怎么样啊");
const fbOk = fb.includes("没太听懂");
if (!fbOk) fail++;
console.log(`  ${fbOk ? "PASS" : "FAIL"}  胡言乱语 → fallback`);
const empty = askTeacher("");
const emptyOk = empty.includes("没太听懂");
if (!emptyOk) fail++;
console.log(`  ${emptyOk ? "PASS" : "FAIL"}  空输入 → fallback`);
// XSS：输入含 <script>
const xss = askTeacher("我想<script>alert(1)</script>循环");
const xssOk = !xss.includes("<script>alert");
if (!xssOk) fail++;
console.log(`  ${xssOk ? "PASS" : "FAIL"}  XSS 注入被转义`);

/* ── 2. pickFromLevel：去重优先 + 旧题补足 ── */
console.log("\n── 关卡针对性练习去重 ──");
const l6 = findLevel("l6");
const l6Hashes = q => JSON.stringify([q.type, q.q, q.code, q.expected]);

// 模拟刷完一整轮（把该关所有题都记成"做过"）
const seenAll = l6.level.questions.map(l6Hashes);
const r1 = pickFromLevel(l6.level.questions, 10, seenAll);
const ok1 = r1.questions.length === 10 && r1.freshCount === 0;
if (!ok1) fail++;
console.log(`  ${ok1 ? "PASS" : "FAIL"}  全部做过 → 仍出 10 题（复习），freshCount=${r1.freshCount}`);

// 部分做过：做过一半
const seenHalf = l6.level.questions.slice(0, 6).map(l6Hashes);
const r2 = pickFromLevel(l6.level.questions, 10, seenHalf);
const ok2 = r2.questions.length === 10 && r2.freshCount === l6.level.questions.length - 6;
if (!ok2) fail++;
console.log(`  ${ok2 ? "PASS" : "FAIL"}  做过 6/12 → 剩 6 新题全出 + 4 复习，freshCount=${r2.freshCount}`);

// 新关卡：全没做过
const r3 = pickFromLevel(l6.level.questions, 10, []);
const ok3 = r3.questions.length === 10 && r3.freshCount === 10;
if (!ok3) fail++;
console.log(`  ${ok3 ? "PASS" : "FAIL"}  全新 → 10 题全新，freshCount=${r3.freshCount}`);

/* ── 3. 变式题补足链路：原题只有 N 道、新题用完时 genBatch 补 ── */
console.log("\n── 变式题补足 ──");
// 极端：一关只有 12 题，全做过 → pickFromLevel 只能给复习题
// 真实 handler 会在 qs.length < 10 时补变式题；这里验证 genBatch 补的部分不与原题重复
const ch2Level = findLevel("l6");
const seenAllL6 = ch2Level.level.questions.map(q => JSON.stringify([q.type, q.q, q.code, q.expected]));
const variant = genBatch("all", 3, "ch2", seenAllL6);
const variantOk = variant.length === 3 && !variant.some(q => seenAllL6.includes(JSON.stringify([q.type, q.q, q.code, q.expected])));
if (!variantOk) fail++;
console.log(`  ${variantOk ? "PASS" : "FAIL"}  变式题 3 道且与原题零重复（实际 ${variant.length} 道）`);

console.log(`\n${fail === 0 ? "✅ 全部通过" : `❌ 失败 ${fail} 处`}`);
process.exit(fail === 0 ? 0 : 1);
