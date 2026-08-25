import * as vscode from "vscode";
import { COURSES } from "./courses";
import type { ProgressManager } from "./progress";

/** 树节点类型 */
type NodeType = "chapter" | "lesson" | "arena" | "tutorial";

interface TreeNode {
  type: NodeType;
  id: string;            // chapter id or level id
  label: string;
  desc?: string;
  icon?: string;
  done?: boolean;
  locked?: boolean;
  boss?: boolean;
  stars?: number;
}

/** TreeItem wrapper */
class PyLandTreeItem extends vscode.TreeItem {
  constructor(node: TreeNode) {
    super(node.label, node.type === "chapter"
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.None);

    this.contextValue = node.type;

    if (node.type === "arena") {
      this.iconPath = new vscode.ThemeIcon("zap");
      this.description = node.desc || "";
      this.command = {
        command: "pyland.openArena",
        title: "打开训练场",
      };
      return;
    }

    if (node.type === "tutorial") {
      this.iconPath = new vscode.ThemeIcon("book");
      this.description = node.desc || "";
      this.command = {
        command: "pyland.openTutorial",
        title: "打开知识讲堂",
      };
      return;
    }

    if (node.type === "lesson") {
      // 图标状态：✓ 已过 / 🔒 未解锁 / 正常 icon
      if (node.done) {
        this.iconPath = new vscode.ThemeIcon("check", new vscode.ThemeColor("testing.iconPassed"));
      } else if (node.locked) {
        this.iconPath = new vscode.ThemeIcon("lock");
        this.description = "🔒";
      } else {
        this.description = node.desc || "";
      }
      this.tooltip = node.boss ? `Boss 战 · ${node.label}` : node.label;
      this.command = {
        command: "pyland.openLesson",
        title: "打开关卡",
        arguments: [node.id],
      };
    } else {
      this.description = node.desc || "";
    }
  }
}

/** 侧边栏树视图提供器 */
export class ChapterTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChange = new vscode.EventEmitter<TreeNode | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(private pm: ProgressManager) {}

  refresh(): void {
    this._onDidChange.fire(undefined);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return new PyLandTreeItem(element);
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      // 顶层：知识讲堂 + 训练场入口 + 章节列表
      const tutorial: TreeNode = {
        type: "tutorial",
        id: "tutorial",
        label: "📖 知识讲堂",
        desc: "纯讲解 · 不进关卡 · 全程无门槛",
      };
      const arena: TreeNode = {
        type: "arena",
        id: "arena",
        label: "🏋️ 实操训练场",
        desc: "无限出题 · 关卡练习 · 自由编码",
      };
      return [tutorial, arena, ...COURSES.map(ch => ({
        type: "chapter" as NodeType,
        id: ch.id,
        label: `${ch.no} · ${ch.title}`,
        desc: ch.locked ? ch.sub : ch.sub,
        locked: ch.locked,
      }))];
    }

    if (element.type === "chapter") {
      const ch = COURSES.find(c => c.id === element.id);
      if (!ch || ch.locked) return [];

      const allLevelIds = COURSES
        .filter(c => !c.locked)
        .flatMap(c => c.levels)
        .map(l => l.id);

      return ch.levels.map(lv => {
        const idx = allLevelIds.indexOf(lv.id);
        const prevDone = idx <= 0 || this.pm.isLevelDone(allLevelIds[idx - 1]);
        return {
          type: "lesson" as NodeType,
          id: lv.id,
          label: `${lv.icon} ${lv.title}`,
          desc: lv.desc,
          boss: lv.boss,
          done: this.pm.isLevelDone(lv.id),
          locked: !prevDone,
          stars: this.pm.getLevelProgress(lv.id)?.stars,
        };
      });
    }

    return [];
  }
}
