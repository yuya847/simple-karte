import { abs } from "./flowsheet";
import type { AdminRecord } from "./mar";
import type { OrderEntry } from "./types";
/** Both execution entry points use the order's single scheduled occurrence. */
export function moveAdministration(entry: OrderEntry, patientId: string, time: string, by: string, recorded?: AdminRecord): AdminRecord {
  if (entry.order.type !== "procedure" || entry.order.code !== "PROC-MOVE" || !entry.order.move) throw new Error("移動オーダがありません");
  const at = abs(entry.order.start.day, entry.order.start.time ?? entry.time);
  return { ...recorded, key: `${entry.id}|${at}`, orderId: entry.id, patientId, at, status: "実施", doneAt: recorded?.doneAt ?? time, by: recorded?.by ?? by, checked: recorded?.checked ?? { patient: false, label: null } };
}
