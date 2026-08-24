// Reproduce the warning by simulating all reasonable combinations
const { genBatch } = require("./out/generator.js");

const PRACTICE_COUNT = 10;
const combos = [
  // (mode, chapters[]) with empty recent hashes
  ["theory", []],
  ["code", []],
  ["all", []],
  ["theory", ["ch1"]],
  ["theory", ["ch2"]],
  ["theory", ["ch3"]],
  ["code", ["ch1"]],
  ["code", ["ch2"]],
  ["code", ["ch3"]],
  ["all", ["ch1"]],
  ["all", ["ch2"]],
  ["all", ["ch3"]],
  ["theory", ["ch1", "ch2"]],
  ["theory", ["ch2", "ch3"]],
  ["theory", ["ch1", "ch3"]],
  ["theory", ["ch1", "ch2", "ch3"]],
  ["code", ["ch2", "ch3"]],
  ["all", ["ch2", "ch3"]],
];

console.log("Testing with EMPTY recent hashes (fresh user):");
for (const [mode, chs] of combos) {
  const qs = genBatch(mode, PRACTICE_COUNT, chs, []);
  console.log(`  mode=${mode.padEnd(7)} ch=${chs.join("+") || "(all)".padEnd(8)} → ${qs.length}题`);
}
