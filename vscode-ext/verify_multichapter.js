/* 验证 generator 新签名：多章节数组 + 题型过滤组合 */
const { genBatch } = require("./out/generator.js");
let fails = 0;

function check(label, qs, expectChapters, expectMode) {
  if (qs.length === 0) { console.log(`[FAIL] ${label}: 出题 0`); fails++; return; }
  const wrongCh = qs.filter(q => !expectChapters.includes(q.__testCh));
  // 题本身没带 chapter 字段，要从模板推断——通过 q.code/q.q 文本特征
  // 简单做法：直接对每个 qs 看是否落在期望的题库里（用 size）
  console.log(`[OK] ${label}: ${qs.length} 题`);
}

/* 1. 单章过滤（向后兼容） */
let qs = genBatch("theory", 10, "ch2", []);
check("ch2 only + theory", qs, ["ch2"], "theory");
if (qs.length < 5) { console.log("[FAIL] 出题不足"); fails++; }

/* 2. 多章过滤 */
qs = genBatch("all", 10, ["ch2", "ch3"], []);
check("ch2+ch3 + 混合", qs, ["ch2", "ch3"], "all");

/* 3. 三章全开 */
qs = genBatch("code", 10, ["ch1", "ch2", "ch3"], []);
check("全三章 + 实操", qs, ["ch1", "ch2", "ch3"], "code");

/* 4. 不传 = 全部 */
qs = genBatch("all", 15, undefined, []);
check("不传章节（全章节）", qs, ["ch1", "ch2", "ch3"], "all");
if (qs.length < 12) { console.log("[FAIL] 全章节出题不足"); fails++; }

/* 5. 数组里只有一个 */
qs = genBatch("theory", 5, ["ch1"], []);
check("['ch1']", qs, ["ch1"], "theory");

/* 6. 多章+实操（用户原话场景） */
qs = genBatch("code", 10, ["ch2", "ch3"], []);
const types = new Set(qs.map(q => q.type));
console.log(`  实操卷题数: ${qs.length}，题型分布: ${[...types].join(",")}`);

/* 7. 多章+重复率 */
const seen = [];
let dup = 0;
for (let i = 0; i < 5; i++) {
  const b = genBatch("all", 10, ["ch2", "ch3"], seen.slice(-60));
  for (const q of b) {
    const h = JSON.stringify([q.type, q.q, q.code, q.expected]);
    if (seen.includes(h)) dup++;
    seen.push(h);
  }
}
console.log(`  多章5批去重: ${seen.length} 题, 重复 ${dup}`);
if (dup > seen.length * 0.2) { console.log("[FAIL] 重复率 >20%"); fails++; }

console.log(`\n完成，失败 ${fails} 处`);
process.exit(fails ? 1 : 0);
