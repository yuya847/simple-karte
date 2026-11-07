import { abs } from "../flowsheet";
import type { IoLine } from "../io-balance";
import type { DailyRecord } from "../types";
import { infusionVolume } from "./balance";
import type { HourlyRecord, IcuRecords } from "./types";

/** ICU の実測量と速さを、lo < t ≤ hi の共通の行にする。 */
export function icuIoLines(records: IcuRecords, patientId: string, lo: number, hi: number): IoLine[] {
  if (hi <= lo) return [];
  const lines: IoLine[] = [];
  const fields: [keyof HourlyRecord, IoLine["side"], IoLine["kind"], string][] = [
    ["urineMl", "OUT", "尿", "尿量"], ["drainMl", "OUT", "ドレーン", "ドレーン"],
    ["gastricMl", "OUT", "その他", "胃管"], ["stoolMl", "OUT", "便", "便"],
    ["bloodLossMl", "OUT", "出血", "出血"], ["enteralMl", "IN", "経管", "経腸栄養"],
    ["otherInMl", "IN", "その他", "その他 IN"],
  ];
  for (const r of records.hourly) {
    const at = abs(r.at.day, r.at.time);
    if (r.patientId !== patientId || at <= lo || at > hi) continue;
    for (const [field, side, kind, what] of fields) {
      const ml = r[field];
      if (typeof ml === "number") lines.push({ side, kind, what, ml, at, by: r.by, from: "ICU 記録", measured: true });
    }
  }
  for (const inf of records.infusions.filter(i => i.patientId === patientId)) {
    const ml = infusionVolume(inf, lo, hi);
    if (ml > 0) lines.push({ side: "IN", kind: "点滴", what: `${inf.name}（持続）`, ml, at: hi, by: inf.by, from: "ICU 記録", formula: "速さ×時間（mL/h × 分 ÷ 60、変更で分割）", orderId: (inf as { orderId?: string }).orderId });
  }
  for (const c of records.crrt.filter(c => c.patientId === patientId)) {
    const minutes = Math.max(0, Math.min(hi, c.end ? abs(c.end.day, c.end.time) : hi) - Math.max(lo, abs(c.at.day, c.at.time)));
    const ml = minutes * c.removalMlPerH / 60;
    if (ml > 0) lines.push({ side: "OUT", kind: "その他", what: "CRRT 除水", ml, at: hi, by: c.by, from: "ICU 記録", formula: "除水 mL/h × 分 ÷ 60" });
  }
  return lines.sort((a, b) => a.at - b.at);
}

/** 時間尿量がある日のみ、元の日量をその日の時間記録の合計で置き換える。 */
export function withIcuUrine(daily: DailyRecord[], records: IcuRecords, patientId: string): DailyRecord[] {
  const sums = new Map<number, number>();
  for (const r of records.hourly) {
    if (r.patientId === patientId && r.urineMl !== undefined) sums.set(r.at.day, (sums.get(r.at.day) ?? 0) + r.urineMl);
  }
  const days = new Map(daily.map(d => [d.day, { ...d }]));
  for (const [day, urineMl] of sums) days.set(day, { ...(days.get(day) ?? { day }), urineMl });
  return [...days.values()].sort((a, b) => a.day - b.day);
}
