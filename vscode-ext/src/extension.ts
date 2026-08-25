import * as vscode from "vscode";
import { ChapterTreeProvider } from "./treeView";
import { LessonViewManager } from "./lessonView";
import { PracticeViewManager } from "./practiceView";
import { TutorialViewManager } from "./tutorialView";
import { ProgressManager } from "./progress";

let pm: ProgressManager;
let treeProvider: ChapterTreeProvider;
let lessonView: LessonViewManager;
let practiceView: PracticeViewManager;
let tutorialView: TutorialViewManager;

/** 扩展激活入口 */
export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  pm = new ProgressManager(ctx);
  treeProvider = new ChapterTreeProvider(pm);
  lessonView = new LessonViewManager(ctx, pm);
  practiceView = new PracticeViewManager(ctx);
  tutorialView = new TutorialViewManager(ctx);

  // 侧边栏树视图
  vscode.window.registerTreeDataProvider("pyland.chapterTree", treeProvider);

  // 命令：打开关卡
  ctx.subscriptions.push(
    vscode.commands.registerCommand("pyland.openLesson", (levelId: string) => {
      lessonView.openLesson(levelId);
    }),
  );

  // 命令：检查代码
  ctx.subscriptions.push(
    vscode.commands.registerCommand("pyland.checkCode", () => {
      lessonView.checkActiveCode();
    }),
  );

  // 命令：刷新树
  ctx.subscriptions.push(
    vscode.commands.registerCommand("pyland.refreshTree", () => {
      treeProvider.refresh();
    }),
  );

  // 命令：打开地图（聚焦侧边栏）
  ctx.subscriptions.push(
    vscode.commands.registerCommand("pyland.openMap", () => {
      vscode.commands.executeCommand("workbench.view.extension.pyland-sidebar");
      treeProvider.refresh();
    }),
  );

  // 命令：打开训练场
  ctx.subscriptions.push(
    vscode.commands.registerCommand("pyland.openArena", () => {
      practiceView.openArena();
    }),
  );

  // 命令：打开知识讲堂（可带 levelId 直接定位某关讲解）
  ctx.subscriptions.push(
    vscode.commands.registerCommand("pyland.openTutorial", (levelId?: string) => {
      tutorialView.openTutorial(levelId);
    }),
  );

  // 命令：重置存档
  ctx.subscriptions.push(
    vscode.commands.registerCommand("pyland.resetProgress", async () => {
      const choice = await vscode.window.showWarningMessage(
        "⚠️ 重置会清空全部 XP、星星和通关记录，确定？",
        { modal: true },
        "确定重置",
      );
      if (choice === "确定重置") {
        pm.reset();
        treeProvider.refresh();
        vscode.window.showInformationMessage("存档已重置，重新开始冒险吧！");
      }
    }),
  );

  // 命令：导出进度
  ctx.subscriptions.push(
    vscode.commands.registerCommand("pyland.exportProgress", async () => {
      const json = pm.exportJSON();
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`pyland-progress-${new Date().toISOString().slice(0, 10)}.json`),
        filters: { "JSON": ["json"] },
      });
      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(json, "utf8"));
        vscode.window.showInformationMessage(`进度已导出到：${uri.fsPath}`);
      }
    }),
  );

  // 命令：导入进度
  ctx.subscriptions.push(
    vscode.commands.registerCommand("pyland.importProgress", async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        filters: { "JSON": ["json"] },
      });
      if (uris && uris.length > 0) {
        const data = await vscode.workspace.fs.readFile(uris[0]);
        const ok = pm.importJSON(Buffer.from(data).toString("utf8"));
        if (ok) {
          treeProvider.refresh();
          vscode.window.showInformationMessage("进度导入成功！");
        } else {
          vscode.window.showErrorMessage("文件格式不对，导入失败。");
        }
      }
    }),
  );

  // 状态栏：XP 显示
  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  updateStatusBar(statusItem);
  statusItem.show();
  ctx.subscriptions.push(statusItem);

  // 状态栏：章节地图（最显眼入口）
  const mapItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 60);
  mapItem.text = "🐉 章节地图";
  mapItem.tooltip = "打开 PyLand 章节地图（点这个按钮）";
  mapItem.command = "pyland.openMap";
  mapItem.show();
  ctx.subscriptions.push(mapItem);
  ctx.subscriptions.push({ dispose: () => mapItem.dispose() });

  // 状态栏：知识讲堂
  const tutorialItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 55);
  tutorialItem.text = "$(book) 知识讲堂";
  tutorialItem.tooltip = "打开 PyLand 知识讲堂：全部知识点纯讲解，不进关卡也能看";
  tutorialItem.command = "pyland.openTutorial";
  tutorialItem.show();
  ctx.subscriptions.push(tutorialItem);
  ctx.subscriptions.push({ dispose: () => tutorialItem.dispose() });

  // 状态栏：检查代码
  const checkItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 40);
  checkItem.text = "$(check) 检查代码";
  checkItem.tooltip = "检查当前 .py 文件是否通关";
  checkItem.command = "pyland.checkCode";
  checkItem.show();
  ctx.subscriptions.push(checkItem);
  ctx.subscriptions.push({ dispose: () => checkItem.dispose() });

  // 首次激活友好提示
  const hasShown = ctx.globalState.get<boolean>("pyland.welcomed", false);
  if (!hasShown) {
    void ctx.globalState.update("pyland.welcomed", true);
    setTimeout(async () => {
      const choice = await vscode.window.showInformationMessage(
        "🐉 PyLand 扩展已激活！点左下角「🐉 章节地图」按钮，或按 Ctrl+Shift+P 搜 PyLand。",
        "打开地图",
        "知道了",
      );
      if (choice === "打开地图") {
        vscode.commands.executeCommand("pyland.openMap");
      }
    }, 1500);
  }

  // 监听文件保存——如果是 pyland 练习文件，自动检查
  ctx.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!doc.fileName.endsWith(".py")) return;
      // 关卡练习文件：pyland-exercises/l1_q1.py
      if (doc.fileName.includes("pyland-exercises")) {
        const m = doc.fileName.match(/_q(\d+)\.py$/);
        if (m && lessonView.activeLevelId) {
          setTimeout(() => {
            vscode.commands.executeCommand("pyland.checkCode");
          }, 200);
        }
        return;
      }
      // 训练场练习文件：pyland-exercises/practice_q1.py
      if (/practice_q\d+\.py$/.test(doc.fileName)) {
        setTimeout(() => {
          void practiceView.checkActiveByFile(doc.fileName);
        }, 200);
      }
    }),
  );

  function updateStatusBar(item: vscode.StatusBarItem): void {
    item.text = `$(sparkle) PyLand · Lv.${pm.getLevel()} · ${pm.getXP()} XP`;
    item.tooltip = `连续修炼 ${pm.getStreak()} 天`;
  }
}

/** 扩展停用 */
export function deactivate(): void {
  // 无需手动清理，subscriptions 会被自动 dispose
}
