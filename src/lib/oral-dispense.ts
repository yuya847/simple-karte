import { rxLastDay, patternText } from "./day-pattern";
// 内服の調剤 (薬剤部): the 定期 and 臨時 prescriptions to dispense for the ward, counted in code.
// - 定期: the usual batch, from tomorrow for N days.
// - 臨時: written today, the whole course. A 定期 written today is here only for today's doses (初回);
//   from tomorrow it comes with the 定期 batch.
// 持参薬 (the patient's own drugs) and 退院時 (dispensed with 薬袋 in 退院時の薬) are not dispensed here.
// 頓用 has no count of doses, so it is listed apart and not counted.
// The amount is 1回量 × the doses counted from the order (= 1回量 × 回数 × 日数 when the days are whole).
// Each Rp is 調剤 → 鑑査 → 払出, with who and when. Nothing here is decided by AI.

import { prescriptionCell } from "./calendar";
import { findOralDrug, WARD_RULES } from "./master";
import { isNarcotic } from "./drug-class";
import { timingName } from "./rx";
import type { DayOffset, DoseTiming, OrderEntry, PrescriptionOrder } from "./types";
import type { WorkPatient } from "./worksheet";

export type OralBatch = { kind: "定期"; days: number } | { kind: "臨時" };

export interface DoseSlot {
  day: DayOffset;
  timing: DoseTiming;
}

/** One drug of an Rp, with the doses counted in the range. */
export interface OralLine {
  orderId: string;
  code: string;
  name: string;
  strength: string;
  per: number;
  unit: string;
  slots: DoseSlot[];
  /** 1回量 × the number of doses. */
  total: number;
}

/** Drugs taken with one usage (one Rp), to dispense together. */
export interface OralRp {
  key: string;
  category: "定期" | "臨時";
  timings: DoseTiming[];
  /** "1日2回　朝夕食後". */
  how: string;
  lines: OralLine[];
  orderIds: string[];
  doctor: string;
  writtenAt: { day: DayOffset; time: string };
  /** The days counted (inclusive). */
  from: DayOffset;
  to: DayOffset;
  /** A 定期 written today: only today's doses (the rest comes with the 定期 batch). */
  first?: boolean;
  /** No 日数 on a 臨時: the doses cannot be counted. */
  unbounded?: boolean;
}

export interface OralPatient extends WorkPatient {
  rps: OralRp[];
  /** 頓用 orders (no count of doses; not dispensed here). */
  prn: { orderId: string; name: string; text: string }[];
}

const TIMING_ORDER: DoseTiming[] = ["朝", "昼", "夕", "眠前"];
const round2 = (n: number) => Math.round(n * 100) / 100;

/** "朝食後" … for the label of one packet. */
export const TIMING_LABEL: Record<DoseTiming, string> = { 朝: "朝食後", 昼: "昼食後", 夕: "夕食後", 眠前: "眠前" };

type Rx = OrderEntry & { order: PrescriptionOrder };
const isWardRx = (e: OrderEntry): e is Rx => e.order.type === "prescription" && (e.order.category === "定期" || e.order.category === "臨時") && e.status === "有効";

/** The doses of a prescription on these days (from the order's start, days and stop). */
function slotsOf(e: Rx, from: DayOffset, to: DayOffset, nowAbs: number): DoseSlot[] {
  const out: DoseSlot[] = [];
  for (let day = from; day <= to; day++) {
    for (const s of prescriptionCell(e, day, nowAbs).slots) if (s.state !== null) out.push({ day, timing: s.timing });
  }
  return out.sort((a, b) => a.day - b.day || TIMING_ORDER.indexOf(a.timing) - TIMING_ORDER.indexOf(b.timing));
}

/** The range to count for this order in this batch, or null when it is not dispensed in it. */
function rangeOf(e: Rx, batch: OralBatch): { from: DayOffset; to: DayOffset; first?: boolean; unbounded?: boolean } | null {
  const o = e.order;
  if (batch.kind === "定期") return o.category === "定期" ? { from: 1, to: batch.days } : null;
  if (e.day !== 0) return null;
  if (o.category === "定期") return o.start.day <= 0 ? { from: 0, to: 0, first: true } : null;
  // 臨時: the whole course. The last day can be start + days (when it starts after the day's first timing).
  if (!o.days) return { from: o.start.day, to: o.start.day, unbounded: true };
  return { from: o.start.day, to: o.dayPattern ? rxLastDay(o)! : o.start.day + o.days };
}

/** What to dispense for each patient in this batch: Rp by Rp, the amounts counted from the orders. */
export function oralToDispense(people: WorkPatient[], batch: OralBatch, nowAbs: number): OralPatient[] {
  const out: OralPatient[] = [];
  for (const x of people) {
    const groups = new Map<string, { e: Rx; range: NonNullable<ReturnType<typeof rangeOf>> }[]>();
    const prn: OralPatient["prn"] = [];
    for (const e of x.entries) {
      if (!isWardRx(e)) continue;
      const o = e.order;
      if (o.timings.length === 0) {
        prn.push({ orderId: e.id, name: findOralDrug(o.drugCode)?.name ?? o.drugCode, text: `1回${o.amount}${o.unit}　頓用 ${o.prn ?? "必要時"}${o.maxPerDay ? `（1日${o.maxPerDay}回まで）` : ""}` });
        continue;
      }
      const range = rangeOf(e, batch);
      if (!range) continue;
      const k = `${o.category}|${o.rp ?? e.id}`;
      groups.set(k, [...(groups.get(k) ?? []), { e, range }]);
    }
    const rps: OralRp[] = [];
    for (const [k, es] of groups) {
      const { e: head, range } = es[0];
      const lines: OralLine[] = es.map(({ e }) => {
        const m = findOralDrug(e.order.drugCode);
        const slots = range.unbounded ? [] : slotsOf(e, range.from, range.to, nowAbs);
        return { orderId: e.id, code: e.order.drugCode, name: m?.name ?? e.order.drugCode, strength: m?.strength ?? "", per: e.order.amount, unit: e.order.unit, slots, total: round2(e.order.amount * slots.length) };
      });
      if (!range.unbounded && lines.every((l) => l.slots.length === 0)) continue;
      const used = lines.flatMap((l) => l.slots.map((s) => s.day));
      rps.push({
        key: k.split("|")[1],
        category: head.order.category as "定期" | "臨時",
        timings: head.order.timings,
        how: `${head.order.dayPattern ? patternText(head.order.dayPattern) + "　" : ""}1日${head.order.timings.length}回　${timingName(head.order.timings)}`,
        lines,
        orderIds: es.map(({ e }) => e.id),
        doctor: head.author,
        writtenAt: { day: head.day, time: head.time },
        from: used.length ? Math.min(...used) : range.from,
        to: used.length ? Math.max(...used) : range.to,
        ...(range.first ? { first: true } : {}),
        ...(range.unbounded ? { unbounded: true } : {}),
      });
    }
    if (rps.length || prn.length) out.push({ ...x, rps, prn });
  }
  return out;
}

/** "1回1錠 × 1日2回 × 4日 = 8錠", or "1回1錠 × 7回 = 7錠" when the first or last day is not whole. */
export function qtyFormula(line: OralLine, timesPerDay: number): string {
  const days = new Set(line.slots.map((s) => s.day)).size;
  const n = line.slots.length;
  const head = `1回${line.per}${line.unit}`;
  if (n > 0 && n === timesPerDay * days) return `${head} × 1日${timesPerDay}回 × ${days}日 = ${line.total}${line.unit}`;
  return `${head} × ${n}回 = ${line.total}${line.unit}`;
}

/** The first and the last dose counted. */
export function slotRange(rp: OralRp): { first: DoseSlot; last: DoseSlot } | null {
  const all = rp.lines.flatMap((l) => l.slots).sort((a, b) => a.day - b.day || TIMING_ORDER.indexOf(a.timing) - TIMING_ORDER.indexOf(b.timing));
  return all.length ? { first: all[0], last: all[all.length - 1] } : null;
}

// ---------------------------------------------------------------------------
// 配薬 (一包化): one packet per day and timing, with every drug taken then.
// ---------------------------------------------------------------------------

export interface Packet {
  day: DayOffset;
  timing: DoseTiming;
  /** The ward's time for this timing (WARD_RULES.medTimes). */
  time: string;
  drugs: { name: string; strength: string; per: number; unit: string; rp: string }[];
}

export function packetsOf(rps: OralRp[]): Packet[] {
  const map = new Map<string, Packet>();
  for (const rp of rps) {
    for (const l of rp.lines) {
      for (const s of l.slots) {
        const k = `${s.day}|${s.timing}`;
        const p = map.get(k) ?? { day: s.day, timing: s.timing, time: WARD_RULES.medTimes[s.timing], drugs: [] };
        p.drugs.push({ name: l.name, strength: l.strength, per: l.per, unit: l.unit, rp: rp.key });
        map.set(k, p);
      }
    }
  }
  return [...map.values()].sort((a, b) => a.day - b.day || TIMING_ORDER.indexOf(a.timing) - TIMING_ORDER.indexOf(b.timing));
}

// ---------------------------------------------------------------------------
// 調剤 → 鑑査 → 払出
// ---------------------------------------------------------------------------

export interface OralStep {
  by: string;
  at: string;
}

export interface OralRecord {
  prepared?: OralStep;
  checked?: OralStep;
  issued?: OralStep;
  /** What was counted when it was prepared (qtyText); a change after that needs a new 調剤. */
  qty?: string;
}

export type OralStepName = "prepared" | "checked" | "issued";

export const STEP_LABEL: Record<OralStepName, string> = { prepared: "調剤", checked: "鑑査", issued: "払出" };

/** The key a record is kept under: the Rp and the days counted. */
export const oralKey = (rp: OralRp) => `${rp.category}|${rp.key}|${rp.from}-${rp.to}`;

/** What was counted, to notice a change after 調剤. */
export const qtyText = (rp: OralRp) => rp.lines.map((l) => `${l.code}×${l.total}`).join(",");

/** Why this step cannot be recorded now, or null. `block` is the order's own block (dispenseBlock). */
export function stepBlock(step: OralStepName, rec: OralRecord | undefined, rp: OralRp, block: string | null): string | null {
  if (rp.lines.some((l) => isNarcotic(l.code))) return "麻薬の画面で払出";
  if (rp.unbounded) return "日数の指定がないので、量を数えられません。医師に日数を確かめてください。";
  if (block) return block;
  const fresh = !!rec?.prepared && rec.qty === qtyText(rp);
  if (step === "prepared") return fresh ? "調剤済みです。" : null;
  if (!rec?.prepared) return "先に調剤を記録してください。";
  if (!fresh) return "調剤のあとで処方が変わりました。調剤し直してください。";
  if (step === "checked") return rec.checked ? "鑑査済みです。" : null;
  if (!rec.checked) return "先に鑑査を記録してください。";
  return rec.issued ? "払出済みです。" : null;
}

/** The record after this step. A new 調剤 (after a change) starts the record again. */
export function recordStep(rec: OralRecord | undefined, step: OralStepName, rp: OralRp, who: OralStep): OralRecord {
  if (stepBlock(step, rec, rp, null)) return rec ?? {};
  if (step === "prepared") return { prepared: who, qty: qtyText(rp) };
  return { ...rec, [step]: who };
}

/** The same pharmacist prepared and checked it (allowed when alone, but noted). */
export const sameHands = (rec: OralRecord | undefined): boolean => !!rec?.prepared && !!rec.checked && rec.prepared.by === rec.checked.by;
