// 水分出納（IN/OUT）: what went in (経口・経管・点滴・輸血・その他) and what came out (尿・便・ドレーン・
// 嘔吐・出血・その他), in mL, each with the time and who measured it. 点滴 is not typed again: it comes
// from the drip records (2回実施: what went in = the bag − 残量, at the time it ended) and from one-shot
// injections with a volume in mL. Code adds up per shift and per 24 hours and writes the sum out;
// IN − OUT is shown only when both sides have records. Estimates such as 不感蒸泄 or 代謝水 are not
// added (no official formula is used here). All data is fictional.

import { minutesOf } from "./dates";
import { doseVolumeMl } from "./drafts";
import { clockText, doseStarts, dripCourses, EARLIER_SHIFT, hm, isDripOrder } from "./drip-course";
import { abs, fluidInWindow } from "./flowsheet";
import { drugName } from "./format";
import type { AdminRecord } from "./mar";
import type { DailyRecord, OrderEntry } from "./types";
import { IO } from "./standing";
import { SHIFTS } from "./worksheet";

export const IN_KINDS = ["経口", "経管", "点滴", "輸血", "その他", "食事"] as const;
export const OUT_KINDS = ["尿", "便", "ドレーン", "嘔吐", "出血", "その他"] as const;
export type InKind = (typeof IN_KINDS)[number];
export type OutKind = (typeof OUT_KINDS)[number];
export type IoSide = "IN" | "OUT";

/** Typed by hand. 点滴 comes from the drip records only, so it is never counted twice. */
export const IN_TYPED: InKind[] = IN_KINDS.filter((k) => k !== "点滴");

/** Why a typed entry is taken back (it stays in the history). */
export const IO_VOID_REASONS = ["別の患者に記録した", "量を間違えた", "時刻を間違えた", "その他"] as const;

/**
 * When the totals close. The shifts are the worksheet's (日勤 08:30–17:00, 夜勤 16:30–翌09:00); a shift
 * closes at its end, so the totals do not overlap. These are the fictional hospital's choices.
 */
export const IO_RULES = {
  dayClose: SHIFTS.night.to,
  dayShiftClose: SHIFTS.day.to,
  label: `勤務の終わりで締める（日勤 ${SHIFTS.night.to}〜${SHIFTS.day.to}、夜勤 ${SHIFTS.day.to}〜翌${SHIFTS.night.to}。1日は ${SHIFTS.night.to}〜翌${SHIFTS.night.to}）。締めの時刻ちょうどの記録は、その時刻で終わる勤務に入れる`,
};

export const IO_NOT_INCLUDED = "不感蒸泄・代謝水の推定は入れていません（数えたのは、測って入れた量と注射の記録だけです）。";

/** One typed IN or OUT. */
export interface IoEntry {
  id: string;
  patientId: string;
  side: IoSide;
  kind: InKind | OutKind;
  ml: number;
  count?: number;
  catheter?: boolean;
  bristol?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  meal?: { slot: 0 | 1 | 2; staple: number; side: number };
  /** When it was measured or given (minutes from today 00:00). */
  at: number;
  by: string;
  /** When it was typed ("HH:MM", the app's clock). */
  recordedAt: string;
  /** e.g. which drain, what was drunk. */
  note?: string;
  voided?: { by: string; at: string; reason: string };
}

/** A line of the balance: typed, or taken from the injection records. */
export interface IoLine {
  side: IoSide;
  kind: InKind | OutKind;
  ml: number;
  at: number;
  by: string;
  what: string;
  from: "入力" | "点滴の記録" | "注射の記録" | "前の勤務";
  formula?: string;
  orderId?: string;
  entryId?: string;
  measured?: boolean;
}

/** A period: lo < t ≤ hi (minutes from today 00:00). */
export interface IoWindow {
  label: string;
  lo: number;
  hi: number;
}

export const inWindow = (t: number, w: Pick<IoWindow, "lo" | "hi">) => t > w.lo && t <= w.hi;

/** The 24 hours that start at the close on day `d` (09:00 on day d → 09:00 the next day). */
export const ioDay = (d: number): IoWindow => ({ label: "24時間", lo: abs(d, IO_RULES.dayClose), hi: abs(d + 1, IO_RULES.dayClose) });

export const ioShifts = (d: number): IoWindow[] => [
  { label: "日勤", lo: abs(d, IO_RULES.dayClose), hi: abs(d, IO_RULES.dayShiftClose) },
  { label: "夜勤", lo: abs(d, IO_RULES.dayShiftClose), hi: abs(d + 1, IO_RULES.dayClose) },
];

/** The 24-hour period a time falls in (its start day). */
export const ioDayOf = (t: number) => Math.ceil((t - minutesOf(IO_RULES.dayClose)) / 1440) - 1;

/** The shift a time falls in. */
export const ioShiftAt = (t: number): IoWindow => ioShifts(ioDayOf(t)).find((w) => inWindow(t, w))!;

/** "日勤 09:00〜17:00" / "夜勤 17:00〜翌09:00". */
export const windowText = (w: IoWindow) => `${w.label} ${clockText(w.lo)}〜${clockText(w.hi)}`;

const shortDrug = (o: OrderEntry) => (o.order.type === "injection" ? o.order.items.map((it) => drugName(it.drugCode)).join("＋") : "");

/**
 * All lines of one patient from `from` on: typed entries (not taken back), drips that ended (the bag −
 * 残量, at the end), and one-shot injections with a volume in mL (at the time given). Doses due before
 * this session are taken as given by the earlier shift (fictional), as on the worksheet.
 */
export function ioLines(p: { patientId: string; entries: OrderEntry[]; typed: IoEntry[]; records: Record<string, AdminRecord>; sessionStart: number; nowAbs: number; from: number }): IoLine[] {
  const out: IoLine[] = [];
  for (const e of p.typed) {
    if (e.patientId !== p.patientId || e.voided || e.at < p.from) continue;
    out.push({ side: e.side, kind: e.kind, ml: e.ml, at: e.at, by: e.by, what: [e.kind, e.count !== undefined ? `${e.count}回` : "", e.catheter !== undefined ? `尿道カテーテル${e.catheter ? "あり" : "なし"}` : "", e.bristol ? `ブリストル${e.bristol}` : "", e.meal ? `${["朝", "昼", "夕"][e.meal.slot]} 主食${e.meal.staple}割・副食${e.meal.side}割` : "", e.note ?? ""].filter(Boolean).join("・"), from: "入力", measured: e.kind !== "食事" && e.ml > 0, entryId: e.id });
  }
  for (const c of dripCourses(p.patientId, p.entries, p.records, p.sessionStart, p.nowAbs, p.from)) {
    if (!c.end) continue;
    out.push({ side: "IN", kind: "点滴", ml: c.end.givenMl, at: c.end.at, by: c.end.by, what: `${c.label}${c.bag ? `（${c.bag}本目）` : ""}`, from: c.source === "前の勤務" ? "前の勤務" : "点滴の記録", formula: c.end.formula, orderId: c.orderId });
  }
  // One-shot injections (静注 and the like) with a volume in mL: one record, counted when given.
  for (const e of p.entries) {
    if (e.order.type !== "injection" || isDripOrder(e.order)) continue;
    const vol = doseVolumeMl(e.order.items);
    if (vol <= 0) continue;
    const what = `${shortDrug(e)}（${e.order.route}）`;
    for (const r of Object.values(p.records)) {
      if (r.orderId !== e.id || r.patientId !== p.patientId || r.status !== "実施") continue;
      const at = minutesOf(r.doneAt);
      if (at >= p.from) out.push({ side: "IN", kind: "点滴", ml: vol, at, by: r.by, what, from: "注射の記録", formula: `${vol}mL（1回量）`, orderId: e.id });
    }
    for (const { at } of doseStarts(e, p.from, Math.min(p.sessionStart, p.nowAbs + 1), p.nowAbs)) {
      if (!p.records[`${e.id}|${at}`]) out.push({ side: "IN", kind: "点滴", ml: vol, at, by: EARLIER_SHIFT, what, from: "前の勤務", formula: `${vol}mL（1回量）`, orderId: e.id });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

export interface IoTotal {
  in: number;
  out: number;
  /** IN − OUT, or null when one side has no record in the period. */
  balance: number | null;
  inBy: Partial<Record<InKind, number>>;
  outBy: Partial<Record<OutKind, number>>;
  inCount: number;
  outCount: number;
  /** The sum written out, e.g. "IN 1,250（経口 750 ＋ 点滴 500）− OUT 1,100（尿 1,100）＝ +150mL". */
  formula: string;
}

const n = (x: number) => x.toLocaleString("ja-JP");
export const signed = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : "±"}${n(Math.abs(x))}`;

export function ioTotal(lines: IoLine[], w: Pick<IoWindow, "lo" | "hi">): IoTotal {
  const inBy: Partial<Record<InKind, number>> = {};
  const outBy: Partial<Record<OutKind, number>> = {};
  let inCount = 0;
  let outCount = 0;
  for (const l of lines) {
    if (!inWindow(l.at, w) || l.measured === false) continue;
    if (l.side === "IN") {
      inBy[l.kind as InKind] = (inBy[l.kind as InKind] ?? 0) + l.ml;
      inCount++;
    } else {
      outBy[l.kind as OutKind] = (outBy[l.kind as OutKind] ?? 0) + l.ml;
      outCount++;
    }
  }
  const sum = (o: Partial<Record<string, number>>) => Object.values(o).reduce<number>((a, b) => a + (b ?? 0), 0);
  const tin = sum(inBy);
  const tout = sum(outBy);
  const parts = (o: Partial<Record<string, number>>, order: readonly string[]) => order.filter((k) => o[k] !== undefined).map((k) => `${k} ${n(o[k]!)}`).join(" ＋ ");
  const balance = inCount && outCount ? tin - tout : null;
  const inText = inCount ? `IN ${n(tin)}（${parts(inBy, IN_KINDS)}）` : "IN 記録なし";
  const outText = outCount ? `OUT ${n(tout)}（${parts(outBy, OUT_KINDS)}）` : "OUT 記録なし";
  const formula = balance === null ? `${inText}・${outText}。両方の記録がないので差は出しません` : `${inText} − ${outText} ＝ ${signed(balance)}mL`;
  return { in: tin, out: tout, balance, inBy, outBy, inCount, outCount, formula };
}

/** IN from the injection orders in a period, as ordered (an estimate, not a record). */
export const plannedIvMl = (entries: OrderEntry[], w: Pick<IoWindow, "lo" | "hi">, nowAbs: number) => Math.round(fluidInWindow(entries, w.lo, w.hi, nowAbs));

/** The patient's days with the typed urine added to each calendar day (0:00–24:00). */
export function withIoUrine(daily: DailyRecord[], typed: IoEntry[]): DailyRecord[] {
  const days = new Map(daily.map(d => [d.day, { ...d }]));
  for (const e of [...typed].sort((a, b) => a.at - b.at)) {
    if (e.voided) continue;
    const day = Math.floor(e.at / 1440);
    const d = days.get(day) ?? { day };
    if (e.side === "OUT" && e.kind === "尿") d.urineMl = (d.urineMl ?? 0) + e.ml;
    if (e.side === "OUT" && e.kind === "便" && e.count !== undefined) d.stools = (d.stools ?? 0) + e.count;
    if (e.meal) {
      const meals: [number | null, number | null, number | null] = Array.isArray(d.meals) ? [...d.meals] : [null, null, null];
      const sides: [number | null, number | null, number | null] = d.mealSides ? [...d.mealSides] : [null, null, null];
      meals[e.meal.slot] = e.meal.staple;
      sides[e.meal.slot] = e.meal.side;
      d.meals = meals;
      d.mealSides = sides;
    }
    days.set(day, d);
  }
  return [...days.values()].sort((a, b) => a.day - b.day);
}

/** Patients whose 指示簿 says to measure IN/OUT and who have nothing typed yet in the shift going on now. */
export function ioMissing(patients: { id: string; io: string | null | undefined }[], typed: IoEntry[], nowAbs: number): { patientId: string; shift: IoWindow }[] {
  const shift = ioShiftAt(nowAbs);
  return patients
    .filter((p) => p.io === IO[0] && !typed.some((e) => e.patientId === p.id && !e.voided && inWindow(e.at, { lo: shift.lo, hi: nowAbs })))
    .map((p) => ({ patientId: p.id, shift }));
}

/** Check what is typed: mL as a whole number above 0 (up to 5,000), and a time already past. */
export function ioProblems(x: { ml: string; at: number | null; nowAbs: number }): string[] {
  const out: string[] = [];
  const ml = Number(x.ml);
  if (!x.ml.trim() || !Number.isInteger(ml) || ml <= 0 || ml > 5000) out.push("量は 1〜5,000 の整数（mL）で入れてください。");
  if (x.at === null) out.push("時刻は 14:30 の形で入れてください。");
  else if (x.at > x.nowAbs) out.push("時刻がいまより後です。");
  else if (x.at < x.nowAbs - 1440) out.push("24時間より前の時刻は入れられません。");
  return out;
}

// ---------------------------------------------------------------------------
// Fictional data: 北村 博（慢性心不全、膀胱留置カテーテルで尿量を毎時、水分制限 1,000mL/日）has
// IN/OUT since yesterday 09:00. Up to now only (the app opens at any time of day).
// ---------------------------------------------------------------------------

const KITAMURA = "90010198";
// Hourly urine (mL) from yesterday 10:00 to 23:00 (1,250mL; with 450mL before 09:00 the day is 1,700mL as in vitals.ts),
// then today 00:00–23:00.
const URINE_YESTERDAY = [90, 110, 80, 70, 120, 100, 90, 80, 110, 100, 80, 70, 80, 70];
const URINE_TODAY = [60, 50, 50, 40, 50, 60, 70, 80, 90, 100, 90, 110, 80, 70, 100, 90, 80, 90, 70, 80, 60, 70, 60, 50];
const DRINKS: [string, number, string][] = [
  ["07:30", 150, "朝食時のお茶"],
  ["10:00", 100, "水"],
  ["12:00", 150, "昼食時のお茶"],
  ["15:00", 100, "水"],
  ["18:00", 150, "夕食時のお茶"],
  ["20:00", 100, "内服時の水"],
];
const nurseAt = (t: number) => (inWindow(t, ioShifts(ioDayOf(t))[0]) ? "看護師 高橋" : "看護師 渡辺");

export function initialIo(nowAbs: number): IoEntry[] {
  const out: IoEntry[] = [];
  const add = (side: IoSide, kind: InKind | OutKind, ml: number, at: number, note?: string) => {
    if (at > nowAbs) return;
    out.push({ id: `io-seed-${side}-${kind}-${at}`, patientId: KITAMURA, side, kind, ml, at, by: nurseAt(at), recordedAt: hm(at), ...(note ? { note } : {}) });
  };
  URINE_YESTERDAY.forEach((ml, i) => add("OUT", "尿", ml, abs(-1, "10:00") + i * 60, "膀胱留置カテーテル"));
  URINE_TODAY.forEach((ml, i) => add("OUT", "尿", ml, i * 60, "膀胱留置カテーテル"));
  for (const day of [-1, 0]) for (const [t, ml, note] of DRINKS) if (abs(day, t) > abs(-1, IO_RULES.dayClose)) add("IN", "経口", ml, abs(day, t), note);
  add("OUT", "便", 150, abs(-1, "13:30"), "普通便");
  return out.sort((a, b) => a.at - b.at);
}

/** The bedside completion added these balance entries; keep them as voided history too. */
export const transfusionIoIds = (entries: IoEntry[], patientId: string, lot: string): string[] =>
  entries.filter((e) => e.patientId === patientId && e.kind === "輸血" && e.note === `製造番号 ${lot}` && !e.voided).map((e) => e.id);
