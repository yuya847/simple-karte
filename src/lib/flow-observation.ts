import type { CareOrder, CareSchedule } from "./care-orders";
export const OBSERVATION_PRESETS = [
  { item: "NIHSS", inputKind: "number", unit: "点" },
  { item: "疼痛 NRS", inputKind: "choice", choices: Array.from({ length: 11 }, (_, i) => String(i)) },
  { item: "浮腫", inputKind: "choice", choices: ["なし", "あり"] },
  { item: "褥瘡", inputKind: "text" }, { item: "創部", inputKind: "text" }, { item: "ドレーン", inputKind: "text" },
  { item: "CAM-ICU", inputKind: "text" }, { item: "DST", inputKind: "text" },
  { item: "RASS", inputKind: "choice", choices: Array.from({ length: 10 }, (_, i) => String(i - 5)) },
  { item: "瞳孔", inputKind: "text" }, { item: "体重測定", inputKind: "number", unit: "kg" },
  { item: "腹囲", inputKind: "number", unit: "cm" }, { item: "酸素の流量", inputKind: "number", unit: "L/分" },
] satisfies { item: string; inputKind: NonNullable<CareOrder["inputKind"]>; choices?: string[]; unit?: string }[];
export function observationOrder(p: { item: string; inputKind: NonNullable<CareOrder["inputKind"]>; choices?: string[]; unit?: string; schedule: CareSchedule; patientId: string; by: string; time: string; day?: number; id: string }): CareOrder {
  return { id: p.id, patientId: p.patientId, item: p.item.trim(), kind: "観察", inputKind: p.inputKind, choices: p.inputKind === "check" ? ["あり", "なし"] : p.choices, unit: p.unit?.trim(), schedule: p.schedule, everyDays: 1, start: { day: p.day ?? 0, time: p.time }, note: "", by: p.by, at: { day: 0, time: p.time } };
}
export const glucoseMark = (value: number, limits = { low: 70, high: 300 }) => value < limits.low ? "L" : value > limits.high ? "H" : "";
