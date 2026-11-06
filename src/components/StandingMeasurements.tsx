import { standingMeasurementPlan } from "@/lib/standing-measurements";
import type { StandingLine } from "@/lib/standing-lines";
import type { StandingOrders } from "@/lib/standing";

export interface StandingMeasurementSource { lines: StandingLine[]; fields?: StandingOrders }
export function StandingMeasurements({ source, day, label, from = '00:00', to = '23:59' }: { source?: StandingMeasurementSource; day: number; label?: string; from?: string; to?: string }) {
  if (!source) return null;
  const times = standingMeasurementPlan(source.lines, source.fields, day).filter(t => t >= from && t <= to);
  if (!times.length) return null;
  return <div className="my-1 text-xs text-ink-soft">{label && `${label}　`}バイタル測定予定：{times.join('・')}<span className="hint">時刻は架空の病院の取り決めです。1日1回は10時、1日3回は6・14・22時、2時間・4時間ごとは0時から数えます。実施済みの印ではありません。</span></div>;
}
