// 看護ケア指示: the care and observation items a nurse orders for a patient — what, when (times of day,
// every N hours, or 必要時), every how many days, from when and until when — expanded by code into the
// tasks of a shift. Each task gets a 実施 record (who, when it was done, when it was written, the value for
// an observation) or 未実施 with a reason. A changed order is stopped and written again, so what was done
// under the old one stays as it was. People decide what to order; nothing here is decided by AI.
// Times are "absolute minutes" from today 00:00 (see flowsheet.ts); after midnight the clock runs on
// past 24:00 (see dates.ts continuedTime). Data is fictional.

import { formatShort, addDays, minutesOf, type CalendarDate } from "./dates";
import type { PlanList } from "./nursing-plan";
import type { DayOffset } from "./types";

export const CARE_SOURCES = {
  record: {
    label: "厚生労働省保険局医療課長通知「基本診療料の施設基準等及びその届出に関する手続きの取扱いについて」（令和8年3月5日 保医発0305第7号）別添6 別紙6「入院基本料に係る看護記録」1(1) 経過記録（個々の患者について観察した事項及び実施した看護の内容等を記録する）",
    url: "https://kouseikyoku.mhlw.go.jp/kantoshinetsu/kihon080305.pdf",
  },
};

/** ケア = do it and tick it; 観察 = look and write what was seen (a choice, a number or words). */
export type CareKind = "ケア" | "観察";

export type CareSchedule =
  /** Fixed clock times each day ("HH:MM", 00:00–23:59). */
  | { kind: "times"; times: string[] }
  /** Every N hours, on the clock from `from` (e.g. 2時間ごと from 00:00 = 0, 2, 4 … 時). */
  | { kind: "every"; hours: number; from: string }
  /** 必要時: no set time; each time it is done is recorded. */
  | { kind: "prn" };

export interface Moment {
  day: DayOffset;
  time: string;
}

export interface CareOrder {
  id: string;
  patientId: string;
  /** What to do or look at, in the nurse's words (from the list or free text). */
  item: string;
  kind: CareKind;
  /** 観察: the answers to choose from (none = free words). */
  choices?: string[];
  inputKind?: "number" | "choice" | "check" | "text";
  glucoseLimits?: { low: number; high: number };
  /** 観察: the unit of a number (kg, cm …). */
  unit?: string;
  schedule: CareSchedule;
  /** Every how many days, counted from the start day (1 毎日, 2 隔日, 7 週1回). Clock times only. */
  everyDays: number;
  /** Tasks come from this moment on. */
  start: Moment;
  /** The last day (inclusive), when the order has an end. */
  endDay?: DayOffset;
  note: string;
  /** Who ordered it and when. */
  by: string;
  at: Moment;
  /** The nursing plan problem (#n) and list (観察・ケア・指導) this order carries out. */
  plan?: { problemId: string; list: PlanList };
  stopped?: { at: Moment; by: string; reason: string };
  /** The order this one replaced (変更). */
  replaces?: string;
}

/** Items the fictional ward often orders, with its usual times (架空の病院の取り決め). The nurse changes them. */
export const CARE_ITEMS: { item: string; kind: CareKind; choices?: string[]; unit?: string; schedule: CareSchedule; everyDays?: number }[] = [
  { item: "体位変換", kind: "ケア", schedule: { kind: "every", hours: 2, from: "00:00" } },
  { item: "口腔ケア", kind: "ケア", schedule: { kind: "times", times: ["08:30", "12:30", "18:30"] } },
  { item: "清拭", kind: "ケア", schedule: { kind: "times", times: ["14:00"] } },
  { item: "陰部洗浄", kind: "ケア", schedule: { kind: "times", times: ["10:00"] } },
  { item: "吸引", kind: "ケア", schedule: { kind: "prn" } },
  { item: "足浴", kind: "ケア", schedule: { kind: "times", times: ["14:00"] }, everyDays: 2 },
  { item: "離床（車いすに座る）", kind: "ケア", schedule: { kind: "times", times: ["10:00", "15:00"] } },
  { item: "体重測定", kind: "観察", unit: "kg", schedule: { kind: "times", times: ["06:00"] } },
  { item: "血糖測定（簡易血糖測定器）", kind: "観察", unit: "mg/dL", schedule: { kind: "times", times: ["07:30", "11:30", "17:30"] } },
  { item: "口腔内の乾燥", kind: "観察", choices: ["湿潤", "乾燥", "強い乾燥"], schedule: { kind: "times", times: ["10:00"] } },
  { item: "痰の量", kind: "観察", choices: ["少ない", "中くらい", "多い"], schedule: { kind: "times", times: ["06:00", "14:00", "22:00"] } },
  { item: "下腿のむくみ", kind: "観察", choices: ["なし", "軽い", "強い"], schedule: { kind: "times", times: ["10:00"] } },
  { item: "口腔の状態の確認", kind: "観察", choices: ["問題なし", "要観察"], schedule: { kind: "times", times: ["10:00"] }, everyDays: 7 },
];

/** Hours to choose for 「N時間ごと」. */
export const EVERY_HOURS = [1, 2, 3, 4, 6, 8, 12] as const;

/** Minutes past the time after which an unrecorded task shows as late (架空の病院の取り決め). */
export const CARE_LATE_MIN = 60;
/** How early a task may be recorded before its time (架空の病院の取り決め). */
export const CARE_EARLY_MIN = 60;

const absOf = (m: Moment) => m.day * 1440 + minutesOf(m.time);
const VALID_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/** "HH:MM" on the continued clock (after midnight 24:00〜47:59). */
const VALID_CONTINUED = /^([0-3]\d|4[0-7]):[0-5]\d$/;

export const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** When the order makes tasks: from its start until it was stopped or its last day ended (null = open). */
export function careWindow(o: CareOrder): { from: number; to: number | null } {
  const from = absOf(o.start);
  const ends = [o.endDay !== undefined ? (o.endDay + 1) * 1440 : null, o.stopped ? absOf(o.stopped.at) : null].filter((x): x is number => x !== null);
  return { from, to: ends.length ? Math.max(from, Math.min(...ends)) : null };
}

/** The scheduled times (absolute minutes) of an order inside [lo, hi). 必要時 has none. */
export function careSlots(o: CareOrder, lo: number, hi: number): number[] {
  if (o.schedule.kind === "prn") return [];
  const { from, to } = careWindow(o);
  const end = Math.min(hi, to ?? Infinity);
  const first = Math.max(lo, from);
  const out: number[] = [];
  if (first >= end) return out;
  if (o.schedule.kind === "every") {
    const step = Math.max(1, o.schedule.hours) * 60;
    let t = o.start.day * 1440 + minutesOf(o.schedule.from);
    if (t < first) t += Math.ceil((first - t) / step) * step;
    for (; t < end; t += step) out.push(t);
    return out;
  }
  const every = Math.max(1, Math.floor(o.everyDays) || 1);
  const times = [...o.schedule.times].sort((a, b) => minutesOf(a) - minutesOf(b));
  for (let d = Math.floor(first / 1440); d * 1440 < end; d++) {
    if (d < o.start.day || (d - o.start.day) % every !== 0) continue;
    for (const tm of times) {
      const t = d * 1440 + minutesOf(tm);
      if (t >= first && t < end) out.push(t);
    }
  }
  return out;
}

/** Whether the order is in force at some point of [lo, hi). */
export function careLive(o: CareOrder, lo: number, hi: number): boolean {
  const { from, to } = careWindow(o);
  return from < hi && (to === null || to > lo);
}

/** In force now (not stopped, not past its last day). */
export const careActive = (o: CareOrder, nowAbs: number) => careLive(o, nowAbs, nowAbs + 1) || absOf(o.start) > nowAbs;

/** "2時間ごと（0時から）", "10:00・14:00", "必要時", with 隔日・週1回 when not every day. */
export function scheduleLabel(o: Pick<CareOrder, "schedule" | "everyDays">): string {
  const s = o.schedule;
  if (s.kind === "prn") return "必要時";
  if (s.kind === "every") return `${s.hours}時間ごと（${Number(s.from.slice(0, 2))}時から）`;
  return `${daysLabel(o.everyDays)}${s.times.length > 1 ? `1日${s.times.length}回 ` : ""}${s.times.join("・")}`;
}

const daysLabel = (n: number) => (n === 2 ? "隔日 " : n === 7 ? "週1回 " : n > 1 ? `${n}日ごと ` : "");

/** The short form for the flow sheet: "2時間ごと", "1日4回", "隔日 14:00", "必要時". */
export function shortSchedule(o: Pick<CareOrder, "schedule" | "everyDays">): string {
  const s = o.schedule;
  if (s.kind === "prn") return "必要時";
  if (s.kind === "every") return `${s.hours}時間ごと`;
  return `${daysLabel(o.everyDays)}${s.times.length > 1 ? `1日${s.times.length}回` : s.times[0] ?? ""}`.trim();
}

// ---------------------------------------------------------------------------
// Tasks of a shift
// ---------------------------------------------------------------------------

export interface CareTask {
  orderId: string;
  patientId: string;
  /** Scheduled time (absolute minutes), or null for 必要時. */
  at: number | null;
  item: string;
  kind: CareKind;
  order: CareOrder;
}

/** The care tasks of [lo, hi) for these orders: each scheduled time, and the 必要時 orders in force. */
export function careTasks(orders: CareOrder[], lo: number, hi: number): { timed: CareTask[]; prn: CareTask[] } {
  const timed: CareTask[] = [];
  const prn: CareTask[] = [];
  for (const o of orders) {
    const base = { orderId: o.id, patientId: o.patientId, item: o.item, kind: o.kind, order: o };
    if (o.schedule.kind === "prn") {
      if (careLive(o, lo, hi)) prn.push({ ...base, at: null });
      continue;
    }
    for (const t of careSlots(o, lo, hi)) timed.push({ ...base, at: t });
  }
  return { timed: timed.sort((a, b) => (a.at ?? 0) - (b.at ?? 0)), prn };
}

// ---------------------------------------------------------------------------
// 実施 records
// ---------------------------------------------------------------------------

export const CARE_NOT_DONE = ["患者が拒否", "検査・リハビリなどで不在", "状態を見て見合わせた", "医師の指示で中止・延期", "その他"] as const;
export type CareNotDone = (typeof CARE_NOT_DONE)[number];

export interface CareRecord {
  measuredAt?: number;
  key: string;
  orderId: string;
  patientId: string;
  /** Scheduled time (absolute minutes); for 必要時, the time it was done. */
  at: number;
  status: "実施" | "未実施";
  /** 観察: what was seen. */
  value?: string;
  reason?: CareNotDone;
  note?: string;
  /** When it was done and when it was written ("HH:MM" on the continued clock), and by whom. */
  doneAt: string;
  writtenAt: string;
  by: string;
  /** Taken back (the record stays in the history). */
  voided?: { by: string; at: string; reason: string };
}

export const careKey = (orderId: string, at: number) => `${orderId}|${at}`;

/** The record in force for a task: the last one not taken back. */
export function recordOf(records: CareRecord[], key: string): CareRecord | undefined {
  for (let i = records.length - 1; i >= 0; i--) if (records[i].key === key && !records[i].voided) return records[i];
  return undefined;
}

/** 記録を取り消す: the record in force for the key is marked as taken back (it stays in the list). */
export function voidCare(records: CareRecord[], key: string, by: string, at: string, reason: string): CareRecord[] {
  const r = recordOf(records, key);
  return r ? records.map((x) => (x === r ? { ...x, voided: { by, at, reason } } : x)) : records;
}

export type CareState = "実施" | "未実施" | "記録済み" | "未入力" | "予定";

/**
 * The state of one scheduled task. Like the medication record (mar.ts), tasks due before this session
 * began count as recorded by the (fictional) earlier shift; after that, a nurse records them.
 */
export function careState(task: { orderId: string; at: number | null }, records: CareRecord[], sessionStart: number, nowAbs: number): CareState {
  if (task.at === null) return "予定";
  const r = recordOf(records, careKey(task.orderId, task.at));
  if (r) return r.status;
  if (task.at < sessionStart) return "記録済み";
  return task.at <= nowAbs ? "未入力" : "予定";
}

/** Past its time by more than CARE_LATE_MIN without a record. */
export const careLate = (task: { orderId: string; at: number | null }, records: CareRecord[], sessionStart: number, nowAbs: number) =>
  task.at !== null && careState(task, records, sessionStart, nowAbs) === "未入力" && nowAbs - task.at > CARE_LATE_MIN;

/** Whether a task can be recorded now: not more than CARE_EARLY_MIN before its time. */
export const careOpen = (at: number | null, nowAbs: number) => at === null || at - nowAbs <= CARE_EARLY_MIN;

/** What is missing or wrong before a 実施・未実施 record can be saved. */
export function recordProblems(order: Pick<CareOrder, "kind" | "inputKind" | "choices">, r: { status: "実施" | "未実施"; value?: string; reason?: string; doneAt: string }, nowTime: string): string[] {
  const out: string[] = [];
  if (r.status === "実施" && order.kind === "観察" && !r.value?.trim()) out.push("観察した内容");
  if (r.status === "実施" && order.inputKind === "number" && (!r.value?.trim() || !Number.isFinite(Number(r.value)))) out.push("数値を入れてください");
  if (r.status === "実施" && order.choices?.length && !order.choices.includes(r.value ?? "")) out.push("選択肢から選んでください");
  if (r.status === "未実施" && !r.reason) out.push("未実施の理由");
  if (!VALID_CONTINUED.test(r.doneAt)) out.push("実施した時刻（HH:MM）");
  else if (minutesOf(r.doneAt) > minutesOf(nowTime)) out.push("実施した時刻が今より後です");
  return out;
}

/** Tasks of the people's orders that are late, for the nurse's to-dos. */
export function lateCare(orders: CareOrder[], records: CareRecord[], patientIds: string[], sessionStart: number, nowAbs: number): CareTask[] {
  const mine = orders.filter((o) => patientIds.includes(o.patientId));
  return careTasks(mine, sessionStart, nowAbs + 1).timed.filter((t) => careLate(t, records, sessionStart, nowAbs));
}

// ---------------------------------------------------------------------------
// Ordering, changing, stopping
// ---------------------------------------------------------------------------

export interface CareDraft {
  inputKind?: CareOrder["inputKind"];
  glucoseLimits?: CareOrder["glucoseLimits"];
  item: string;
  kind: CareKind;
  choices: string[];
  unit: string;
  schedule: CareSchedule;
  everyDays: number;
  startDay: DayOffset;
  startTime: string;
  endDay?: DayOffset;
  note: string;
  plan?: { problemId: string; list: PlanList };
}

export const emptyCareDraft = (nowTime: string): CareDraft => ({ item: "", kind: "ケア", choices: [], unit: "", schedule: { kind: "times", times: [] }, everyDays: 1, startDay: 0, startTime: nowTime.slice(0, 5), note: "" });

/** A draft from one of the usual items (the nurse then changes what is needed). */
export function draftFromItem(name: string, nowTime: string): CareDraft {
  const it = CARE_ITEMS.find((x) => x.item === name);
  const d = emptyCareDraft(nowTime);
  return it ? { ...d, item: it.item, kind: it.kind, choices: it.choices ?? [], unit: it.unit ?? "", schedule: it.schedule, everyDays: it.everyDays ?? 1 } : { ...d, item: name };
}

/** A draft from an order in force (to change it). */
export const draftFromOrder = (o: CareOrder, nowTime: string, today: DayOffset = 0): CareDraft => ({
  inputKind: o.inputKind, glucoseLimits: o.glucoseLimits,
  item: o.item,
  kind: o.kind,
  choices: o.choices ?? [],
  unit: o.unit ?? "",
  schedule: o.schedule,
  everyDays: o.everyDays,
  startDay: today,
  startTime: nowTime.slice(0, 5),
  endDay: o.endDay,
  note: o.note,
  plan: o.plan,
});

/** What is missing before an order can be given. */
export function draftProblems(d: CareDraft): string[] {
  const out: string[] = [];
  if (!d.item.trim()) out.push("項目");
  const s = d.schedule;
  if (s.kind === "times") {
    if (!s.times.length) out.push("時刻");
    else if (s.times.some((t) => !VALID_TIME.test(t))) out.push("時刻（00:00〜23:59 で）");
    else if (new Set(s.times).size !== s.times.length) out.push("同じ時刻が2つあります");
  }
  if (s.kind === "every" && (!EVERY_HOURS.includes(s.hours as (typeof EVERY_HOURS)[number]) || !VALID_TIME.test(s.from))) out.push("何時間ごとか");
  if (!Number.isInteger(d.everyDays) || d.everyDays < 1) out.push("何日ごとか");
  if (!VALID_CONTINUED.test(d.startTime)) out.push("開始の時刻（HH:MM）");
  if (d.endDay !== undefined && d.endDay < d.startDay) out.push("終了日が開始日より前です");
  if (d.kind === "観察" && d.choices.some((c) => !c.trim())) out.push("選択肢に空のものがあります");
  return out;
}

/** "08:30、12:30" or "8:30 12:30" → ["08:30", "12:30"]. */
export function parseTimes(text: string): string[] {
  return text
    .split(/[、,・\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const m = /^(\d{1,2})(?::|：)?(\d{2})?$/.exec(t);
      return m ? `${m[1].padStart(2, "0")}:${m[2] ?? "00"}` : t;
    });
}

export function makeCareOrder(d: CareDraft, id: string, patientId: string, by: string, now: Moment): CareOrder {
  const start: Moment = { day: d.startDay, time: d.startTime };
  // An order never starts before it was given.
  const from = absOf(start) < absOf(now) ? now : start;
  return {
    id,
    patientId,
    inputKind: d.inputKind,
    glucoseLimits: d.glucoseLimits,
    item: d.item.trim(),
    kind: d.kind,
    ...(d.kind === "観察" && d.choices.length ? { choices: d.choices.map((c) => c.trim()) } : {}),
    ...(d.kind === "観察" && d.unit.trim() ? { unit: d.unit.trim() } : {}),
    schedule: d.schedule.kind === "times" ? { kind: "times", times: [...d.schedule.times].sort((a, b) => minutesOf(a) - minutesOf(b)) } : d.schedule,
    everyDays: d.schedule.kind === "times" ? d.everyDays : 1,
    start: from,
    ...(d.endDay !== undefined ? { endDay: d.endDay } : {}),
    note: d.note.trim(),
    by,
    at: now,
    ...(d.plan ? { plan: d.plan } : {}),
  };
}

/** 中止: the order stops making tasks from now; what was done stays. */
export function stopCare(all: CareOrder[], id: string, by: string, now: Moment, reason: string): CareOrder[] {
  return all.map((o) => (o.id === id && !o.stopped ? { ...o, stopped: { at: now, by, reason } } : o));
}

/** 変更: stop the order now and give the changed one (records of the old one are not touched). */
export function changeCare(all: CareOrder[], id: string, d: CareDraft, newId: string, by: string, now: Moment): CareOrder[] {
  const old = all.find((o) => o.id === id);
  if (!old) return all;
  return [...stopCare(all, id, by, now, "変更"), { ...makeCareOrder(d, newId, old.patientId, by, now), replaces: id }];
}

/** "11/4（水）から" "11/4（水）〜11/10（火）". */
export function periodLabel(o: CareOrder, today: CalendarDate): string {
  const f = (d: DayOffset) => formatShort(addDays(today, d));
  return `${f(o.start.day)} ${o.start.time}〜${o.endDay !== undefined ? f(o.endDay) : ""}`;
}

// ---------------------------------------------------------------------------
// 経過表 rows: one row per item, one cell per day — past days show 済 or what was seen, later ones a dot.
// ---------------------------------------------------------------------------

export interface CareFlowCell {
  text: string;
  tone: "done" | "not" | "late" | "plan";
  /** Each time of the day with its state, for the tooltip. */
  title: string;
}

export interface CareFlowRow {
  key: string;
  label: string;
  /** How often, in short ("2時間ごと"). */
  sub: string;
  kind: CareKind;
  cells: Record<number, CareFlowCell>;
}

export function careFlowRows(orders: CareOrder[], records: CareRecord[], days: DayOffset[], nowAbs: number, sessionStart: number): CareFlowRow[] {
  const groups = new Map<string, CareOrder[]>();
  for (const o of orders) {
    const k = `${o.kind}|${o.item}`;
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  const rows: CareFlowRow[] = [];
  for (const [key, os] of groups) {
    const latest = [...os].sort((a, b) => absOf(b.at) - absOf(a.at))[0];
    const ids = new Set(os.map((o) => o.id));
    const unit = latest.unit ?? "";
    const cells: Record<number, CareFlowCell> = {};
    for (const d of days) {
      const lo = d * 1440;
      const hi = lo + 1440;
      const slots = os.flatMap((o) => careSlots(o, lo, hi).map((at) => ({ orderId: o.id, at })));
      const prnDone = records.filter((r) => ids.has(r.orderId) && !r.voided && r.at >= lo && r.at < hi && !slots.some((s) => careKey(s.orderId, s.at) === r.key));
      if (!slots.length && !prnDone.length) continue;
      const lines: string[] = [];
      let done = 0;
      let not = 0;
      let missing = 0;
      let past = 0;
      let future = 0;
      let lastValue: string | undefined;
      for (const s of slots.sort((a, b) => a.at - b.at)) {
        const st = careState(s, records, sessionStart, nowAbs);
        const r = recordOf(records, careKey(s.orderId, s.at));
        if (s.at > nowAbs && !r) {
          future++;
          lines.push(`${hhmm(s.at)} 予定`);
          continue;
        }
        past++;
        if (st === "実施" || st === "記録済み") done++;
        else if (st === "未実施") not++;
        else missing++;
        if (r?.status === "実施" && r.value) lastValue = r.value;
        lines.push(`${hhmm(s.at)} ${st === "記録済み" ? "実施（前の勤務）" : st}${r?.value ? ` ${r.value}${unit}` : ""}${r?.reason ? `（${r.reason}）` : ""}${r ? ` ${r.doneAt} ${r.by}` : ""}`);
      }
      for (const r of prnDone) {
        if (r.status === "実施") done++;
        past++;
        if (r.value) lastValue = r.value;
        lines.push(`${r.doneAt} ${r.status}${r.value ? ` ${r.value}${unit}` : ""}${r.note ? ` ${r.note}` : ""} ${r.by}`);
      }
      const tone: CareFlowCell["tone"] = not ? "not" : missing ? "late" : past ? "done" : "plan";
      let text: string;
      if (!past) text = future > 1 ? `・${future}回` : "・";
      else if (latest.kind === "観察" && lastValue) text = `${lastValue}${unit}`;
      else if (latest.schedule.kind === "prn") text = `${done}回`;
      else if (done === past) text = "済";
      else if (!done) text = not ? "不可" : "未";
      else text = `済${done}/${past}`;
      cells[d] = { text, tone, title: lines.join("\n") };
    }
    if (Object.keys(cells).length) rows.push({ key, label: latest.item, sub: shortSchedule(latest), kind: latest.kind, cells });
  }
  return rows;
}

/** One time of a care row in the zoomed-in flow sheet (3日・1日・勤務帯・1時間): the task or the 必要時 record. */
export interface CareFlowMark {
  id: string;
  at: number;
  orderId: string;
  text: string;
  tone: CareFlowCell["tone"];
  title: string;
}

/**
 * The same rows as careFlowRows, but each task at its time inside [lo, hi): 済 (or what was seen),
 * 不可, 未 (past without a record), ・ (ahead); 必要時 records at the time they were done.
 */
export function careFlowMarks(orders: CareOrder[], records: CareRecord[], lo: number, hi: number, nowAbs: number, sessionStart: number): (Omit<CareFlowRow, "cells"> & { marks: CareFlowMark[] })[] {
  const groups = new Map<string, CareOrder[]>();
  for (const o of orders) {
    const k = `${o.kind}|${o.item}`;
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  const rows: (Omit<CareFlowRow, "cells"> & { marks: CareFlowMark[] })[] = [];
  for (const [key, os] of groups) {
    const latest = [...os].sort((a, b) => absOf(b.at) - absOf(a.at))[0];
    const ids = new Set(os.map((o) => o.id));
    const unit = latest.unit ?? "";
    const marks: CareFlowMark[] = [];
    const slots = os.flatMap((o) => careSlots(o, lo, hi).map((at) => ({ orderId: o.id, at })));
    for (const s of slots) {
      const st = careState(s, records, sessionStart, nowAbs);
      const r = recordOf(records, careKey(s.orderId, s.at));
      const tone: CareFlowCell["tone"] = st === "未実施" ? "not" : st === "未入力" ? "late" : st === "予定" ? "plan" : "done";
      const text = st === "未実施" ? "不可" : st === "未入力" ? "未" : st === "予定" ? "・" : r?.value ? `${r.value}${unit}` : "済";
      marks.push({ id: r?.key ?? careKey(s.orderId, s.at), at: s.at, orderId: s.orderId, text, tone, title: `${hhmm(s.at)} ${latest.item}：${st === "記録済み" ? "実施（前の勤務）" : st}${r?.value ? ` ${r.value}${unit}` : ""}${r?.reason ? `（${r.reason}）` : ""}${r ? ` ${r.doneAt} ${r.by}` : ""}` });
    }
    for (const r of records) {
      if (!ids.has(r.orderId) || r.voided || recordOf(records, r.key) !== r || r.at < lo || r.at >= hi || slots.some((s) => careKey(s.orderId, s.at) === r.key)) continue;
      marks.push({ id: r.key, at: r.at, orderId: r.orderId, text: r.value ? `${r.value}${unit}` : r.status === "実施" ? "済" : "不可", tone: r.status === "実施" ? "done" : "not", title: `${r.doneAt} ${latest.item}：${r.status}${r.value ? ` ${r.value}${unit}` : ""}${r.note ? ` ${r.note}` : ""} ${r.by}` });
    }
    if (marks.length) rows.push({ key, label: latest.item, sub: shortSchedule(latest), kind: latest.kind, marks: marks.sort((a, b) => a.at - b.at) });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Fictional orders and records for the fictional patients
// ---------------------------------------------------------------------------

const ord = (o: Omit<CareOrder, "everyDays" | "note"> & Partial<Pick<CareOrder, "everyDays" | "note">>): CareOrder => ({ everyDays: 1, note: "", ...o });

export const INITIAL_CARE_ORDERS: CareOrder[] = [
  // 大浦さん（誤嚥性肺炎、入院2日目、絶食中）
  ord({ id: "co-244-oral", patientId: "90010244", item: "口腔ケア", kind: "ケア", schedule: { kind: "times", times: ["06:00", "10:00", "14:00", "20:00"] }, start: { day: -1, time: "13:00" }, note: "絶食中も1日4回。スポンジブラシで", by: "看護師 渡辺", at: { day: -1, time: "13:00" }, plan: { problemId: "np-244-1", list: "TP" } }),
  ord({ id: "co-244-turn", patientId: "90010244", item: "体位変換", kind: "ケア", schedule: { kind: "every", hours: 2, from: "00:00" }, start: { day: -1, time: "13:00" }, note: "左右の側臥位を交互に", by: "看護師 渡辺", at: { day: -1, time: "13:00" }, plan: { problemId: "np-244-1", list: "TP" } }),
  ord({ id: "co-244-dry", patientId: "90010244", item: "口腔内の乾燥", kind: "観察", choices: ["湿潤", "乾燥", "強い乾燥"], schedule: { kind: "times", times: ["10:00", "18:00"] }, start: { day: -1, time: "13:00" }, by: "看護師 渡辺", at: { day: -1, time: "13:00" }, plan: { problemId: "np-244-1", list: "OP" } }),
  ord({ id: "co-244-sputum", patientId: "90010244", item: "痰の量", kind: "観察", choices: ["少ない", "中くらい", "多い"], schedule: { kind: "times", times: ["06:00", "14:00", "22:00"] }, start: { day: -1, time: "13:00" }, by: "看護師 渡辺", at: { day: -1, time: "13:00" }, plan: { problemId: "np-244-1", list: "OP" } }),
  ord({ id: "co-244-suction", patientId: "90010244", item: "吸引", kind: "ケア", schedule: { kind: "prn" }, start: { day: -1, time: "13:00" }, note: "痰がからむとき。口腔から", by: "看護師 渡辺", at: { day: -1, time: "13:00" }, plan: { problemId: "np-244-1", list: "TP" } }),
  // 佐倉さん（右下腿蜂窩織炎）
  ord({ id: "co-231-red", patientId: "90010231", item: "右下腿の発赤の範囲", kind: "観察", schedule: { kind: "times", times: ["10:00"] }, start: { day: -3, time: "16:00" }, note: "入院時にペンで印をつけた線と比べる", by: "看護師 田中", at: { day: -3, time: "16:00" }, plan: { problemId: "np-231-1", list: "OP" } }),
  ord({ id: "co-231-raise", patientId: "90010231", item: "右下肢の挙上", kind: "ケア", schedule: { kind: "times", times: ["10:00", "14:00", "20:00"] }, start: { day: -3, time: "16:00" }, note: "クッションで足を心臓より高く", by: "看護師 田中", at: { day: -3, time: "16:00" }, plan: { problemId: "np-231-1", list: "TP" } }),
  ord({ id: "co-231-wipe", patientId: "90010231", item: "清拭", kind: "ケア", schedule: { kind: "times", times: ["14:00"] }, everyDays: 2, start: { day: -3, time: "16:00" }, note: "右足は創を避けて", by: "看護師 田中", at: { day: -3, time: "16:00" }, plan: { problemId: "np-231-1", list: "TP" } }),
  // 架空：入院時の血糖が高めだったため、医師に言われて毎食前に測る（経過表の血糖の行の見本）
  ord({ id: "co-231-bg", patientId: "90010231", item: "血糖測定（簡易血糖測定器）", kind: "観察", unit: "mg/dL", schedule: { kind: "times", times: ["07:30", "11:30", "17:30"] }, start: { day: -2, time: "07:00" }, note: "毎食前。値は数字で入れる", by: "看護師 田中", at: { day: -3, time: "17:00" } }),
  // 北村さん（慢性心不全の急性増悪）
  ord({ id: "co-198-edema", patientId: "90010198", item: "下腿のむくみ", kind: "観察", choices: ["なし", "軽い", "強い"], schedule: { kind: "times", times: ["10:00"] }, start: { day: -5, time: "15:00" }, by: "看護師 佐藤", at: { day: -5, time: "15:00" }, plan: { problemId: "np-198-1", list: "OP" } }),
  ord({ id: "co-198-breath", patientId: "90010198", item: "夜間の息苦しさ", kind: "観察", choices: ["なし", "あり"], schedule: { kind: "times", times: ["06:00"] }, start: { day: -5, time: "15:00" }, note: "横になって息苦しくなかったか本人に聞く", by: "看護師 佐藤", at: { day: -5, time: "15:00" }, plan: { problemId: "np-198-1", list: "OP" } }),
  // 森さん（急性腎盂腎炎）
  ord({ id: "co-260-wash", patientId: "90010260", item: "陰部洗浄", kind: "ケア", schedule: { kind: "times", times: ["10:00"] }, start: { day: -2, time: "16:00" }, by: "看護師 佐藤", at: { day: -2, time: "16:00" } }),
];

/** What the fictional earlier shifts saw (only days before today, so it never runs ahead of the clock). */
const SEEN: Record<string, [DayOffset, string, string, string][]> = {
  "co-244-dry": [[-1, "18:00", "乾燥", "看護師 渡辺"]],
  "co-244-sputum": [
    [-1, "14:00", "多い", "看護師 渡辺"],
    [-1, "22:00", "中くらい", "看護師 田中"],
  ],
  "co-231-red": [
    [-2, "10:00", "印の線まで", "看護師 田中"],
    [-1, "10:00", "印より2cmほど内側まで引いた", "看護師 佐藤"],
  ],
  "co-231-bg": [
    [-2, "07:30", "186", "看護師 田中"],
    [-2, "11:30", "214", "看護師 佐藤"],
    [-2, "17:30", "198", "看護師 佐藤"],
    [-1, "07:30", "162", "看護師 渡辺"],
    [-1, "11:30", "188", "看護師 佐藤"],
    [-1, "17:30", "171", "看護師 田中"],
  ],
  "co-198-edema": [
    [-4, "10:00", "強い", "看護師 佐藤"],
    [-3, "10:00", "強い", "看護師 田中"],
    [-2, "10:00", "軽い", "看護師 佐藤"],
    [-1, "10:00", "軽い", "看護師 佐藤"],
  ],
  "co-198-breath": [
    [-4, "06:00", "あり", "看護師 渡辺"],
    [-3, "06:00", "なし", "看護師 渡辺"],
    [-2, "06:00", "なし", "看護師 田中"],
    [-1, "06:00", "なし", "看護師 渡辺"],
  ],
};

export function initialCareRecords(): CareRecord[] {
  const out: CareRecord[] = [];
  for (const [orderId, seen] of Object.entries(SEEN)) {
    const o = INITIAL_CARE_ORDERS.find((x) => x.id === orderId)!;
    for (const [day, time, value, by] of seen) {
      const at = day * 1440 + minutesOf(time);
      out.push({ key: careKey(orderId, at), orderId, patientId: o.patientId, at, status: "実施", value, doneAt: time, writtenAt: time, by });
    }
  }
  // 吸引（必要時）を昨夜1回.
  const at = -1440 + minutesOf("23:10");
  out.push({ key: careKey("co-244-suction", at), orderId: "co-244-suction", patientId: "90010244", at, status: "実施", note: "白色の痰を中くらい", doneAt: "23:10", writtenAt: "23:15", by: "看護師 田中" });
  return out;
}
