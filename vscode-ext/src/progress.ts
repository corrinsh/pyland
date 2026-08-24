import * as vscode from "vscode";
import type { SaveData, LevelProgress, DailyStat } from "./types";

const STATE_KEY = "pyland_save_v1";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultState(): SaveData {
  return { xp: 0, progress: {}, badges: [], days: [], daily: {} };
}

/** 进度管理器 —— 读写 VS Code globalState */
export class ProgressManager {
  private state: SaveData;

  constructor(private ctx: vscode.ExtensionContext) {
    const raw = ctx.globalState.get<SaveData>(STATE_KEY);
    this.state = raw ? { ...defaultState(), ...raw } : defaultState();
    if (!this.state.days.includes(today())) {
      this.state.days.push(today());
      this.save();
    }
  }

  private save(): void {
    this.ctx.globalState.update(STATE_KEY, this.state);
  }

  getState(): SaveData {
    return this.state;
  }

  getLevelProgress(levelId: string): LevelProgress | undefined {
    return this.state.progress[levelId];
  }

  isLevelDone(levelId: string): boolean {
    return this.state.progress[levelId]?.done ?? false;
  }

  /** 判断关卡是否解锁（第一关永远开，其余要上一关过） */
  isLevelUnlocked(levelId: string): boolean {
    const list = allLevelIds();
    const idx = list.indexOf(levelId);
    if (idx <= 0) return true; // 第一关或找不到
    return this.isLevelDone(list[idx - 1]);
  }

  /** 记录关卡完成 */
  finishLevel(levelId: string, firstTry: number, total: number): LevelProgress {
    const xpGain = 50 + firstTry * 5;
    const stars = firstTry === total ? 3 : firstTry >= total * 0.8 ? 2 : 1;

    const existing = this.state.progress[levelId];
    const lp: LevelProgress = {
      done: true,
      stars: Math.max(existing?.stars ?? 0, stars),
      bestXp: Math.max(existing?.bestXp ?? 0, xpGain),
      firstTry: Math.max(existing?.firstTry ?? 0, firstTry),
      total,
      completedDate: today(),
    };
    this.state.progress[levelId] = lp;

    // XP 只加第一次完成
    if (!existing?.done) {
      this.state.xp += xpGain;
      this.bumpDaily("xp", xpGain);
      this.bumpDaily("levels", 1);
    }
    this.save();
    return lp;
  }

  getXP(): number {
    return this.state.xp;
  }

  getLevel(): number {
    return Math.floor(this.state.xp / 100) + 1;
  }

  getStreak(): number {
    const set = new Set(this.state.days);
    let n = 0;
    const d = new Date();
    if (!set.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1);
    while (set.has(d.toISOString().slice(0, 10))) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  private bumpDaily(key: keyof DailyStat, n: number): void {
    const d = today();
    if (!this.state.daily[d]) {
      this.state.daily[d] = { xp: 0, first: 0, wrong: 0, runs: 0, levels: 0 };
    }
    (this.state.daily[d] as any)[key] += n;
  }

  recordAnswer(correct: boolean): void {
    const d = today();
    if (!this.state.daily[d]) {
      this.state.daily[d] = { xp: 0, first: 0, wrong: 0, runs: 0, levels: 0 };
    }
    if (correct) this.state.daily[d].first++;
    else this.state.daily[d].wrong++;
    this.save();
  }

  recordRun(): void {
    this.bumpDaily("runs", 1);
  }

  reset(): void {
    this.state = defaultState();
    this.state.days.push(today());
    this.save();
  }

  exportJSON(): string {
    return JSON.stringify(this.state, null, 2);
  }

  importJSON(json: string): boolean {
    try {
      const data = JSON.parse(json) as SaveData;
      this.state = { ...defaultState(), ...data };
      this.save();
      return true;
    } catch {
      return false;
    }
  }
}

import { allLevels } from "./courses";

function allLevelIds(): string[] {
  return allLevels().map(x => x.level.id);
}
