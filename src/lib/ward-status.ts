// 状態の一括登録: for each shift, the state of every patient of the floor in one table — 重症度・看護度
// （観察の程度・生活の自由度）・救護区分・感染経路別予防策 — chosen by the nurse and registered at once (who
// and when are added by code). The notice asks for 「看護職員を適正に配置するための患者の状態に関する評価の記録」
// without saying which categories; only 感染経路別予防策 is defined by a public source we could read. The other
// categories are this fictional hospital's own (架空の病院の取り決め) and are labelled so on the screen.
// Nothing is chosen by AI: code carries the last registration forward when asked, and points out gaps.

import { isolationFor } from "./ward";
import type { DayOffset } from "./types";

export const STATUS_SOURCES = {
  record: {
    label: "厚生労働省保険局医療課長通知「基本診療料の施設基準等及びその届出に関する手続きの取扱いについて」（令和8年3月5日 保医発0305第7号）別添6 別紙6「入院基本料に係る看護記録」2(2) 看護業務の計画に関する記録（看護職員を適正に配置するための患者の状態に関する評価の記録）",
    url: "https://www.mhlw.go.jp/content/12400000/001757361.pdf",
  },
  precautions: {
    label: "厚生労働省医政局地域医療計画課長通知「医療機関における院内感染対策について」（平成26年12月19日 医政地発1219第1号）2-1(1)（全ての患者に標準予防策を実施し、必要に応じて感染経路別予防策（空気予防策、飛沫予防策及び接触予防策）を実施する）",
    url: "https://www.mhlw.go.jp/web/t_doc?dataId=00tc0640&dataType=1&page=",
  },
};

export const STATUS_RULES = {
  severity: "重症度（重症・中等症・軽症）は「重症度、医療・看護必要度」とは別のものです。",
  degree: "看護度：観察の程度 A〜C・生活の自由度 1〜4。",
  rescue: "救護区分（担送・護送・独歩）は院内連絡のベッドの情報と同じ記録です。",
};

export const SEVERITY = [
  { key: "重症", note: "状態が変わりやすく、医師への報告が多い" },
  { key: "中等症", note: "治療中で、定時の観察と処置が要る" },
  { key: "軽症", note: "状態が落ち着いている" },
] as const;
export type Severity = (typeof SEVERITY)[number]["key"];

export const OBSERVE = [
  { key: "A", note: "常に目を離せない（そばで観察する）" },
  { key: "B", note: "1〜2時間ごとに観察する" },
  { key: "C", note: "定時の観察でよい" },
] as const;
export type Observe = (typeof OBSERVE)[number]["key"];

export const FREEDOM = [
  { key: "1", note: "寝たきりで、身の回りは全介助" },
  { key: "2", note: "ベッドの上で一部は自分でできる" },
  { key: "3", note: "介助や車いすで移動できる" },
  { key: "4", note: "身の回りはほぼ自分でできる" },
] as const;
export type Freedom = (typeof FREEDOM)[number]["key"];

export const RESCUE_NOTE = { 担送: "歩けず、ベッドや担架で運ぶ", 護送: "付き添いか車いすで避難する", 独歩: "自分で避難できる" } as const;
export type RescueKind = keyof typeof RESCUE_NOTE;
export const RESCUE_KINDS = Object.keys(RESCUE_NOTE) as RescueKind[];

/** 感染経路別予防策 (医政地発1219第1号). 標準予防策 is for every patient, so it is not a choice. */
export const PRECAUTIONS = ["接触予防策", "飛沫予防策", "空気予防策"] as const;
export type Precaution = (typeof PRECAUTIONS)[number];

export interface PatientStatus {
  severity?: Severity;
  observe?: Observe;
  freedom?: Freedom;
  rescue?: RescueKind;
  precautions: Precaution[];
}

export type ShiftName = "day" | "night";
export const SHIFT_LABEL: Record<ShiftName, string> = { day: "日勤", night: "夜勤" };

export interface StatusSheet {
  rows: Record<string, PatientStatus>;
  by: string;
  at: { day: DayOffset; time: string };
}

/** Registrations by shift ("0|day"); the last one of a shift is in force, the earlier ones stay. */
export type StatusBook = Record<string, StatusSheet[]>;

export const shiftKey = (day: DayOffset, shift: ShiftName) => `${day}|${shift}`;

/** The shift going on now (日勤 08:30–17:00; before 08:30 it is the night that began the day before), as the worksheet opens. */
export function currentShift(nowTime: string): { day: DayOffset; shift: ShiftName } {
  const [h, m] = nowTime.split(":").map(Number);
  const min = h * 60 + m;
  return min < 510 ? { day: -1, shift: "night" } : min < 1020 ? { day: 0, shift: "day" } : { day: 0, shift: "night" };
}

/** The shift before: a day shift follows the night that began the day before; a night follows that day's day shift. */
export const shiftBefore = (day: DayOffset, shift: ShiftName): { day: DayOffset; shift: ShiftName } => (shift === "day" ? { day: day - 1, shift: "night" } : { day, shift: "day" });

export const inForce = (book: StatusBook, day: DayOffset, shift: ShiftName): StatusSheet | undefined => book[shiftKey(day, shift)]?.at(-1);

/** The last registration at or before this shift (looking back up to a week). */
export function lastBefore(book: StatusBook, day: DayOffset, shift: ShiftName): { sheet: StatusSheet; day: DayOffset; shift: ShiftName } | undefined {
  let s = shiftBefore(day, shift);
  for (let i = 0; i < 14; i++) {
    const sheet = inForce(book, s.day, s.shift);
    if (sheet) return { sheet, ...s };
    s = shiftBefore(s.day, s.shift);
  }
  return undefined;
}

/** 感染経路別予防策 as the record's infections show them (the same rule as the map's mark). */
export function precautionsFrom(infections: string[]): Precaution[] {
  const p = isolationFor(infections);
  return p && (PRECAUTIONS as readonly string[]).includes(p) ? [p as Precaution] : [];
}

export interface DraftPatient {
  id: string;
  infections: string[];
  /** 救護区分 already registered for the bed (院内連絡のベッドの情報). */
  rescue?: RescueKind;
}

/**
 * The table to start from: this shift's registration if there is one; else the last one before it (写す) when
 * asked; else empty, with 救護区分 from the bed and 予防策 from the infections. A person checks every row.
 */
export function draftRows(patients: DraftPatient[], from?: StatusSheet): Record<string, PatientStatus> {
  return Object.fromEntries(
    patients.map((p) => {
      const was = from?.rows[p.id];
      return [p.id, was ? { ...was, precautions: [...was.precautions] } : { rescue: p.rescue, precautions: precautionsFrom(p.infections) }];
    }),
  );
}

/** Set the same value for several patients at once (まとめて入れる). */
export function applyToMany(rows: Record<string, PatientStatus>, ids: string[], patch: Partial<Omit<PatientStatus, "precautions">> & { precaution?: { kind: Precaution; on: boolean } }): Record<string, PatientStatus> {
  const out = { ...rows };
  for (const id of ids) {
    const r = out[id] ?? { precautions: [] };
    const { precaution, ...rest } = patch;
    const precautions = precaution ? (precaution.on ? [...new Set([...r.precautions, precaution.kind])] : r.precautions.filter((x) => x !== precaution.kind)) : r.precautions;
    out[id] = { ...r, ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)), precautions };
  }
  return out;
}

export interface StatusIssue {
  patientId: string;
  text: string;
}

/** What is not filled yet, and a precaution the infections show but the row does not have. */
export function statusIssues(rows: Record<string, PatientStatus>, patients: DraftPatient[]): StatusIssue[] {
  const out: StatusIssue[] = [];
  for (const p of patients) {
    const r = rows[p.id];
    const missing = [!r?.severity && "重症度", !r?.observe && "観察の程度", !r?.freedom && "生活の自由度", !r?.rescue && "救護区分"].filter(Boolean);
    if (missing.length) out.push({ patientId: p.id, text: `未入力：${missing.join("・")}` });
    for (const want of precautionsFrom(p.infections)) if (!r?.precautions.includes(want)) out.push({ patientId: p.id, text: `感染症の登録（${p.infections.join("、")}）では${want}ですが、選ばれていません` });
  }
  return out;
}

export interface StatusCounts {
  severity: Record<Severity, number>;
  /** 看護度: "A1" … "C4". */
  degree: Record<string, number>;
  rescue: Record<RescueKind, number>;
  precautions: Record<Precaution, number>;
  total: number;
}

/** The numbers of a registration (for the 看護日誌 and the staffing). */
export function statusCounts(sheet: StatusSheet, ids?: string[]): StatusCounts {
  const rows = Object.entries(sheet.rows).filter(([id]) => !ids || ids.includes(id)).map(([, r]) => r);
  const zero = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  const c: StatusCounts = { severity: zero(SEVERITY.map((x) => x.key)), degree: {}, rescue: zero(RESCUE_KINDS), precautions: zero(PRECAUTIONS), total: rows.length };
  for (const r of rows) {
    if (r.severity) c.severity[r.severity]++;
    if (r.observe && r.freedom) c.degree[`${r.observe}${r.freedom}`] = (c.degree[`${r.observe}${r.freedom}`] ?? 0) + 1;
    if (r.rescue) c.rescue[r.rescue]++;
    for (const p of r.precautions) c.precautions[p]++;
  }
  return c;
}

/** The rows that differ from another registration (what this registration changed). */
export function changedRows(next: Record<string, PatientStatus>, before?: StatusSheet): string[] {
  const same = (a?: PatientStatus, b?: PatientStatus) => !!a && !!b && a.severity === b.severity && a.observe === b.observe && a.freedom === b.freedom && a.rescue === b.rescue && [...a.precautions].sort().join() === [...b.precautions].sort().join();
  return Object.keys(next).filter((id) => !same(next[id], before?.rows[id]));
}
