# -*- coding: utf-8 -*-
"""验证 PyLand VS Code 扩展第二章/第三章所有 code 题的 expected"""
import subprocess, sys, tempfile, os, io

PYTHON = r"D:\Python314\python.exe"

def norm(s):
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    lines = [l.rstrip() for l in s.split("\n")]
    return "\n".join(lines).strip("\n")

# (label, code, expected)
CASES = [
    # ---- l6 岔路口的守卫 ----
    ("l6-q10 及格", "score = 85\nif score >= 60:\n    print('及格')\nelse:\n    print('不及格')\n", "及格"),
    ("l6-q11 较大值", "a = 7\nb = 12\nif a > b:\n    print(a)\nelse:\n    print(b)\n", "12"),
    ("l6-q12 继续前进", "hp = 35\nif hp <= 30:\n    print('撤退')\nelse:\n    print('继续前进')\n", "继续前进"),
    # ---- l7 三岔路口 ----
    ("l7-q9 优秀", "score = 92\nif score >= 90:\n    print('优秀')\nelif score >= 60:\n    print('及格')\nelse:\n    print('不及格')\n", "优秀"),
    ("l7-q10 奇数", "num = 7\nif num % 2 == 0:\n    print('偶数')\nelse:\n    print('奇数')\n", "奇数"),
    ("l7-q11 精良武器", "gold = 150\nif gold >= 200:\n    print('传说武器')\nelif gold >= 100:\n    print('精良武器')\nelse:\n    print('木棍')\n", "精良武器"),
    # ---- l8 逻辑之门 ----
    ("l8-q9 状态良好", "hp = 80\nmp = 20\nif hp > 50 and mp > 10:\n    print('状态良好')\nelse:\n    print('需要恢复')\n", "状态良好"),
    ("l8-q10 欢迎入场", "ticket = False\nvip = True\nif ticket or vip:\n    print('欢迎入场')\nelse:\n    print('请购票')\n", "欢迎入场"),
    ("l8-q11 新手区", "level = 5\nif level >= 1 and level <= 10:\n    print('新手区')\nelse:\n    print('进阶区')\n", "新手区"),
    # ---- l9 回音长廊 ----
    ("l9-q10 1到5", "i = 1\nwhile i <= 5:\n    print(i)\n    i += 1\n", "1\n2\n3\n4\n5"),
    ("l9-q11 55", "total = 0\ni = 1\nwhile i <= 10:\n    total += i\n    i += 1\nprint(total)\n", "55"),
    ("l9-q12 倒计时", "n = 3\nwhile n > 0:\n    print(n)\n    n -= 1\nprint('发射！')\n", "3\n2\n1\n发射！"),
    ("l9-q13 扣血", "hp = 100\nwhile hp > 0:\n    hp -= 30\n    print(hp)\nprint('倒下')\n", "70\n40\n10\n倒下"),
    # ---- l10 Boss战 ----
    ("l10-q11 for1到5", "for i in range(1, 6):\n    print(i)\n", "1\n2\n3\n4\n5"),
    ("l10-q12 5050", "total = 0\nfor i in range(1, 101):\n    total += i\nprint(total)\n", "5050"),
    ("l10-q13 九九第一行", "for i in range(1, 10):\n    print(1 * i)\n", "1\n2\n3\n4\n5\n6\n7\n8\n9"),
    ("l10-q14 偶数", "for i in range(2, 11, 2):\n    print(i)\n", "2\n4\n6\n8\n10"),
    ("l10-q15 Boss", "hp = 50\nwhile hp > 0:\n    print('战斗中')\n    hp -= 20\nprint('胜利')\n", "战斗中\n战斗中\n胜利"),
    # ---- l11 百宝行囊 ----
    ("l11-q11 香蕉", "fruits = ['苹果', '香蕉', '橙子']\nprint(fruits[1])\n", "香蕉"),
    ("l11-q12 追加", "bag = []\nbag.append('剑')\nbag.append('盾')\nprint(bag)\n", "['剑', '盾']"),
    # ---- l12 翻找行囊 ----
    ("l12-q11 筛选", "nums = [4, 7, 2, 9, 1]\nfor n in nums:\n    if n > 3:\n        print(n)\n", "4\n7\n9"),
    ("l12-q12 求和", "nums = [4, 7, 2, 9, 1]\nprint(sum(nums))\n", "23"),
    ("l12-q13 计数", "scores = [90, 60, 85, 40]\ncount = 0\nfor s in scores:\n    if s >= 60:\n        count += 1\nprint(count)\n", "3"),
    # ---- l13 贴标签的口袋 ----
    ("l13-q11 名字血量", "hero = {'name': 'Corrin', 'hp': 100}\nprint(hero['name'])\nprint(hero['hp'])\n", "Corrin\n100"),
    ("l13-q12 扣血加键", "hero = {'hp': 100}\nhero['hp'] -= 30\nhero['mp'] = 50\nprint(hero)\n", "{'hp': 70, 'mp': 50}"),
    # ---- l14 翻遍口袋 ----
    ("l14-q11 items", "hero = {'hp': 100, 'mp': 50}\nfor k, v in hero.items():\n    print(k, v)\n", "hp 100\nmp 50"),
    ("l14-q12 队伍血量", "team = [{'name': '甲', 'hp': 100}, {'name': '乙', 'hp': 80}]\nfor m in team:\n    print(m['hp'])\n", "100\n80"),
    # ---- l15 Boss战·行囊大师 ----
    ("l15-q11 总血量", "team = [{'name': '甲', 'hp': 100}, {'name': '乙', 'hp': 80}]\ntotal = 0\nfor m in team:\n    total += m['hp']\nprint(total)\n", "180"),
    ("l15-q12 全员回血", "team = [{'name': '甲', 'hp': 100}, {'name': '乙', 'hp': 80}]\nfor m in team:\n    m['hp'] += 10\nprint(team[0]['hp'])\n", "110"),
    ("l15-q13 收集", "nums = [3, 8, 5, 12, 1]\nbig = []\nfor n in nums:\n    if n > 5:\n        big.append(n)\nprint(big)\n", "[8, 12]"),
    ("l15-q14 fstring", "hero = {'name': 'Corrin', 'hp': 100}\nprint(f\"{hero['name']}的血量是{hero['hp']}\")\n", "Corrin的血量是100"),
    ("l15-q15 终极Boss", "monster = {'hp': 100}\ncount = 0\nwhile monster['hp'] > 0:\n    monster['hp'] -= 40\n    print('攻击！')\n    count += 1\nprint('击败！')\nprint(count)\n", "攻击！\n攻击！\n攻击！\n击败！\n3"),
]

def run_case(label, code, expected):
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, encoding="utf-8") as f:
        f.write(code)
        path = f.name
    try:
        r = subprocess.run([PYTHON, path], capture_output=True, text=True, encoding="utf-8", timeout=15,
                           env={**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"})
        if r.stderr.strip():
            return False, f"STDERR: {r.stderr.strip()[:120]}"
        got = norm(r.stdout)
        exp = norm(expected)
        if got != exp:
            return False, f"exp={exp!r} got={got!r}"
        return True, ""
    finally:
        os.unlink(path)

fails = 0
for label, code, expected in CASES:
    ok, msg = run_case(label, code, expected)
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {label}" + ("" if ok else f"  →  {msg}"))
    if not ok:
        fails += 1

print(f"\n共 {len(CASES)} 题，通过 {len(CASES) - fails}，失败 {fails}")
sys.exit(1 if fails else 0)
