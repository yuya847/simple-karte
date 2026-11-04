import { buildWorksheet } from "./worksheet";
import { abs } from "./flowsheet";
import { marKey, type AdminRecord } from "./mar";
import type { OrderEntry, Patient } from "./types";
/** 確定と同時に、その回だけを既存の実施記録へ残す。 */
export function recordsForCompletedOrders(entries: OrderEntry[], patient: Patient, nowTime: string, by: string): AdminRecord[] {
  const now = abs(0, nowTime);
  return entries.map((entry) => {
    const { timed } = buildWorksheet([{ patient, room: patient.room, entries: [entry] }], -1440, 1440 * 32, now);
    const at = timed.filter((x) => x.at !== null).sort((a, b) => Math.abs(a.at! - now) - Math.abs(b.at! - now))[0]?.at ?? now;
    return { key: marKey(entry.id, at), orderId: entry.id, patientId: patient.id, at, status: "実施", doneAt: nowTime, by, checked: { patient: false, label: null }, note: "オーダ確定時に実施済みとして記録（照合なし）" };
  });
}
