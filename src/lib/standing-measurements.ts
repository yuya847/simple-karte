import { lineEffective } from "./standing-calendar";
import { standingFromBlocks } from "./standing-blocks";
import type { StandingLine } from "./standing-lines";
import type { StandingOrders } from "./standing";

/** Clock times are the fictional ward's arrangement, not a medical frequency recommendation. */
export function vitalMeasurementTimes(frequency?: string | null): string[] {
  if (frequency === '1日1回') return ['10:00'];
  if (frequency === '1日3回') return ['06:00', '14:00', '22:00'];
  const hours = frequency === '1時間ごと' ? 1 : frequency === '4時間ごと' ? 4 : frequency === '2時間ごと' ? 2 : 0;
  return hours ? Array.from({length: 24 / hours}, (_,i) => `${String(i*hours).padStart(2,'0')}:00`) : [];
}

export function standingMeasurementPlan(lines: StandingLine[], fields: StandingOrders | undefined, day: number): string[] {
  const possible = Array.from({length:24}, (_, i) => `${String(i).padStart(2, '0')}:00`);
  return possible.filter(time => {
    const explicit = lines.filter(l => l.cat === "バイタル" && lineEffective(l, day, time)).sort((a,b)=>a.start.day-b.start.day || (a.start.time??"00:00").localeCompare(b.start.time??"00:00")).at(-1);
    const frequency = explicit?.text.match(/(?:[124]時間ごと|1日[13]回)/)?.[0] ?? standingFromBlocks(lines, fields, day, time)?.vitals;
    return vitalMeasurementTimes(frequency).includes(time);
  });
}
