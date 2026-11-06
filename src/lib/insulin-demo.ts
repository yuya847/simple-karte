import type { Patient, InjectionOrder } from "./types";
import type { AdminRecord } from "./mar";
import { insulinDoses, INSULIN_CLOCKS } from "./insulin-doses";
import { abs } from "./flowsheet";

/** Fictional display data, not a dosing protocol. */
export function addInsulinDemo(patient: Patient): void {
  if (!/糖尿|DKA|ケトアシドーシス|ステロイド/.test(JSON.stringify([patient.admissionDiagnosis, patient.history]))) return;
  const first = Math.max(patient.admittedOn, -6);
  const order: InjectionOrder = { type: "injection", items: [{ drugCode: "DEMO-INS-LISPRO", amount: 0, unit: "単位" }], route: "皮下注", schedule: { kind: "per_day", count: 4 }, start: { day: first, time: "07:30" }, insulinDoses: insulinDoses([2, 2, 2, 0]), doseTimes: INSULIN_CLOCKS, sliding: { times: INSULIN_CLOCKS, rows: [{ from: 0, to: 199, units: 0 }, { from: 200, to: null, units: 4 }] } };
  patient.history.push({ kind: "order", id: `insulin-demo-${patient.id}`, day: first, time: "07:00", author: patient.attending, status: "有効", order });
  for (let day = first; day <= 0; day++) {
    if (!patient.daily.some(d => d.day === day)) patient.daily.push({ day, meals: [8, 6, 9], sideMeals: [7, 5, 8] });
  }
}
export function demoInsulinRecords(patients: Patient[]): Record<string, AdminRecord> {
  const records: Record<string, AdminRecord> = {};
  for (const patient of patients) for (const e of patient.history) {
    if (e.kind !== "order" || e.id !== `insulin-demo-${patient.id}` || e.order.type !== "injection") continue;
    for (let day = e.order.start.day; day < 0; day++) INSULIN_CLOCKS.forEach((time, i) => {
      const at = abs(day, time), key = `${e.id}|${at}`;
      const glucose = [228, 176, 207, 148][i] + (day + 3) * 6;
      records[key] = { key, orderId: e.id, patientId: patient.id, at, status: "実施", doneAt: time, by: "模擬の看護師", checked: { patient: true, label: true }, insulin: { glucose, units: (i < 3 ? 2 : 0) + (glucose >= 200 ? 4 : 0) } };
    });
  }
  return records;
}
