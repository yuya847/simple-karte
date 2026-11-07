// 確定したオーダを ICU 記録として読む（読み替え）。人工呼吸の設定のオーダ（PROC-VENT）は呼吸器の設定の行に、持続の
// 注射オーダ（continuous）は持続投与（注射カレンダーの速さの変更＝中止と新規も速さの履歴に）に、持続の透析のオーダ
// （PROC-HD の CHDF・CHD・CHF）は CRRT の条件になり、いまの設定・量
// （current-oxygen・一覧・SOFA・P/F・出納・申し送り）はそこから出る。保存しているのは ICU 記録の元の行だけで、
// 読み替えた行（fromOrder）は保存しない（savedIcuRecords）。オーダのない患者は元の行をそのまま読む。
import { abs } from "../flowsheet";
import { findDrug } from "../master";
import { isCrrt } from "../procedures";
import { currentEntries, type SessionChanges } from "../record";
import type { HistoryEntry, InjectionOrder, OrderEntry, Patient, ProcedureOrder } from "../types";
import { itemMg, itemMl } from "./injection-gamma";
import type { At, CrrtSetting, IcuRecords, Infusion, VentSetting } from "./types";

type Proc = OrderEntry & { order: ProcedureOrder };
type Inj = OrderEntry & { order: InjectionOrder };
const isVent = (e: HistoryEntry): e is Proc => e.kind === "order" && e.order.type === "procedure" && e.order.code === "PROC-VENT" && !!e.order.vent;
const isDrip = (e: HistoryEntry): e is Inj => e.kind === "order" && e.order.type === "injection" && !!e.order.continuous;
const isCrrtOrder = (e: HistoryEntry): e is Proc => e.kind === "order" && e.order.type === "procedure" && e.order.code === "PROC-HD" && isCrrt(e.order.hd);
/** The orders read into ICU 記録. */
export const isIcuOrder = (e: HistoryEntry): e is OrderEntry => isVent(e) || isDrip(e) || isCrrtOrder(e);

export interface IcuOrders { weightKg?: number; entries: OrderEntry[] }

/** The ICU orders of each patient as they stand now (stops and replacements applied), only for patients that have one. */
export function icuOrderEntries(patients: Pick<Patient, "id" | "history" | "weightKg">[], charts: Record<string, SessionChanges | undefined>): Record<string, IcuOrders> {
  const out: Record<string, IcuOrders> = {};
  for (const p of patients) {
    const changes = charts[p.id];
    if (!p.history.some(isIcuOrder) && !changes?.added.some(isIcuOrder)) continue;
    out[p.id] = { weightKg: p.weightKg, entries: currentEntries(p as Patient, changes).filter(isIcuOrder) };
  }
  return out;
}

const startOf = (e: OrderEntry & { order: { start: { day: number; time?: string } } }): At => ({ day: e.order.start.day, time: e.order.start.time ?? e.time });
/** When a stopped (or ended) order ended; without a clock time it ran to the end of that day. */
function endOf(e: OrderEntry): At | undefined {
  if ((e.status === "中止" || e.status === "終了") && e.stoppedOn !== undefined) return e.stoppedTime ? { day: e.stoppedOn, time: e.stoppedTime } : { day: e.stoppedOn + 1, time: "00:00" };
  if (e.status === "終了" && e.order.type === "injection" && e.order.end) return { ...e.order.end };
  return undefined;
}
const t = (a: At) => abs(a.day, a.time);

/** 人工呼吸の設定のオーダから、呼吸器の設定の行（その注文の id を fromOrder に）。 */
export function ventRowsOf(patientId: string, entries: OrderEntry[]): VentSetting[] {
  return entries.filter(isVent).flatMap((e) => {
    const at = startOf(e), end = endOf(e);
    if (end && t(end) <= t(at)) return [];
    return [{ ...e.order.vent!, id: `order:${e.id}`, patientId, at, by: e.author, fromOrder: e.id, ...(end ? { end } : {}) }];
  });
}

/**
 * 持続の注射オーダ（同じ infusionId の、中止と新規でつながった注文）から持続投与。記録があれば、その記録にない時刻の
 * 速さの変更と、オーダの中止による終了を足す。記録がなければオーダから作る（濃度は量と規格から、体重はカルテ）。
 */
export function infusionsOf(patientId: string, entries: OrderEntry[], saved: Infusion[], weightKg?: number): Infusion[] {
  const chains = new Map<string, Inj[]>();
  for (const e of entries.filter(isDrip)) chains.set(e.order.continuous!.infusionId, [...(chains.get(e.order.continuous!.infusionId) ?? []), e]);
  const out: Infusion[] = [];
  for (const [id, chain] of chains) {
    const orders = chain.filter((e) => e.order.rateMlPerH !== undefined).sort((a, b) => t(startOf(a)) - t(startOf(b)));
    if (!orders.length) continue;
    const last = orders.at(-1)!, end = endOf(last);
    const changes = orders.map((e) => ({ at: startOf(e), rateMlPerH: e.order.rateMlPerH!, by: e.author, fromOrder: e.id }));
    const record = saved.find((i) => i.id === id && i.patientId === patientId);
    if (record) {
      const added = changes.filter((c) => c.fromOrder !== record.orderId && !record.changes.some((x) => t(x.at) === t(c.at)));
      if (added.length || (!record.end && end)) out.push({ ...record, changes: [...record.changes, ...added], ...(!record.end && end ? { end, endFromOrder: true } : {}) });
      continue;
    }
    const first = orders[0], main = first.order.items[0], drug = main ? findDrug(main.drugCode) : undefined;
    if (!drug) continue;
    const mg = itemMg(main, drug);
    const mls = first.order.items.map((it) => { const d = findDrug(it.drugCode); return d ? itemMl(it, d) : null; });
    const ml = mls.some((v) => v === null) ? null : mls.reduce<number>((n, v) => n + v!, 0);
    const known = mg !== null && ml !== null && ml > 0;
    out.push({ id, patientId, orderId: first.id, drugCode: drug.code, name: drug.name, amountMg: known ? mg : NaN, volumeMl: known ? ml : NaN, doseUnit: known && weightKg ? "γ" : "mL/h", weightKg: weightKg ?? NaN, start: startOf(first), by: first.author, changes, fromOrder: first.id, ...(end ? { end, endFromOrder: true } : {}) });
  }
  return out;
}

/** 持続の透析のオーダから CRRT の条件（中止・置き換えでその時刻に終わる）。 */
export function crrtRowsOf(patientId: string, entries: OrderEntry[]): CrrtSetting[] {
  return entries.filter(isCrrtOrder).flatMap((e) => {
    const h = e.order.hd!, at = startOf(e), end = endOf(e);
    if (end && t(end) <= t(at)) return [];
    return [{ id: `order:${e.id}`, patientId, at, by: e.author, mode: h.method as CrrtSetting["mode"], qb: h.qb, qd: h.qd ?? 0, qf: h.qf ?? 0, removalMlPerH: h.removalMlPerH ?? 0, anticoag: { drug: h.anticoag.drug, ratePerH: h.anticoag.hourly ?? 0, unit: h.anticoag.drug === "ヘパリン" ? "単位/h" : "mg/h" }, access: h.access, fromOrder: e.id, ...(end ? { end } : {}) }];
  });
}

/** ICU 記録に、確定したオーダを読み替えた行を足したもの（読む画面・計算はこれを見る）。 */
export function withIcuOrders(records: IcuRecords, orders: Record<string, IcuOrders>): IcuRecords {
  const vents = Object.entries(orders).flatMap(([pid, o]) => ventRowsOf(pid, o.entries));
  const drips = Object.entries(orders).flatMap(([pid, o]) => infusionsOf(pid, o.entries, records.infusions, o.weightKg));
  const crrt = Object.entries(orders).flatMap(([pid, o]) => crrtRowsOf(pid, o.entries));
  if (!vents.length && !drips.length && !crrt.length) return records;
  const merged = new Map(drips.map((i) => [i.id, i]));
  // An older CRRT record still running when the patient's first CRRT order starts ends there (not counted twice).
  const firstOrder = new Map<string, number>();
  for (const c of crrt) firstOrder.set(c.patientId, Math.min(firstOrder.get(c.patientId) ?? Infinity, t(c.at)));
  const legacy = records.crrt.map((c) => {
    const from = firstOrder.get(c.patientId);
    if (from === undefined || t(c.at) > from || (c.end && t(c.end) <= from)) return c;
    const day = Math.floor(from / 1440), m = from - day * 1440;
    return { ...c, end: { day, time: `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}` }, endFromOrder: true };
  });
  return {
    ...records,
    vents: vents.length ? [...records.vents, ...vents] : records.vents,
    infusions: drips.length ? [...records.infusions.map((i) => merged.get(i.id) ?? i), ...drips.filter((i) => i.fromOrder)] : records.infusions,
    crrt: crrt.length ? [...legacy, ...crrt] : records.crrt,
  };
}

/** 保存する ICU 記録：読み替えた行・速さ・終了を外す。 */
export function savedIcuRecords(records: IcuRecords): IcuRecords {
  return {
    ...records,
    vents: records.vents.filter((v) => !v.fromOrder),
    crrt: records.crrt.filter((c) => !c.fromOrder).map((c) => {
      if (!c.endFromOrder) return c;
      const rest = { ...c };
      delete rest.end;
      delete rest.endFromOrder;
      return rest;
    }),
    infusions: records.infusions.filter((i) => !i.fromOrder).map((i) => {
      if (!i.endFromOrder && !i.changes.some((c) => c.fromOrder)) return i;
      const { end, endFromOrder, ...rest } = i;
      return { ...rest, changes: i.changes.filter((c) => !c.fromOrder), ...(endFromOrder || !end ? {} : { end }) };
    }),
  };
}
