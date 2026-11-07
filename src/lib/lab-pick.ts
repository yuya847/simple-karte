// 検査結果の表を押して選ぶ: one press adds or takes away an item (row) or a draw (column); Shift adds
// everything between the last one pressed and this one. And the line shown under the pointer on a value.

import { addDays, type CalendarDate } from "./dates";
import { abs } from "./flowsheet";
import { labNumber } from "./lab-number";
import type { LabResult } from "./types";

export function pickWithShift(list: string[], order: string[], key: string, anchor: string | null, shift: boolean): string[] {
  if (shift && anchor !== null && order.includes(anchor) && order.includes(key)) {
    const [a, b] = [order.indexOf(anchor), order.indexOf(key)].sort((x, y) => x - y);
    return [...new Set([...list, ...order.slice(a, b + 1)])];
  }
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

/** 「前回 12.20（11/3）→ 0.50 mg/dL、基準 0.14以下」: the value before this draw (from all the draws), this value, the range. */
export function valueTip(labs: LabResult[], lab: LabResult, code: string, unit: string, range: string, today: CalendarDate): string {
  const at = abs(lab.day, lab.time);
  const prev = labs
    .filter((l) => l.values[code] !== undefined && abs(l.day, l.time) < at)
    .sort((x, y) => abs(y.day, y.time) - abs(x.day, x.time))[0];
  const now = `${labNumber(code, lab.values[code])}${unit ? ` ${unit}` : ""}`;
  const d = prev ? addDays(today, prev.day) : null;
  return `${prev && d ? `前回 ${labNumber(code, prev.values[code])}（${d.m}/${d.d}）→ ` : ""}${now}、基準 ${range}`;
}
