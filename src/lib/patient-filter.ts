// 入院患者一覧の条件: narrow the list by ward, department, doctor, nurse, days in hospital, DPC 入院期間,
// marks, own team and planned discharge. Plain matching; nothing is judged.

import type { DpcPeriod } from "./billing/dpc";

export const DAY_BUCKETS = [
  { key: "7", label: "7日以内", test: (d: number) => d <= 7 },
  { key: "14", label: "8〜14日", test: (d: number) => d >= 8 && d <= 14 },
  { key: "30", label: "15〜30日", test: (d: number) => d >= 15 && d <= 30 },
  { key: "31", label: "31日以上", test: (d: number) => d >= 31 },
] as const;

export const DPC_CHOICES = ["Ⅰ", "Ⅱ", "Ⅲ", "超え", "なし"] as const;
export type DpcChoice = (typeof DPC_CHOICES)[number];

export interface ListFilter {
  floor: string;
  department: string;
  doctor: string;
  nurse: string;
  days: "" | (typeof DAY_BUCKETS)[number]["key"];
  dpc: "" | DpcChoice;
  flag: string;
  mine: boolean;
  discharge: boolean;
}

export const EMPTY_FILTER: ListFilter = { floor: "", department: "", doctor: "", nurse: "", days: "", dpc: "", flag: "", mine: false, discharge: false };

/** What a row offers to the filter. */
export interface FilterFacts {
  floor: string;
  department: string;
  /** 主治医. */
  doctor: string;
  /** 担当医・コンサルト医 (the 主治医 pulldown finds the patient under them too). */
  others?: string[];
  nurse: string;
  /** 入院◯日目; null for a bed whose patient this prototype has no chart of. */
  day: number | null;
  /** null: no DPC period (no chart, not calculated, or not 包括). */
  dpc: DpcPeriod | null;
  /** Mark labels (counts dropped: 「未確認の結果 2」 → 「未確認の結果」). */
  flags: string[];
  /** A patient of the user's team (this prototype: the patients with a chart). */
  mine: boolean;
  /** 退院の予定（今日・明日）. */
  discharge: boolean;
}

/** 「未確認の結果 2」→「未確認の結果」、「身体的拘束中 12時間40分」→「身体的拘束中」: marks with counts or times are chosen as one. */
export const flagKey = (label: string) => label.replace(/(\s+\d[^\s]*)+$/, "").trim();

export function matches(f: FilterFacts, c: ListFilter): boolean {
  if (c.floor && f.floor !== c.floor) return false;
  if (c.department && f.department !== c.department) return false;
  if (c.doctor && f.doctor !== c.doctor && !(f.others ?? []).includes(c.doctor)) return false;
  if (c.nurse && f.nurse !== c.nurse) return false;
  if (c.days) {
    const b = DAY_BUCKETS.find((x) => x.key === c.days)!;
    if (f.day === null || !b.test(f.day)) return false;
  }
  if (c.dpc && (c.dpc === "なし" ? f.dpc !== null : f.dpc !== c.dpc)) return false;
  if (c.flag && !f.flags.includes(c.flag)) return false;
  if (c.mine && !f.mine) return false;
  if (c.discharge && !f.discharge) return false;
  return true;
}

export const activeCount = (c: ListFilter) => (Object.keys(EMPTY_FILTER) as (keyof ListFilter)[]).filter((k) => c[k] !== EMPTY_FILTER[k]).length;

/** The choices each pulldown offers: the values present in the rows, sorted. */
export function choicesOf(rows: FilterFacts[]): { floors: string[]; departments: string[]; doctors: string[]; nurses: string[]; flags: string[] } {
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
  return {
    floors: uniq(rows.map((r) => r.floor)),
    departments: uniq(rows.map((r) => r.department)),
    doctors: uniq(rows.flatMap((r) => [r.doctor, ...(r.others ?? [])])),
    nurses: uniq(rows.map((r) => r.nurse)),
    flags: uniq(rows.flatMap((r) => r.flags)),
  };
}
