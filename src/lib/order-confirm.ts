// 指示受け → 指示確認 → 実施入力, the way the big vendors' ward screens arrange the nurse's work: a change
// arrives in the ward's 指示受け list, a nurse takes it (who, when), then checks what it puts on the schedule
// (指示確認: the doses, times and tasks the order makes for today and tomorrow) and records that she looked,
// and only then the items are carried out (実施入力, the worksheet and the flow sheet). Code expands the
// orders; nurses and doctors decide. Nothing here calls AI.

import type { CalendarDate } from "./dates";
import { addDays, formatShort } from "./dates";
import type { TakeHold, TakeRow } from "./order-take";
import type { DayOffset, OrderEntry } from "./types";
import { buildWorksheet, type RunningItem, type WorkItem, type WorkPatient } from "./worksheet";

export const CONFIRM_SOURCES = [
  { label: "富士通 HOPE EGMAIN-GX カタログ（看護師のワークフローを経過表中心に「指示受け、指示確認、実施入力」。機能一覧に「未指示受け一覧」）", url: "https://yokohama.hosp.go.jp/clinical_trial/den_cl/denshi_gx.pdf" },
  { label: "富山市民病院 システム機能一覧 1.7 指示受け機能（一括の指示受け・指示確認、指示受け者と確認者の一覧、未指示受けの検索、変更に【修】の印）", url: "https://www.tch.toyama.toyama.jp/tmh/02_3_siyousyo_system.pdf" },
  { label: "海陽町 海南病院 総合情報システム 技術仕様書 26 指示受け（新規・変更・削除の指示受け、履歴の参照と印刷、前回と今回を同じ画面で、指示受け一覧の並べ替え）", url: "https://www.town.kaiyo.lg.jp/docs/2022070100020/file_contents/gijutusiyousyo.pdf" },
];

/** The nurse's record that she looked at the schedule the order makes: row key → "HH:MM 看護師 ◯◯". */
export type Confirms = Record<string, string>;

// ---------------------------------------------------------------------------
// The status of one change (for the list, the worksheet and the doctor's record)
// ---------------------------------------------------------------------------

export type TakeState = "未指示受け" | "受け" | "確認済み" | "医師に確認中";

export interface TakeBadge {
  state: TakeState;
  /** What to print: 「受け 10:30 看護師 佐藤」「確認済み 10:35 看護師 佐藤」「医師に確認中（看護師 佐藤）」. */
  text: string;
  tone: "shu" | "yamabuki" | "wakatake" | "ai";
  row: TakeRow;
}

export interface TakeContext {
  taken: Record<string, string>;
  isTaken: (r: TakeRow) => boolean;
  holds: Record<string, TakeHold>;
  confirms: Confirms;
}

export function takeBadge(row: TakeRow, ctx: TakeContext): TakeBadge {
  const hold = ctx.holds[row.key];
  if (!ctx.isTaken(row)) {
    if (hold && !hold.answer) return { state: "医師に確認中", text: `医師に確認中（${hold.by}）`, tone: "yamabuki", row };
    return { state: "未指示受け", text: "未指示受け", tone: "shu", row };
  }
  const c = ctx.confirms[row.key];
  if (c) return { state: "確認済み", text: `確認済み ${c}`, tone: "wakatake", row };
  const t = ctx.taken[row.keys.at(-1)!];
  return { state: "受け", text: t ? `受け ${t}` : "受け済", tone: "ai", row };
}

/** The 指示受け badge of an order in the record: the latest change of that order, or null when none waits or was taken this session. */
export function orderTakeBadge(entryId: string, rows: TakeRow[], ctx: TakeContext): TakeBadge | null {
  const mine = rows.filter((r) => r.keys.some((k) => k.split("|")[0] === entryId)).sort((a, b) => b.at - a.at);
  return mine.length ? takeBadge(mine[0], ctx) : null;
}

/** Taken but not yet confirmed: what the worksheet marks (the schedule may not have been looked at). */
export const unconfirmed = (rows: TakeRow[], ctx: TakeContext) => rows.filter((r) => ctx.isTaken(r) && !!ctx.taken[r.keys.at(-1)!] && !ctx.confirms[r.key]);

// ---------------------------------------------------------------------------
// 指示確認: what the change puts on (or takes off) the schedule for today and tomorrow
// ---------------------------------------------------------------------------

export interface ConfirmDay {
  day: DayOffset;
  label: string;
  items: WorkItem[];
}

export interface ConfirmPlan {
  /** The order the change is about (the new or replacing order; for a stop, the stopped one), or null for text changes. */
  entry: OrderEntry | null;
  /** Timed items per day (today, tomorrow). For a stop: the doses that will no longer be given. */
  days: ConfirmDay[];
  /** Items without a clock time (必要時・1日N回) and what runs all day (drips, catheters). */
  untimed: WorkItem[];
  running: RunningItem[];
  /** What the nurse is asked to look at, in words. */
  note: string;
}

/** Days the confirmation covers: today and tomorrow (架空の病院の取り決め). */
export const CONFIRM_DAYS: DayOffset[] = [0, 1];

export const dayLabel = (d: DayOffset, today: CalendarDate) => `${d === 0 ? "今日" : d === 1 ? "明日" : d === -1 ? "昨日" : ""} ${formatShort(addDays(today, d))}`.trim();

function findEntry(people: WorkPatient[], patientId: string, id: string): { person: WorkPatient; entry: OrderEntry } | null {
  const person = people.find((x) => x.patient.id === patientId);
  const entry = person?.entries.find((e) => e.id === id);
  return person && entry ? { person, entry } : null;
}

/**
 * Expand the change for 指示確認. A new or replacing order: its doses and tasks for today and tomorrow, as the
 * worksheet would list them. A stop: the doses after the stop that will no longer be given. Text changes
 * (指示簿・食事・延長) make no schedule here; the nurse reads the text.
 */
export function confirmPlan(row: TakeRow, people: WorkPatient[], today: CalendarDate, nowAbs: number): ConfirmPlan {
  const empty = (note: string): ConfirmPlan => ({ entry: null, days: [], untimed: [], running: [], note });
  if (row.kind === "食事") return empty("食事の変更は予定を作りません。食止めなら、血糖を下げる薬が有効かを上の行で確かめます。");
  if (row.kind === "指示簿") return empty("指示簿の文は予定を作りません。文を読み、いまの指示簿カレンダーと合うことを確かめます。");
  if (row.kind === "延長") return empty("延長は同じ内容が続きます。延びた日数のあいだの予定はワークシートに出ます。");
  const id = row.keys.at(-1)!.split("|")[0];
  const found = findEntry(people, row.patientId, id);
  if (!found) return empty("このオーダはいまの記録にありません。");
  const { person, entry } = found;
  const lo = CONFIRM_DAYS[0] * 1440;
  const hi = (CONFIRM_DAYS[CONFIRM_DAYS.length - 1] + 1) * 1440;
  if (row.kind === "中止") {
    // As if it were still in force: what would have been given after the stop.
    const alive: OrderEntry = { ...entry, status: "有効", stoppedOn: undefined, stoppedTime: undefined };
    const sheet = buildWorksheet([{ ...person, entries: [alive] }], lo, hi, nowAbs);
    const gone = sheet.timed.filter((i) => (i.at ?? 0) >= row.at);
    return {
      entry,
      days: CONFIRM_DAYS.map((d) => ({ day: d, label: dayLabel(d, today), items: gone.filter((i) => Math.floor((i.at ?? 0) / 1440) === d) })),
      untimed: sheet.untimed,
      running: sheet.running,
      note: gone.length || sheet.untimed.length || sheet.running.length ? "中止で、ここに出ている予定は実施しません。準備した薬があれば片づけます。" : "中止のあとに残る予定はありません。",
    };
  }
  const sheet = buildWorksheet([{ ...person, entries: [entry] }], lo, hi, nowAbs);
  const days = CONFIRM_DAYS.map((d) => ({ day: d, label: dayLabel(d, today), items: sheet.timed.filter((i) => Math.floor((i.at ?? 0) / 1440) === d) }));
  const n = sheet.timed.length;
  return {
    entry,
    days,
    untimed: sheet.untimed,
    running: sheet.running,
    note: n || sheet.untimed.length || sheet.running.length ? `今日と明日の予定 ${n}件${sheet.untimed.length ? `と時刻のないもの ${sheet.untimed.length}件` : ""}${sheet.running.length ? `、続くもの ${sheet.running.length}件` : ""}。時刻・回数・量が指示と合うかを見ます。` : "今日と明日の予定はありません（開始が先か、検査の日が先です）。",
  };
}

// ---------------------------------------------------------------------------
// The ward's 指示受け list: sort, group by patient, elapsed time, what was taken today
// ---------------------------------------------------------------------------

export type TakeSort = "time" | "urgency";
export const TAKE_SORTS: { key: TakeSort; label: string }[] = [
  { key: "time", label: "時刻の順" },
  { key: "urgency", label: "急ぐ順" },
];

/** 0 至急・すぐ始まる, 1 高リスク薬・口頭指示, 2 変更, 3 時間外, 4 the rest. */
export const urgencyRank = (r: TakeRow): number => (r.flags.urgent ? 0 : r.flags.highRisk || r.flags.verbal ? 1 : r.flags.changed ? 2 : r.flags.offHours ? 3 : 4);

export function sortTakeList(rows: TakeRow[], sort: TakeSort): TakeRow[] {
  return [...rows].sort((a, b) => (sort === "urgency" ? urgencyRank(a) - urgencyRank(b) || a.at - b.at : a.at - b.at) || a.room.localeCompare(b.room));
}

export interface PatientGroup {
  patientId: string;
  room: string;
  name: string;
  rows: TakeRow[];
}

/** Rows grouped by patient; the groups come in the order of their first row (so with 急ぐ順 the patient with the most urgent change is first). */
export function groupByPatient(rows: TakeRow[]): PatientGroup[] {
  const out: PatientGroup[] = [];
  for (const r of rows) {
    const g = out.find((x) => x.patientId === r.patientId);
    if (g) g.rows.push(r);
    else out.push({ patientId: r.patientId, room: r.room, name: r.name, rows: [r] });
  }
  return out;
}

/** "25分" / "2時間5分" / "1日3時間" since the order was given. */
export function elapsedLabel(min: number): string {
  if (min < 1) return "いま";
  if (min < 60) return `${min}分`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m ? `${h}時間${m}分` : `${h}時間`;
  const d = Math.floor(h / 24);
  return `${d}日${h % 24 ? `${h % 24}時間` : ""}`;
}

/** Minutes after which an untaken change is marked late (架空の病院の取り決め): 至急 15分, others 60分. */
export const TAKE_LATE_MIN = { urgent: 15, other: 60 } as const;
export const takeLate = (r: TakeRow, nowAbs: number) => nowAbs - r.at >= (r.flags.urgent ? TAKE_LATE_MIN.urgent : TAKE_LATE_MIN.other);

/** "HH:MM" a row was taken (from the taken string "HH:MM 看護師 ◯◯…"), or null. */
export const takenTimeOf = (r: TakeRow, taken: Record<string, string>): string | null => taken[r.keys.at(-1)!]?.match(/^\d{2}:\d{2}/)?.[0] ?? null;

/** Rows taken in this session (all their keys have a who/when), newest first. */
export function takenInSession(rows: TakeRow[], taken: Record<string, string>): TakeRow[] {
  return rows.filter((r) => r.keys.every((k) => !!taken[k])).sort((a, b) => (takenTimeOf(b, taken) ?? "").localeCompare(takenTimeOf(a, taken) ?? "") || b.at - a.at);
}

// ---------------------------------------------------------------------------
// 指示票: the day's new and changed orders of one patient, to print
// ---------------------------------------------------------------------------

export interface SlipLine {
  at: number;
  timeKnown: boolean;
  kind: TakeRow["kind"];
  type: string;
  main: string;
  detail: string;
  author: string;
  flags: string[];
  before?: string;
  diff: string[];
  take: string;
  confirm: string;
}

/** The lines of a patient's 指示票 for one day (the changes given that day), in time order, with 指示受け and 指示確認. */
export function slipLines(rows: TakeRow[], patientId: string, day: DayOffset, ctx: TakeContext): SlipLine[] {
  return rows
    .filter((r) => r.patientId === patientId && Math.floor(r.at / 1440) === day)
    .sort((a, b) => a.at - b.at)
    .map((r) => {
      const b = takeBadge(r, ctx);
      return {
        at: r.at,
        timeKnown: r.timeKnown,
        kind: r.kind,
        type: r.type,
        main: r.main,
        detail: r.detail,
        author: r.author,
        flags: Object.values(r.flags).filter((x): x is string => !!x),
        before: r.before ? `${r.before.main}　${r.before.detail}` : undefined,
        diff: (r.diff ?? []).map((d) => `${d.label}：${d.before} → ${d.after}`),
        take: b.state === "未指示受け" ? "" : b.state === "医師に確認中" ? b.text : (ctx.taken[r.keys.at(-1)!] ?? "受け済"),
        confirm: ctx.confirms[r.key] ?? "",
      };
    });
}
