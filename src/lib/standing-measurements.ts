import { standingFromBlocks } from "./standing-blocks";
import type { StandingLine } from "./standing-lines";
import type { StandingOrders } from "./standing";

/** Clock times are the fictional ward's arrangement, not a medical frequency recommendation. */
export function vitalMeasurementTimes(frequency?: string | null): string[] {
  if (frequency === '1日1回') return ['10:00'];
  if (frequency === '1日3回') return ['06:00', '14:00', '22:00'];
  const hours = frequency === '4時間ごと' ? 4 : frequency === '2時間ごと' ? 2 : 0;
  return hours ? Array.from({length: 24 / hours}, (_,i) => `${String(i*hours).padStart(2,'0')}:00`) : [];
}

export function standingMeasurementPlan(lines: StandingLine[], fields: StandingOrders | undefined, day: number): string[] {
  const possible = ['00:00','02:00','04:00','06:00','08:00','10:00','12:00','14:00','16:00','18:00','20:00','22:00'];
  return possible.filter(time => vitalMeasurementTimes(standingFromBlocks(lines, fields, day, time)?.vitals).includes(time));
}
