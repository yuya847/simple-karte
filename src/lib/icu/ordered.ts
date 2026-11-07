// 確定したオーダを ICU 記録として読む（読み替え）。人工呼吸の設定のオーダ（PROC-VENT）は呼吸器の設定の行になり、
// いまの設定（current-oxygen・一覧・SOFA・P/F・申し送り）はその最新から出る。保存しているのは ICU 記録の元の行
// だけで、読み替えた行（fromOrder）は保存しない（savedIcuRecords）。オーダのない患者は元の行をそのまま読む。
import { abs } from "../flowsheet";
import { currentEntries, type SessionChanges } from "../record";
import type { HistoryEntry, OrderEntry, Patient, ProcedureOrder } from "../types";
import type { At, IcuRecords, VentSetting } from "./types";

type Proc = OrderEntry & { order: ProcedureOrder };
const isVent = (e: HistoryEntry): e is Proc => e.kind === "order" && e.order.type === "procedure" && e.order.code === "PROC-VENT" && !!e.order.vent;
/** The orders read into ICU 記録. */
export const isIcuOrder = (e: HistoryEntry): e is Proc => isVent(e);

/** The ICU orders of each patient as they stand now (stops and replacements applied), only for patients that have one. */
export function icuOrderEntries(patients: Pick<Patient, "id" | "history">[], charts: Record<string, SessionChanges | undefined>): Record<string, OrderEntry[]> {
  const out: Record<string, OrderEntry[]> = {};
  for (const p of patients) {
    const changes = charts[p.id];
    if (!p.history.some(isIcuOrder) && !changes?.added.some(isIcuOrder)) continue;
    out[p.id] = currentEntries(p as Patient, changes).filter(isIcuOrder);
  }
  return out;
}

const startOf = (e: Proc): At => ({ day: e.order.start.day, time: e.order.start.time ?? e.time });
/** When a stopped order ended (without a clock time it ran to the end of that day). */
const endOf = (e: OrderEntry): At | undefined => (e.status === "中止" || e.status === "終了") && e.stoppedOn !== undefined ? (e.stoppedTime ? { day: e.stoppedOn, time: e.stoppedTime } : { day: e.stoppedOn + 1, time: "00:00" }) : undefined;

/** 人工呼吸の設定のオーダから、呼吸器の設定の行（その注文の id を fromOrder に）。 */
export function ventRowsOf(patientId: string, entries: OrderEntry[]): VentSetting[] {
  return entries.filter(isVent).flatMap((e) => {
    const at = startOf(e), end = endOf(e);
    if (end && abs(end.day, end.time) <= abs(at.day, at.time)) return [];
    return [{ ...e.order.vent!, id: `order:${e.id}`, patientId, at, by: e.author, fromOrder: e.id, ...(end ? { end } : {}) }];
  });
}

/** ICU 記録に、確定したオーダを読み替えた行を足したもの（読む画面・計算はこれを見る）。 */
export function withIcuOrders(records: IcuRecords, orders: Record<string, OrderEntry[]>): IcuRecords {
  const vents = Object.entries(orders).flatMap(([pid, entries]) => ventRowsOf(pid, entries));
  return vents.length ? { ...records, vents: [...records.vents, ...vents] } : records;
}

/** 保存する ICU 記録：読み替えた行を外す。 */
export function savedIcuRecords(records: IcuRecords): IcuRecords {
  return { ...records, vents: records.vents.filter((v) => !v.fromOrder) };
}
