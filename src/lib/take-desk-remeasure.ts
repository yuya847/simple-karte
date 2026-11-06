import { abs } from "./flowsheet";
import { news2, news2Risk } from "./news2";
import type { VitalSign } from "./types";

export type RecordedVital = VitalSign & { recordedTime?: string; remeasured?: boolean };

export const REMEASURE_SOURCE = "https://www.rcp.ac.uk/media/a4ibkkbf/news2-final-report_0_0.pdf";
export const REMEASURE_HINT = "NEWS2 5〜6点は1時間後、7点以上は30分後に再測定の予定を出します。RCPの頻度の目安は5〜6点で少なくとも1時間ごと、7点以上で連続モニタリングです。30分後の予定は連続モニタリングの代わりではありません。「測った」で予定を済にできます。バイタルを確定した場合も前の予定は自動で済になり、高値なら次の予定を出します。";

/** nowTime is the confirmation time; time can exceed 24:00 across midnight. */
export function remeasureItem(vital: VitalSign, score: number, nowTime: string): { time: string; label: string } | null {
  const risk = news2Risk(score);
  if (risk !== "高" && risk !== "中") return null;
  const due = Math.max(abs(vital.day, vital.time), abs(0, nowTime)) + (risk === "高" ? 30 : 60);
  return { time: `${String(Math.floor(due / 60)).padStart(2, "0")}:${String(due % 60).padStart(2, "0")}`, label: `再測定 NEWS2 ${score}点のため` };
}

/** The last confirmation retires the previous reminder, even for equal measurement times. */
export function pendingRemeasure(vitals: RecordedVital[]) {
  const vital = vitals.at(-1);
  if (!vital || vital.remeasured) return null;
  // Confirmation time is saved with the measurement, so ticking the clock never postpones a task.
  return remeasureItem(vital, news2(vital).total, vital.recordedTime ?? vital.time);
}

export function markRemeasured(vitals: RecordedVital[]): RecordedVital[] {
  return vitals.map((v, i) => i === vitals.length - 1 ? { ...v, remeasured: true } : v);
}
