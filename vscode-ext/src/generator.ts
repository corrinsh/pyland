import type { Question } from "./types";

/* PyLand 无限出题器 —— 参数化模板 × 随机参数
   覆盖三章：第一章基础 / 第二章条件循环 / 第三章列表字典
   重复率控制：genHash 滚动窗口去重（avoid 最近 60 题） */

function ri(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 随机打乱数组（返回新数组） */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 造带随机正确位置的选择题 */
function mc(q: string, correct: string, wrongs: string[], code?: string, explain = ""): Question {
  const all = shuffle([correct, ...wrongs]);
  return {
    type: "predict",
    q,
    options: all,
    answer: all.indexOf(correct),
    code,
    explain,
  };
}

/* ═══════════ 第一章模板 ═══════════ */

const WORDS = ["火球", "冰锥", "闪电", "岩石", "风暴", "治愈", "护盾", "飞刃"];
const ITEMS = ["药水", "剑", "盾", "弓", "卷轴", "宝石", "钥匙"];

/** 1. 算术优先级（predict） */
function tplArith(): Question {
  const a = ri(1, 9), b = ri(2, 9), c = ri(1, 9);
  const val = a + b * c;
  return mc(
    "运行后屏幕会显示什么？",
    String(val),
    [String(a + b + c), String(a * b + c), String((a + b) * c)],
    `print(${a} + ${b} * ${c})`,
    `先乘除后加减：${b} * ${c} = ${b * c}，再加 ${a} 得 ${val}。`,
  );
}

/** 2. 变量覆盖（predict） */
function tplVarOverwrite(): Question {
  const a = ri(1, 20), b = ri(21, 60);
  return mc(
    "运行后屏幕会显示什么？",
    String(b),
    [String(a), String(a + b), "报错"],
    `x = ${a}\nx = ${b}\nprint(x)`,
    `后面一次赋值覆盖前面，箱子里最终是 ${b}。`,
  );
}

/** 3. 变量取值再算（predict） */
function tplVarCalc(): Question {
  const a = ri(5, 30), d = ri(2, 9);
  const after = a - d;
  return mc(
    "运行后屏幕会显示什么？",
    String(after),
    [String(a), String(a + d), "报错"],
    `hp = ${a}\nhp = hp - ${d}\nprint(hp)`,
    `取出 ${a} 减 ${d} 再放回，箱子里的值变成 ${after}。`,
  );
}

/** 4. 字符串重复（predict） */
function tplStrRepeat(): Question {
  const w = pick(WORDS), n = ri(2, 4);
  const rep = w.repeat(n);
  return mc(
    "运行后屏幕会显示什么？",
    rep,
    [`${w} ${n}`, w, "报错"],
    `print("${w}" * ${n})`,
    `字符串乘 ${n} 是重复 ${n} 遍：${rep}。`,
  );
}

/** 5. 整除取余（predict） */
function tplDivMod(): Question {
  const a = ri(10, 50), b = ri(3, 9);
  const q1 = Math.floor(a / b), r = a % b;
  return mc(
    "运行后屏幕会显示什么？",
    `${q1} ${r}`,
    [`${q1} ${q1}`, `${a / b}`, "报错"],
    `print(${a} // ${b})\nprint(${a} % ${b})`,
    `// 是整除（${a} 除 ${b} 商 ${q1}），% 是取余（余 ${r}）。`,
  );
}

/** 6. type 判断（choice） */
function tplType(): Question {
  const pairs: [number | string, string][] = [
    [ri(1, 99), "int"],
    [`${ri(10, 99)}.5`, "float"],
    ['"咒语"', "str"],
  ];
  const [val, t] = pick(pairs);
  return mc(
    `print(type(${val})) 会显示什么？`,
    `<class '${t}'>`,
    ["<class 'int'>", "<class 'float'>", "<class 'str'>"].filter(x => x !== `<class '${t}'>`),
    undefined,
    `${val} 的类型是 ${t}（整数 int / 小数 float / 文字 str）。`,
  );
}

/** 7. 合法变量名（choice） */
function tplVarName(): Question {
  const bad = [
    `${ri(2, 9)}level`, "my-name", "my name", "print",
  ];
  const b = pick(bad);
  return mc(
    "下面哪个是合法的变量名？",
    "level_2",
    [b, "class", `${ri(2, 9)}hp`],
    undefined,
    "合法变量名：字母/数字/下划线，不能数字开头，不能是关键字，不能有横线和空格。",
  );
}

/** 8. 字符串 vs 数字（judge） */
function tplStrNum(): Question {
  const n = ri(1, 9);
  return {
    type: "judge",
    q: `print('${n}' == ${n}) 会显示 True。`,
    answer: false,
    explain: `带引号的 '${n}' 是文字，不带引号的 ${n} 是数字——类型不同永不相等，结果是 False。`,
  };
}

/** 9. print 填空（blank） */
function tplBlankPrint(): Question {
  const w = pick(["出发", "战斗", "冒险", "开始"]);
  return {
    type: "blank",
    q: `补全咒语，让屏幕显示「${w}」`,
    code: `___("${w}")`,
    answer: "print",
    explain: "让计算机说话的咒语是 print，全小写。",
  };
}

/** 10. 实操：两行输出（code） */
function tplCodeTwoLines(): Question {
  const w1 = pick(WORDS), w2 = pick(WORDS.filter(w => w !== w1));
  return {
    type: "code",
    q: `实操：先显示「${w1}」，再显示「${w2}」（两行输出）`,
    starter: "",
    expected: `${w1}\n${w2}`,
    explain: `两个 print 各管一行：print("${w1}")、print("${w2}")。顺序反了输出也会反。`,
  };
}

/** 11. 实操：变量算术（code） */
function tplCodeVarCalc(): Question {
  const a = ri(10, 60), b = ri(2, 9);
  return {
    type: "code",
    q: `实操：dmg1 装 ${a}、dmg2 装 ${b}（已给你写好）。显示两者之和（一行输出）`,
    starter: `dmg1 = ${a}\ndmg2 = ${b}\n`,
    expected: String(a + b),
    explain: `print(dmg1 + dmg2) —— ${a} + ${b} = ${a + b}。也可以先装进 total 再显示。`,
  };
}

/** 12. 实操：字符串重复（code） */
function tplCodeStrRepeat(): Question {
  const w = pick(["哈", "冲", "打", "呀"]), n = ri(3, 5);
  return {
    type: "code",
    q: `实操：把「${w}」显示成连续 ${n} 个（一行输出，不用空格隔开）`,
    starter: "",
    expected: w.repeat(n),
    explain: `print("${w}" * ${n}) —— 字符串乘数字是重复。`,
  };
}

/* ═══════════ 第二章模板 ═══════════ */

/** 13. if/else 结果（predict） */
function tplIfElse(): Question {
  const hp = ri(5, 95), th = pick([30, 50, 60]);
  const safe = hp > th;
  return mc(
    "运行后屏幕会显示什么？",
    safe ? "安全" : "危险",
    [safe ? "危险" : "安全", "两个都显示", "报错"],
    `hp = ${hp}\nif hp > ${th}:\n    print('安全')\nelse:\n    print('危险')`,
    `${hp} > ${th} 是 ${safe}，所以走 ${safe ? "if" : "else"} 分支。`,
  );
}

/** 14. elif 链（predict） */
function tplElif(): Question {
  const score = ri(35, 99);
  const grade = score >= 90 ? "优秀" : score >= 60 ? "及格" : "不及格";
  return mc(
    "运行后屏幕会显示什么？",
    grade,
    ["优秀", "及格", "不及格"].filter(g => g !== grade).concat(["报错"]).slice(0, 3),
    `score = ${score}\nif score >= 90:\n    print('优秀')\nelif score >= 60:\n    print('及格')\nelse:\n    print('不及格')`,
    `${score} 落在「${grade}」区间——条件链从上往下，第一个成立就走。`,
  );
}

/** 15. and/or 结果（predict） */
function tplAndOr(): Question {
  const useAnd = Math.random() < 0.5;
  const a = Math.random() < 0.5, b = Math.random() < 0.5;
  const result = useAnd ? a && b : a || b;
  return mc(
    "运行后屏幕会显示什么？",
    result ? "True" : "False",
    [result ? "False" : "True", "报错", "None"],
    `print(${a} ${useAnd ? "and" : "or"} ${b})`,
    `${a} ${useAnd ? "and" : "or"} ${b}：${useAnd ? "两边都真才是真" : "一边真就是真"}，结果是 ${result}。`,
  );
}

/** 16. while 计数（predict） */
function tplWhileCount(): Question {
  const n = ri(2, 4);
  const out = Array.from({ length: n }, (_, i) => String(i + 1)).join(" ");
  return mc(
    "运行后屏幕会显示什么？",
    out,
    [Array.from({ length: n + 1 }, (_, i) => String(i + 1)).join(" "), Array.from({ length: n - 1 }, (_, i) => String(i + 1)).join(" "), "报错"],
    `i = 1\nwhile i <= ${n}:\n    print(i, end=' ')\n    i += 1`,
    `i 从 1 到 ${n}（含），每个显示后加空格不换行：${out}。`,
  );
}

/** 17. range 输出（predict） */
function tplRange(): Question {
  const a = ri(1, 3), b = a + ri(2, 4);
  const out = Array.from({ length: b - a }, (_, i) => String(a + i)).join(" ");
  return mc(
    "运行后屏幕会显示什么？",
    out,
    [Array.from({ length: b - a + 1 }, (_, i) => String(a + i)).join(" "), Array.from({ length: b - a - 1 }, (_, i) => String(a + 1 + i)).join(" "), "报错"],
    `for i in range(${a}, ${b}):\n    print(i, end=' ')`,
    `range(${a}, ${b}) 含头不含尾：${a} 到 ${b - 1}。`,
  );
}

/** 18. for 求和（predict） */
function tplForSum(): Question {
  const n = ri(3, 10);
  const sum = (n * (n + 1)) / 2;
  return mc(
    "运行后屏幕会显示什么？",
    String(sum),
    [String(n), String(sum + n), "报错"],
    `total = 0\nfor i in range(1, ${n + 1}):\n    total += i\nprint(total)`,
    `1 加到 ${n}：(${n} × ${n + 1}) ÷ 2 = ${sum}。`,
  );
}

/** 19. 实操：if 分级（code） */
function tplCodeIf(): Question {
  const score = ri(35, 99);
  const grade = score >= 90 ? "优秀" : score >= 60 ? "及格" : "不及格";
  return {
    type: "code",
    q: `实操：score 装 ${score}（已给你写好）。大于等于 90 显示「优秀」，大于等于 60 显示「及格」，否则显示「不及格」（一行输出）`,
    starter: `score = ${score}\n`,
    expected: grade,
    explain: `if score >= 90 → elif score >= 60 → else。${score} 落在「${grade}」区间。`,
  };
}

/** 20. 实操：for 数数（code） */
function tplCodeFor(): Question {
  const n = ri(3, 6);
  const out = Array.from({ length: n }, (_, i) => String(i + 1)).join("\n");
  return {
    type: "code",
    q: `实操：用 for 循环显示 1 到 ${n}（每行一个数字）`,
    starter: "",
    expected: out,
    explain: `for i in range(1, ${n + 1}): print(i)。range 含头不含尾，到 ${n} 就写 ${n + 1}。`,
  };
}

/** 21. 实操：奇偶判断（code） */
function tplCodeOddEven(): Question {
  const n = ri(10, 99);
  return {
    type: "code",
    q: `实操：num 装 ${n}（已给你写好）。能被 2 整除显示「偶数」，否则显示「奇数」（一行输出）`,
    starter: `num = ${n}\n`,
    expected: n % 2 === 0 ? "偶数" : "奇数",
    explain: `if num % 2 == 0: —— ${n} 除 2 余 ${n % 2}，${n % 2 === 0 ? "等于 0 是偶数" : "余 1 是奇数"}。`,
  };
}

/* ═══════════ 第三章模板 ═══════════ */

/** 22. 列表索引（predict） */
function tplListIndex(): Question {
  const items = shuffle(ITEMS).slice(0, 3);
  const i = ri(0, 2);
  return mc(
    "运行后屏幕会显示什么？",
    items[i],
    items.filter((_, k) => k !== i).concat(["报错"]),
    `bag = [${items.map(x => `'${x}'`).join(", ")}]\nprint(bag[${i}])`,
    `索引从 0 数起：bag[${i}] 是${i === 0 ? "第一个" : i === 1 ? "第二个" : "第三个"}「${items[i]}」。`,
  );
}

/** 23. len（predict） */
function tplListLen(): Question {
  const items = shuffle(ITEMS).slice(0, ri(2, 5));
  return mc(
    "运行后屏幕会显示什么？",
    String(items.length),
    [String(items.length - 1), String(items.length + 1), "报错"],
    `bag = [${items.map(x => `'${x}'`).join(", ")}]\nprint(len(bag))`,
    `len 数「有几样东西」——${items.length} 个。最后一个的索引是 ${items.length - 1}。`,
  );
}

/** 24. append（predict） */
function tplAppend(): Question {
  const items = shuffle(ITEMS).slice(0, 2);
  const add = pick(ITEMS.filter(x => !items.includes(x)));
  const after = [...items, add];
  return mc(
    "运行后屏幕会显示什么？",
    `[${after.map(x => `'${x}'`).join(", ")}]`,
    [`[${add}, ${items.map(x => `'${x}'`).join(", ")}]`, `[${items.map(x => `'${x}'`).join(", ")}]`, "报错"],
    `bag = [${items.map(x => `'${x}'`).join(", ")}]\nbag.append('${add}')\nprint(bag)`,
    `append 追加到最后。「${add}」排在队尾。`,
  );
}

/** 25. 切片（predict） */
function tplSlice(): Question {
  const nums = Array.from({ length: 4 }, () => ri(1, 9) * 10);
  const a = ri(0, 1), b = ri(2, 3);
  const seg = nums.slice(a, b);
  return mc(
    "运行后屏幕会显示什么？",
    `[${seg.join(", ")}]`,
    [`[${nums.slice(a, b + 1).join(", ")}]`, `[${nums.slice(a + 1, b).join(", ")}]`, "报错"],
    `nums = [${nums.join(", ")}]\nprint(nums[${a}:${b}])`,
    `切片含头不含尾：从索引 ${a} 拿到索引 ${b - 1}。`,
  );
}

/** 26. 字典访问（predict） */
function tplDictAccess(): Question {
  const hp = ri(20, 100), mp = ri(10, 60);
  const key = pick(["hp", "mp"]);
  const val = key === "hp" ? hp : mp;
  return mc(
    "运行后屏幕会显示什么？",
    String(val),
    [String(key === "hp" ? mp : hp), key, "报错"],
    `hero = {'hp': ${hp}, 'mp': ${mp}}\nprint(hero['${key}'])`,
    `字典按键名取值——'${key}' 口袋里装的是 ${val}。`,
  );
}

/** 27. items 遍历（predict） */
function tplDictItems(): Question {
  const hp = ri(20, 100), mp = ri(10, 60);
  return mc(
    "运行后屏幕会显示什么？",
    `hp ${hp}\nmp ${mp}`,
    [`hp\nmp`, `${hp}\n${mp}`, "报错"],
    `hero = {'hp': ${hp}, 'mp': ${mp}}\nfor k, v in hero.items():\n    print(k, v)`,
    `items() 每轮给一对键值，print(k, v) 逗号自动变空格。`,
  );
}

/** 28. 嵌套取值（predict） */
function tplNest(): Question {
  const atk = ri(5, 30);
  return mc(
    "运行后屏幕会显示什么？",
    String(atk),
    ["{'攻击': %d}".replace("%d", String(atk)), "武器", "报错"],
    `hero = {'武器': {'攻击': ${atk}}}\nprint(hero['武器']['攻击'])`,
    `嵌套一层层剥：先 hero['武器'] 拿到内层字典，再 ['攻击'] 拿到 ${atk}。`,
  );
}

/** 29. 实操：筛选（code） */
function tplCodeFilter(): Question {
  const nums = Array.from({ length: 5 }, () => ri(1, 20));
  const th = ri(3, 10);
  const out = nums.filter(n => n > th);
  return {
    type: "code",
    q: `实操：nums 已给你写好。用 for 循环只显示其中大于 ${th} 的数（每行一个${out.length === 0 ? "——注意这组数里没有大于阈值的，什么都不显示" : ""}）`,
    starter: `nums = [${nums.join(", ")}]\n`,
    expected: out.join("\n"),
    explain: `for n in nums: 配 if n > ${th}: print(n)。${out.length === 0 ? "这组数全没过关，所以没有输出——空输出也是正确输出。" : `过关的是 ${out.join("、")}。`}`,
  };
}

/** 30. 实操：字典显示（code） */
function tplCodeDict(): Question {
  const name = pick(["Corrin", "甲", "乙", "勇者"]);
  const hp = ri(50, 150);
  return {
    type: "code",
    q: `实操：hero 字典已给你写好（name 和 hp）。分两行：第一行显示名字，第二行显示血量数字`,
    starter: `hero = {'name': '${name}', 'hp': ${hp}}\n`,
    expected: `${name}\n${hp}`,
    explain: `print(hero['name']) 显示 ${name}（引号脱掉），print(hero['hp']) 显示 ${hp}。`,
  };
}

/** 31. 实操：求和（code） */
function tplCodeSum(): Question {
  const nums = Array.from({ length: 5 }, () => ri(1, 20));
  const sum = nums.reduce((s, n) => s + n, 0);
  return {
    type: "code",
    q: `实操：nums 已给你写好。显示这个列表的总和（一行输出）`,
    starter: `nums = [${nums.join(", ")}]\n`,
    expected: String(sum),
    explain: `print(sum(nums)) 一行搞定；或 total = 0 用 for 累加。总和是 ${sum}。`,
  };
}

/* ═══════════ 出题引擎 ═══════════ */

type Tpl = { id: string; chapter: "ch1" | "ch2" | "ch3"; kind: "theory" | "code"; gen: () => Question };

export const TEMPLATES: Tpl[] = [
  // 第一章
  { id: "arith", chapter: "ch1", kind: "theory", gen: tplArith },
  { id: "varOver", chapter: "ch1", kind: "theory", gen: tplVarOverwrite },
  { id: "varCalc", chapter: "ch1", kind: "theory", gen: tplVarCalc },
  { id: "strRep", chapter: "ch1", kind: "theory", gen: tplStrRepeat },
  { id: "divMod", chapter: "ch1", kind: "theory", gen: tplDivMod },
  { id: "type", chapter: "ch1", kind: "theory", gen: tplType },
  { id: "varName", chapter: "ch1", kind: "theory", gen: tplVarName },
  { id: "strNum", chapter: "ch1", kind: "theory", gen: tplStrNum },
  { id: "blankPrint", chapter: "ch1", kind: "theory", gen: tplBlankPrint },
  { id: "codeTwo", chapter: "ch1", kind: "code", gen: tplCodeTwoLines },
  { id: "codeVarCalc", chapter: "ch1", kind: "code", gen: tplCodeVarCalc },
  { id: "codeStrRep", chapter: "ch1", kind: "code", gen: tplCodeStrRepeat },
  // 第二章
  { id: "ifElse", chapter: "ch2", kind: "theory", gen: tplIfElse },
  { id: "elif", chapter: "ch2", kind: "theory", gen: tplElif },
  { id: "andOr", chapter: "ch2", kind: "theory", gen: tplAndOr },
  { id: "whileCount", chapter: "ch2", kind: "theory", gen: tplWhileCount },
  { id: "range", chapter: "ch2", kind: "theory", gen: tplRange },
  { id: "forSum", chapter: "ch2", kind: "theory", gen: tplForSum },
  { id: "codeIf", chapter: "ch2", kind: "code", gen: tplCodeIf },
  { id: "codeFor", chapter: "ch2", kind: "code", gen: tplCodeFor },
  { id: "codeOddEven", chapter: "ch2", kind: "code", gen: tplCodeOddEven },
  // 第三章
  { id: "listIdx", chapter: "ch3", kind: "theory", gen: tplListIndex },
  { id: "listLen", chapter: "ch3", kind: "theory", gen: tplListLen },
  { id: "append", chapter: "ch3", kind: "theory", gen: tplAppend },
  { id: "slice", chapter: "ch3", kind: "theory", gen: tplSlice },
  { id: "dictAcc", chapter: "ch3", kind: "theory", gen: tplDictAccess },
  { id: "dictItems", chapter: "ch3", kind: "theory", gen: tplDictItems },
  { id: "nest", chapter: "ch3", kind: "theory", gen: tplNest },
  { id: "codeFilter", chapter: "ch3", kind: "code", gen: tplCodeFilter },
  { id: "codeDict", chapter: "ch3", kind: "code", gen: tplCodeDict },
  { id: "codeSum", chapter: "ch3", kind: "code", gen: tplCodeSum },
];

/** 题目指纹（去重用） */
function genHash(q: Question): string {
  return JSON.stringify([q.type, q.q, q.code, q.expected]);
}

/**
 * 生成一批练习题
 * @param mode "theory" 理论 | "code" 实操 | "all" 混合
 * @param count 题数
 * @param chapterFilter 限定章节：单个 id / id 数组 / 不传 = 全部
 * @param recentHashes 最近出过的题指纹（避免重复）
 */
export function genBatch(
  mode: "theory" | "code" | "all",
  count: number,
  chapterFilter?: string | string[],
  recentHashes: string[] = [],
): Question[] {
  const chs: string[] | null = !chapterFilter
    ? null
    : Array.isArray(chapterFilter) ? chapterFilter : [chapterFilter];
  const pool = TEMPLATES.filter(t =>
    (!chs || chs.includes(t.chapter)) &&
    (mode === "all" || t.kind === mode),
  );
  if (pool.length === 0) return [];

  const seen = new Set(recentHashes);
  const out: Question[] = [];
  const usedTplCount = new Map<string, number>();
  let attempts = 0;

  while (out.length < count && attempts < count * 30) {
    attempts++;
    const tpl = pick(pool);
    // 一批内同模板最多 2 次，逼出多样性
    if ((usedTplCount.get(tpl.id) || 0) >= 2) continue;
    const q = tpl.gen();
    const h = genHash(q);
    if (seen.has(h)) continue;
    seen.add(h);
    usedTplCount.set(tpl.id, (usedTplCount.get(tpl.id) || 0) + 1);
    out.push(q);
  }
  return out;
}

/** 从指定关卡的原题里随机抽题（针对性练习用） */
export function pickFromLevel(questions: Question[], count: number): Question[] {
  const shuffled = shuffle(questions);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
