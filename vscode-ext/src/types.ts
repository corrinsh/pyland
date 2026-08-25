/* PyLand 数据类型定义 */

/** 题目类型 */
export type QType = "choice" | "predict" | "judge" | "blank" | "code";

/** 通用题目 */
export interface Question {
  type: QType;
  q: string;
  /** 选项（choice / predict 用） */
  options?: string[];
  /** 正确答案索引（choice / predict）或布尔值（judge）或字符串（blank），code 题不需要 */
  answer?: number | boolean | string;
  /** 代码（predict / code 的展示代码 / 起始代码） */
  code?: string;
  /** 期望输出（code 题） */
  expected?: string;
  /** 起始代码（code 题） */
  starter?: string;
  /** 解析 */
  explain: string;
  /** 提示（可选，code 题用） */
  hint?: string;
}

/** 关卡 */
export interface Level {
  id: string;
  title: string;
  icon: string;
  boss: boolean;
  desc: string;
  story: string;
  teach: string[];
  /** 知识讲堂：本关所有知识点的详细讲解（Markdown），独立浏览用 */
  tutorial?: string;
  questions: Question[];
}

/** 章节 */
export interface Chapter {
  id: string;
  no: string;
  title: string;
  sub: string;
  locked?: boolean;
  levels: Level[];
}

/** 单题答题结果 */
export interface QResult {
  qIdx: number;
  correct: boolean;
  /** 用户选的答案 */
  picked: number | boolean | string;
}

/** 关卡进度 */
export interface LevelProgress {
  done: boolean;
  stars: number;       // 0-3
  bestXp: number;
  firstTry: number;     // 首答正确数
  total: number;       // 总题数
  completedDate?: string;
}

/** 全局存档 */
export interface SaveData {
  xp: number;
  progress: Record<string, LevelProgress>;
  badges: string[];
  days: string[];
  daily: Record<string, DailyStat>;
}

/** 每日统计 */
export interface DailyStat {
  xp: number;
  first: number;
  wrong: number;
  runs: number;
  levels: number;
}

/** 检查结果 */
export interface CheckResult {
  passed: boolean;
  expected: string;
  got: string;
  diff?: string;
  error?: string;
}
