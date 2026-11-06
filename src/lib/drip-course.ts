import { patternDay } from "./day-pattern";
// 点滴の開始と終了（2回実施）: a drip is recorded when it starts and again when it ends, with what was
// left in the bag (残量). What went in is counted by code — the bag's volume − 残量 — and goes into the
// 水分出納 (io-balance.ts) at the time it ended. The expected end is the start + the minutes the bag
// takes at the ordered rate (drip.ts). A one-shot injection (静注) and oral drugs stay one record.
// The code only does the arithmetic and compares times; people decide.

import { minutesOf } from "./dates";
import { doseVolumeMl } from "./drafts";
import { dripRate } from "./drip";
import { doseTimes, orderInterval } from "./flowsheet";
import { drugName } from "./format";
import { findDrug } from "./master";
import { marKey, type AdminRecord, type DripEnd, type DripStopReason } from "./mar";
import type { InjectionOrder, OrderEntry } from "./types";

/** The bag of one dose: volume, the rate from the order, and the minutes it takes at that rate. */
export interface DripInfo {
  volumeMl: number;
  mlPerH: number | null;
  minutes: number | null;
}

/** A drip (点滴静注 with a volume in mL) is recorded at 開始 and at 終了. */
export const isDripOrder = (o: InjectionOrder) => o.route === "点滴静注" && doseVolumeMl(o.items) > 0;

export function dripInfo(o: InjectionOrder): DripInfo | undefined {
  if (!isDripOrder(o)) return undefined;
  const r = dripRate(o);
  return { volumeMl: doseVolumeMl(o.items), mlPerH: r?.mlPerH ?? null, minutes: r?.minutesPerBag ?? null };
}

/** "HH:MM" of a time (minutes from today 00:00), whatever its day. */
export const hm = (at: number) => {
  const m = ((at % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** "HH:MM" today, "翌HH:MM" tomorrow, "昨日 HH:MM" yesterday (minutes from today 00:00). */
export function clockText(at: number): string {
  const d = Math.floor(at / 1440);
  const t = hm(at);
  return d === 0 ? t : d === 1 ? `翌${t}` : d === -1 ? `昨日 ${t}` : `${d > 0 ? "+" : ""}${d}日 ${t}`;
}

const isFluid = (o: InjectionOrder) => o.items.every((it) => findDrug(it.drugCode)?.kind === "輸液");

/**
 * Scheduled starts in [lo, hi) of an injection with set times: every N hours, once, or each bag of a
 * continuous fluid (24h ÷ bags a day from the start, as on the worksheet). Others have no set time.
 */
export function doseStarts(e: OrderEntry, lo: number, hi: number, nowAbs: number): { at: number; bag?: number }[] {
  if (e.order.type !== "injection") return [];
  const o = e.order;
  if (o.doseTimes?.length || o.schedule.kind === "every_hours") return doseTimes(e, nowAbs, lo, hi).map((at) => ({ at }));
  const { from, to } = orderInterval(e, nowAbs);
  if (o.schedule.kind === "once") return from >= lo && from < hi ? [{ at: from }] : [];
  if (!isFluid(o)) return [];
  const step = 1440 / o.schedule.count;
  const out: { at: number; bag: number }[] = [];
  let n = 0;
  for (let t = from; t < Math.min(hi, to ?? Infinity); t += step) {
    n++;
    if (t >= lo && patternDay(o.dayPattern, o.start.day, Math.floor(t / 1440))) out.push({ at: t, bag: n });
  }
  return out;
}

/** One bag (or one dose) of a drip, from its start to its end. */
export interface DripCourse {
  key: string;
  orderId: string;
  patientId: string;
  /** The scheduled time (or the time given, for a dose without a set time): the record's key. */
  at: number;
  bag?: number;
  label: string;
  volumeMl: number;
  mlPerH: number | null;
  minutes: number | null;
  start: number;
  startBy: string;
  /**
   * 記録 = recorded in this app; 前の勤務 = due before this session began, taken as started on time by
   * the (fictional) earlier shift and, if it ended before the session, as the whole bag; 1回の記録 =
   * recorded in one step before 2回実施 (taken as the whole bag at its expected end).
   */
  source: "記録" | "前の勤務" | "1回の記録";
  expectedEnd: number | null;
  end?: { at: number; by: string; givenMl: number; leftMl: number; full: boolean; reason?: string; formula: string };
  /** The record in this app, when there is one. */
  record?: AdminRecord;
}

export const EARLIER_SHIFT = "前の勤務";

const labelOf = (o: InjectionOrder) => o.items.map((it) => `${drugName(it.drugCode)} ${it.amount}${it.unit}`).join(" ＋ ");

/** "500mL − 残量 50mL = 450mL", or "全量 500mL". */
export const givenFormula = (volumeMl: number, end: Pick<DripEnd, "full" | "leftMl" | "givenMl">) => (end.full ? `全量 ${volumeMl}mL` : `${volumeMl}mL − 残量 ${end.leftMl}mL = ${end.givenMl}mL`);

/**
 * The drips of one patient that started at or after `from` (or are still running), in time order.
 * Doses due before this session with no record are taken as given by the earlier shift (fictional),
 * like the worksheet does; one still running when the session began stays running until a nurse records its end.
 */
export function dripCourses(patientId: string, entries: OrderEntry[], records: Record<string, AdminRecord>, sessionStart: number, nowAbs: number, from: number): DripCourse[] {
  const out: DripCourse[] = [];
  const mine = Object.values(records).filter((r) => r.patientId === patientId && r.status === "実施");
  for (const e of entries) {
    if (e.order.type !== "injection") continue;
    const o = e.order;
    const info = dripInfo(o);
    if (!info) continue;
    const label = labelOf(o);
    const base = { orderId: e.id, patientId, label, volumeMl: info.volumeMl, mlPerH: info.mlPerH, minutes: info.minutes };
    // Before this session: no record means the earlier shift gave it (look back two days for one still running).
    for (const { at, bag } of doseStarts(e, from - 2880, Math.min(sessionStart, nowAbs + 1), nowAbs)) {
      const key = marKey(e.id, at);
      if (records[key]) continue;
      const expectedEnd = info.minutes === null ? null : at + info.minutes;
      const ended = expectedEnd === null || expectedEnd < sessionStart;
      if (ended && (expectedEnd ?? at) < from) continue;
      out.push({
        ...base,
        key,
        at,
        bag,
        start: at,
        startBy: EARLIER_SHIFT,
        source: "前の勤務",
        expectedEnd,
        end: ended ? { at: expectedEnd ?? at, by: EARLIER_SHIFT, givenMl: info.volumeMl, leftMl: 0, full: true, formula: `全量 ${info.volumeMl}mL（前の勤務の記録）` } : undefined,
      });
    }
    const bags = new Map(doseStarts(e, -Infinity, nowAbs + 1, nowAbs).map((x) => [x.at, x.bag]));
    for (const r of mine.filter((x) => x.orderId === e.id)) {
      const vol = r.drip?.volumeMl ?? info.volumeMl;
      const minutes = r.drip ? r.drip.minutes : info.minutes;
      const start = r.drip?.startAt ?? minutesOf(r.doneAt);
      const expectedEnd = minutes === null ? null : start + minutes;
      const c: DripCourse = { ...base, key: r.key, at: r.at, bag: bags.get(r.at), volumeMl: vol, mlPerH: r.drip?.mlPerH ?? info.mlPerH, minutes, start, startBy: r.by, source: r.drip ? "記録" : "1回の記録", expectedEnd, record: r };
      if (r.end) c.end = { at: r.end.at, by: r.end.by, givenMl: r.end.givenMl, leftMl: r.end.leftMl, full: r.end.full, reason: r.end.reason, formula: givenFormula(vol, r.end) };
      else if (!r.drip) c.end = { at: expectedEnd ?? start, by: r.by, givenMl: vol, leftMl: 0, full: true, formula: `全量 ${vol}mL（1回で記録した分）` };
      if (c.end && c.end.at < from) continue;
      out.push(c);
    }
  }
  return out.sort((a, b) => a.start - b.start || a.label.localeCompare(b.label));
}

/** Minutes past the expected end of a running drip (0 or less = not past). */
export const pastEnd = (c: { expectedEnd: number | null; end?: unknown }, nowAbs: number) => (c.end || c.expectedEnd === null ? 0 : nowAbs - c.expectedEnd);

/** What the nurse enters at 終了, checked: 全量, or 残量 (0 … the bag), and why when some is left. */
export function dripEndOf(
  volumeMl: number,
  x: { full: boolean; leftMl?: number; reason?: DripStopReason | ""; at: number; start: number; nowAbs: number },
): { ok: true; givenMl: number; leftMl: number; full: boolean; formula: string } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const left = x.full ? 0 : x.leftMl;
  if (left === undefined || !Number.isFinite(left)) problems.push("残量を mL で入れてください（全部入ったときは「全量」）。");
  else if (left < 0 || left > volumeMl) problems.push(`残量は 0〜${volumeMl}mL で入れてください。`);
  if (left && left > 0 && !x.reason) problems.push("残量があるときは、終わった理由を選んでください。");
  if (x.at < x.start) problems.push("終了の時刻が開始より前です。");
  if (x.at > x.nowAbs) problems.push("終了の時刻がいまより後です。");
  if (problems.length) return { ok: false, problems };
  const leftMl = left ?? 0;
  const full = leftMl === 0;
  const givenMl = volumeMl - leftMl;
  return { ok: true, givenMl, leftMl, full, formula: givenFormula(volumeMl, { full, leftMl, givenMl }) };
}

/** The start record to end, for a drip begun by the earlier shift (no record in this app yet). */
export function startRecordOf(c: DripCourse): AdminRecord {
  return (
    c.record ?? {
      key: c.key,
      orderId: c.orderId,
      patientId: c.patientId,
      at: c.at,
      status: "実施",
      doneAt: hm(c.start),
      by: c.startBy,
      checked: { patient: false, label: null },
      note: "開始は前の勤務の記録",
      drip: { volumeMl: c.volumeMl, mlPerH: c.mlPerH, minutes: c.minutes, startAt: c.start },
    }
  );
}

/** The words for the audit log when a drip record changes (undefined = not a drip change). */
export function dripAction(r: AdminRecord, prev?: AdminRecord): string | undefined {
  if (r.end && !prev?.end) return "確定（点滴の終了）";
  if (!r.end && prev?.end) return "点滴の終了の記録を取り消した";
  if (r.drip && !prev) return "確定（点滴の開始）";
  return undefined;
}

/** "終了 14:50 残量 50mL → 入った量 450mL（漏れ）". */
export const endText = (r: AdminRecord) =>
  r.end ? `終了 ${clockText(r.end.at)} ${r.end.full ? `全量 ${r.end.givenMl}mL` : `残量 ${r.end.leftMl}mL → 入った量 ${r.end.givenMl}mL`}${r.end.reason ? `（${r.end.reason}）` : ""}` : "";

/**
 * "HH:MM" typed for something already done, as minutes from today 00:00: the latest such time up to
 * now (so "23:30" typed at 08:00 is last night). "24:30" and later are the app's continued clock.
 */
export function pastTime(text: string, nowAbs: number): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m || Number(m[2]) > 59 || Number(m[1]) > 47) return null;
  const h = Number(m[1]);
  const t = h * 60 + Number(m[2]);
  if (h >= 24) return t <= nowAbs ? t : null;
  return t + 1440 * Math.floor((nowAbs - t) / 1440);
}
