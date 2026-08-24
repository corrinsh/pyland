/**
 * PyLand 模拟老师 —— 本地知识库匹配
 * 用户描述"想实现什么效果"，按关键词匹配知识点，返回：
 * 知识点名 + 在哪章学到（或预告）+ 语法模板 + 最小示例 + 练习建议
 */

interface TeacherEntry {
  keywords: string[];
  title: string;
  chapter: string;          // "📖 第二章「岔路抉择」学过" / "🔭 还没学到，先用起来"
  syntax: string;
  example: string;
  tip: string;
}

const ENTRIES: TeacherEntry[] = [
  {
    keywords: ["循环", "重复", "多次", "遍历", "挨个", "每个", "一批", "逐个"],
    title: "for 循环 + range",
    chapter: "📖 第二章「岔路抉择」学过",
    syntax: "for 变量 in range(起点, 终点, 步长):\n    要重复做的事",
    example: "for i in range(1, 6):\n    print(f\"第 {i} 次巡逻\")",
    tip: "range(1, 6) 是 1~5（不含 6）。想让每行不同，把变化的值用变量 i 掺进 print 里。",
  },
  {
    keywords: ["while", "只要", "直到", "一直", "不停", "条件循环", "满足时"],
    title: "while 循环",
    chapter: "📖 第二章「岔路抉择」学过",
    syntax: "while 条件:\n    条件成立时反复做的事\n    （记得在循环里改变条件用的变量！）",
    example: "hp = 100\nwhile hp > 0:\n    print(f\"血量 {hp}\")\n    hp = hp - 30",
    tip: "死循环九成是忘了在循环里改变条件变量。写 while 先想清楚：什么变量在变、什么时候条件变假。",
  },
  {
    keywords: ["跳出", "退出循环", "停止循环", "中断", "break", "跳过", "continue"],
    title: "break / continue",
    chapter: "📖 第二章「岔路抉择」学过",
    syntax: "break     # 立刻结束整个循环\ncontinue  # 跳过这一轮，进入下一轮",
    example: "for i in range(1, 10):\n    if i == 5:\n        break      # 到 5 就停\n    print(i)",
    tip: "break 是「整个循环不玩了」，continue 是「这轮跳过，下一轮继续」。别混。",
  },
  {
    keywords: ["判断", "如果", "条件", "不然", "否则", "分支", "elif", "分情况"],
    title: "if / elif / else",
    chapter: "📖 第二章「岔路抉择」学过",
    syntax: "if 条件1:\n    ...\nelif 条件2:\n    ...\nelse:\n    ...",
    example: "score = 85\nif score >= 90:\n    print(\"优秀\")\nelif score >= 60:\n    print(\"及格\")\nelse:\n    print(\"重修\")",
    tip: "elif 可以叠很多层，从上往下挨个检查，命中一个就跳过剩下全部。顺序很重要：把最严的条件放最前面。",
  },
  {
    keywords: ["并且", "或者", "同时", "and", "or", "not", "都不"],
    title: "逻辑运算符 and / or / not",
    chapter: "📖 第二章「岔路抉择」学过",
    syntax: "if a > 0 and b > 0:   # 两个都得成立\nif a > 0 or b > 0:    # 有一个成立就行\nif not flag:          # 反过来",
    example: "age = 20\nvip = True\nif age >= 18 and vip:\n    print(\"欢迎入场\")",
    tip: "and 是「都要」，or 是「任一」，not 是「取反」。复杂条件先小声念一遍人话再写。",
  },
  {
    keywords: ["打印", "输出", "显示", "屏幕", "print", "展示"],
    title: "print 输出",
    chapter: "📖 第一章「初入小镇」学过",
    syntax: "print(\"内容\")\nprint(变量)\nprint(\"内容\", 变量)   # 逗号隔开，空格连接",
    example: "name = \"Corrin\"\nprint(\"你好\", name)",
    tip: "引号里的是原样文字，不带引号的是变量/数字。想打印多个东西用逗号，想拼接用 f-string（第三章学）。",
  },
  {
    keywords: ["变量", "存起来", "赋值", "记住", "保存一个值"],
    title: "变量",
    chapter: "📖 第一章「初入小镇」学过",
    syntax: "名字 = 值      # 等号是「存进去」不是「相等」",
    example: "gold = 100\ngold = gold + 50   # 取旧的加 50 再存回去\nprint(gold)        # 150",
    tip: "等号右边先算完，再存进左边的变量。gold = gold + 50 的意思是「在原来的基础上加」，不是数学等式。",
  },
  {
    keywords: ["计算", "加减乘除", "除法", "余数", "整除", "取余", "%", "//"],
    title: "算术运算符 / // %",
    chapter: "📖 第一章「初入小镇」学过",
    syntax: "7 / 2   # 3.5（真除法，带小数）\n7 // 2  # 3  （整除，砍掉小数）\n7 % 2   # 1   （余数）",
    example: "candy = 10\nkids = 3\nprint(f\"每人 {candy // kids} 颗\")\nprint(f\"剩 {candy % kids} 颗\")",
    tip: "判断奇偶用 n % 2：结果是 0 是偶数，是 1 是奇数。Python 的 / 永远出小数（10/2 是 5.0），要整数用 //。",
  },
  {
    keywords: ["字符串", "文字", "拼接", "引号", "文本", "拼接字符串"],
    title: "字符串操作",
    chapter: "📖 第一章学过基础，第三章「百宝行囊」有进阶",
    syntax: "\"a\" + \"b\"    # 拼接\n\"ab\" * 3     # 重复 3 遍\nlen(\"abc\")   # 长度 3",
    example: "line = \"-\" * 20\nprint(line)\nprint(\"总长:\", len(\"PyLand\"))",
    tip: "数字 + 数字是加法，字符串 + 字符串是拼接，数字 + 字符串直接报错——得先 str(数字) 或用 f-string。",
  },
  {
    keywords: ["列表", "多个值", "一组", "清单", "数组", "list", "装一堆"],
    title: "列表 list",
    chapter: "📖 第三章「百宝行囊」学过",
    syntax: "bag = [\"剑\", \"药水\", \"地图\"]   # 方括号 + 逗号\nbag.append(\"火把\")              # 追加\nlen(bag)                        # 数量",
    example: "bag = [\"剑\", \"药水\"]\nbag.append(\"火把\")\nprint(bag)\nprint(f\"共 {len(bag)} 件\")",
    tip: "列表是「一个口袋装一堆东西」，可增可删可改。想按名字取值用字典，想按顺序取值用列表。",
  },
  {
    keywords: ["下标", "索引", "取第", "第一个", "最后一个", "第几个"],
    title: "列表下标访问",
    chapter: "📖 第三章「百宝行囊」学过",
    syntax: "lst[0]    # 第一个（从 0 数！）\nlst[-1]   # 最后一个\nlst[2]    # 第三个",
    example: "bag = [\"剑\", \"药水\", \"地图\"]\nprint(bag[0])   # 剑\nprint(bag[-1])  # 地图",
    tip: "下标从 0 开始数，第一个是 [0]。负数从后往前：[-1] 最后一个，[-2] 倒数第二个。超范围会报 IndexError。",
  },
  {
    keywords: ["切片", "取一段", "中间几个", "前三个", "后两个", "截取"],
    title: "切片 slice",
    chapter: "📖 第三章「百宝行囊」学过",
    syntax: "lst[1:3]   # 下标 1 到 2（含头不含尾）\nlst[:2]    # 开头到下标 1\nlst[-2:]   # 最后两个",
    example: "nums = [10, 20, 30, 40, 50]\nprint(nums[1:4])   # [20, 30, 40]\nprint(nums[:2])    # [10, 20]",
    tip: "口诀「含头不含尾」。lst[1:3] 拿到的是下标 1 和 2，共 3-1=2 个。字符串也能切片，规则一样。",
  },
  {
    keywords: ["追加", "添加", "往列表加", "append", "加入"],
    title: "列表追加 append",
    chapter: "📖 第三章「百宝行囊」学过",
    syntax: "lst.append(新元素)   # 加到末尾",
    example: "team = [\"战士\"]\nteam.append(\"法师\")\nprint(team)   # ['战士', '法师']",
    tip: "append 一次只加一个，加在末尾。想插到指定位置用 insert(位置, 元素)，想合并整个列表用 extend 或 +。",
  },
  {
    keywords: ["删除", "去掉", "移除", "remove", "pop", "del"],
    title: "列表删除",
    chapter: "📖 第三章「百宝行囊」学过",
    syntax: "lst.remove(值)   # 按值删（只删第一个）\nlst.pop()        # 删末尾并返回它\ndel lst[0]       # 按下标删",
    example: "bag = [\"剑\", \"烂盾\", \"药水\"]\nbag.remove(\"烂盾\")\nprint(bag)   # ['剑', '药水']",
    tip: "remove 找不到值会报 ValueError。想安全删：先 if 值 in lst: 再 remove。",
  },
  {
    keywords: ["字典", "键值", "标签", "对应", "映射", "dict", "按名字取"],
    title: "字典 dict",
    chapter: "📖 第三章「百宝行囊」学过",
    syntax: "hero = {\"name\": \"Corrin\", \"hp\": 100}\nhero[\"hp\"]       # 按键取值\nhero[\"mp\"] = 50  # 新增/修改",
    example: "hero = {\"name\": \"Corrin\", \"hp\": 100}\nhero[\"hp\"] = hero[\"hp\"] - 30\nprint(hero[\"hp\"])   # 70",
    tip: "列表按位置取（下标），字典按名字取（键）。键不存在会报 KeyError——先 if \"键\" in hero: 检查。",
  },
  {
    keywords: ["遍历字典", "字典循环", "拿出键值", "items", "for 字典"],
    title: "遍历字典 items()",
    chapter: "📖 第三章「百宝行囊」学过",
    syntax: "for 键, 值 in 字典.items():\n    ...",
    example: "bag = {\"药水\": 3, \"火把\": 2}\nfor name, count in bag.items():\n    print(f\"{name} x{count}\")",
    tip: "只想要键用 .keys()，只想要值用 .values()。items() 是一把抓。",
  },
  {
    keywords: ["格式化", "f-string", "嵌入变量", "填入", "f\"", "插值", "放进句子", "塞进", "嵌进句子", "带变量的句子"],
    title: "f-string 格式化",
    chapter: "📖 第三章「百宝行囊」学过",
    syntax: "f\"文字 {变量} 文字\"   # 引号前加 f，变量塞进花括号",
    example: "name = \"Corrin\"\nhp = 70\nprint(f\"{name} 的血量：{hp}\")",
    tip: "花括号里可以放表达式：f\"合计 {12 + 30} 元\"。比 + 拼接省事，数字不用 str() 转换。",
  },
  {
    keywords: ["求和", "累加", "计数", "统计", "的总和", "加起来", "求一批数", "数的总和"],
    title: "累加器模式",
    chapter: "📖 第二章「岔路抉择」学过（for + 变量）",
    syntax: "total = 0\nfor x in 一堆数:\n    total = total + x   # 每轮加进去",
    example: "nums = [10, 20, 30]\ntotal = 0\nfor n in nums:\n    total += n\nprint(total)   # 60",
    tip: "累加器要在循环【外面】先归零。total += n 是 total = total + n 的缩写。数满足条件的个数也用这招：if 成立时 count += 1。",
  },
  {
    keywords: ["最大", "最小", "找最", "比较大小", "max", "min"],
    title: "找最大/最小",
    chapter: "🔭 还没学到，先用起来",
    syntax: "max(一堆数)   # 最大\nmin(一堆数)   # 最小\nmax(lst)      # 列表直接喂",
    example: "nums = [10, 55, 3, 78, 42]\nprint(max(nums))   # 78\nprint(min(nums))   # 3",
    tip: "想自己写：设 champion = 第一个，循环里 if n > champion: champion = n。这是打擂台思路，面试都爱问。",
  },
  {
    keywords: ["输入", "键盘", "input", "用户输入", "让玩家输入", "问答"],
    title: "input() 输入",
    chapter: "🔭 还没学到，先用起来",
    syntax: "名字 = input(\"提示语\")   # 返回的是【字符串】！",
    example: "name = input(\"你叫什么？\")\nprint(f\"欢迎，{name}！\")\n\n# 要数字必须转：\nage = int(input(\"几岁？\"))",
    tip: "input 拿到的永远是字符串，哪怕用户输的是数字。要算术先 int() 或 float() 转换，不然 \"5\" + 5 会报错。",
  },
  {
    keywords: ["随机", "骰子", "抽一个", "random", "碰运气", "随机数"],
    title: "random 随机",
    chapter: "🔭 还没学到，先用起来",
    syntax: "import random\nrandom.randint(1, 6)      # 1~6 整数（两头都含）\nrandom.choice(列表)       # 随机挑一个",
    example: "import random\ndice = random.randint(1, 6)\nprint(f\"掷出了 {dice} 点\")",
    tip: "import 要写在文件最上面。randint(1, 6) 和 range(1, 6) 不一样：randint 两头都含，range 不含尾巴。",
  },
  {
    keywords: ["函数", "封装", "定义自己的", "重复使用", "def", "造一个工具"],
    title: "函数 def",
    chapter: "🔭 还没学到，先用起来",
    syntax: "def 函数名(参数):\n    干活\n    return 结果",
    example: "def add_hp(hero, n):\n    hero[\"hp\"] = hero[\"hp\"] + n\n    return hero[\"hp\"]\n\nprint(add_hp({\"hp\": 50}, 30))   # 80",
    tip: "函数是「先造工具，再反复用」。参数是原料，return 是成品。没有 return 就返回 None。",
  },
  {
    keywords: ["排序", "从小到大", "从大到小", "sort", "sorted", "排名"],
    title: "排序 sort / sorted",
    chapter: "🔭 还没学到，先用起来",
    syntax: "lst.sort()          # 原地排序（改自己）\nsorted(lst)         # 返回新列表（不改原）\nlst.sort(reverse=True)  # 从大到小",
    example: "nums = [30, 10, 55, 5]\nnums.sort()\nprint(nums)   # [5, 10, 30, 55]",
    tip: "sort() 改原列表没返回值，sorted() 返回新列表不改原——别写 nums = nums.sort()，会变 None。",
  },
  {
    keywords: ["报错", "红字", "错误", "error", "syntaxerror", "nameerror", "indentationerror", "typeerror", "崩了"],
    title: "看懂报错",
    chapter: "🧭 通用技能",
    syntax: "SyntaxError: 语法写错（缺冒号/引号没闭合）\nNameError: 用了没定义的变量（检查拼写）\nTypeError: 类型不对（字符串+数字）\nIndentationError: 缩进不对（统一 4 空格）",
    example: "# NameError 例子\nprint(nmae)   # 拼错了，应为 name",
    tip: "报错最后一行是重点：错误类型 + 原因。往上找 ^ 指的位置就是出错的那行。先看类型，再看出错行号。",
  },
  {
    keywords: ["死循环", "停不下来", "卡住", "跑不完", "一直输出"],
    title: "死循环急救",
    chapter: "📖 第二章「岔路抉择」相关",
    syntax: "while True:\n    ...\n    if 该停了:\n        break   # 给它一个出口！",
    example: "hp = 100\nwhile True:\n    print(f\"血量 {hp}\")\n    hp -= 30\n    if hp <= 0:\n        print(\"倒下\")\n        break",
    tip: "Ctrl+C 能强行停掉终端里跑飞的程序。写 while 先确认：循环里至少有一个变量在朝「条件变假」的方向变。",
  },
  {
    keywords: ["小数", "浮点", "5.0", ".0", "除法出来小数"],
    title: "为什么 10/2 是 5.0",
    chapter: "📖 第一章「初入小镇」学过",
    syntax: "10 / 2    # 5.0  —— / 永远给小数\n10 // 2   # 5    —— 要整数用 //\nint(5.0)  # 5    —— 或者转成 int",
    example: "print(10 / 2)    # 5.0\nprint(10 // 2)   # 5\nprint(int(10 / 2))  # 5",
    tip: "这不是 bug，是 Python 的设计：/ 表示「真除法」。判题比对输出时特别注意 5 和 5.0 不一样。",
  },
];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 匹配打分：命中一个关键词 +1，越长命中再 +1 */
function score(input: string, entry: TeacherEntry): number {
  const lower = input.toLowerCase();
  let s = 0;
  for (const kw of entry.keywords) {
    if (lower.includes(kw.toLowerCase())) {
      s += 1;
      if (kw.length >= 3) s += 1;
    }
  }
  return s;
}

const FALLBACK = `
<div class="t-reply">
  <div class="t-head">🤔 老师没太听懂，换个说法试试</div>
  <div class="t-chapter">🧭 通用建议</div>
  <div class="t-body">试试在描述里带上这些词，老师就能对上号：<br>
  <b>循环 / 判断 / 列表 / 字典 / 切片 / 变量 / 累加 / 输入 / 随机 / 函数 / 排序 / 报错 / f-string / 遍历</b></div>
  <div class="t-tip">💡 万能拆解法：把你想做的事用中文写成 3 步，每步对应一行代码——通常第 1 步是准备数据（变量/列表），第 2 步是处理（循环/判断），第 3 步是 print 出结果。</div>
</div>`;

/** 主入口：用户输入 → HTML 回复 */
export function askTeacher(input: string): string {
  const text = (input || "").trim();
  if (!text) return FALLBACK;

  let best: TeacherEntry | null = null;
  let bestScore = 0;
  for (const e of ENTRIES) {
    const s = score(text, e);
    if (s > bestScore) {
      bestScore = s;
      best = e;
    }
  }
  if (!best || bestScore === 0) return FALLBACK;

  const e = best;
  return `
<div class="t-reply">
  <div class="t-head">📌 你需要「${esc(e.title)}」</div>
  <div class="t-chapter">${esc(e.chapter)}</div>
  <div class="t-label">语法：</div>
  <pre class="t-code">${esc(e.syntax)}</pre>
  <div class="t-label">示例：</div>
  <pre class="t-code">${esc(e.example)}</pre>
  <div class="t-tip">💡 ${esc(e.tip)}</div>
</div>`;
}
