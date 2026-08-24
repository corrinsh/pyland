# PyLand - Python 冒险学院

零基础 Python 游戏化学习，集成在 VS Code 里。

## 功能

- 侧边栏章节地图，关卡线性解锁
- 每关包含：故事引入、修行讲义、选择题/预测题/判断题/填空题/实操编程
- 实操编程题在 VS Code 真编辑器中写代码，一键检查输出
- 进度持久化（XP、星星、通关记录、连续修炼天数）
- 支持导出/导入进度 JSON

## 使用

1. 打开 VS Code，左侧活动栏点击 PyLand 图标
2. 点击关卡开始学习
3. 实操题点击「在编辑器中写代码」按钮，在打开的 .py 文件中写代码
4. 写完保存，点击「检查代码」按钮或用命令面板 `PyLand: 检查代码`
5. 系统自动运行你的 Python 代码并对比输出

## 配置

- `pyland.pythonPath`: Python 解释器路径（默认从 PATH 找 python）
- `pyland.exerciseDir`: 练习文件存放文件夹名（默认 pyland-exercises）
