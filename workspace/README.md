# 🐉 PyLand 冒险工坊

这是你的 Python 学习工作区。打开 VS Code 后，按下面三种方式进入 PyLand：

## 三种入口（任意选一）

### 🥇 推荐：点左下角状态栏
VS Code 窗口**最底部**有一行小字 + 按钮，你应该看到：
```
🐉 章节地图 | $(check) 检查代码 | $(sparkle) PyLand · Lv.X · X XP
```
**直接点「🐉 章节地图」**→ 侧边栏立刻打开章节树。

### 🥈 命令面板（万金油）
按 **Ctrl+Shift+P** → 输入 `pyland` → 选 `PyLand: 打开章节地图`

### 🥉 左侧活动栏
VS Code 最左边那一列竖着的图标里，找一个**龙形 SVG**图标（可能折叠在 `...` 里）。点击它 → 章节地图打开。

## 实操题流程
1. 左侧章节树选一个关卡 → 右侧出现题目面板
2. 看到题目后，点面板里的「📝 在编辑器中写代码」→ 中间出现一个 .py 文件
3. 在真 VS Code 编辑器里写代码（高亮/补全/真实报错全有）
4. **Ctrl+S 保存** → 自动检查，1 秒后右侧面板告诉你对错

## 配置
- Python：`pyland.pythonPath` 设置 → 默认从系统 PATH 取 `python`
- 练习文件目录：`pyland.exerciseDir` → 默认 `pyland-exercises/`

## 重置 / 导入 / 导出
命令面板搜 PyLand：
- `PyLand: 重置存档`
- `PyLand: 导出进度为 JSON`
- `PyLand: 从 JSON 导入进度`

开始冒险吧！🌱
