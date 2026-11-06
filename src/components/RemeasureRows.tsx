"use client";

import { abs } from "@/lib/flowsheet";
import { pendingRemeasure, type RecordedVital } from "@/lib/take-desk-remeasure";
import { shiftWindow, timeLabel, type Shift, type WorkPatient } from "@/lib/worksheet";
import type { CalendarDate } from "@/lib/dates";

export interface RemeasureProps {
  remeasureVitals?: Record<string, RecordedVital[]>;
  onMeasure?: (patientId: string) => void;
}

export function RemeasureRows({ people, remeasureVitals = {}, onMeasure, day, shift, today, interactive }: RemeasureProps & {
  people: WorkPatient[]; day: number; shift: Shift; today: CalendarDate; interactive: boolean;
}) {
  const { lo, hi } = shiftWindow(shift, day);
  const items = people.flatMap(({ patient, room }) => {
    const item = pendingRemeasure(remeasureVitals[patient.id] ?? []);
    const at = item ? abs(0, item.time) : 0;
    return item && at >= lo && at < hi ? [{ ...item, at, patient, room }] : [];
  }).sort((a, b) => a.at - b.at);
  return <>
    {items.length > 0 && <table className="w-full border-collapse" aria-label="バイタル再測定の予定"><tbody>{items.map(({ patient, room, at, label }) => (
      <tr key={patient.id} data-patient={patient.id} data-notice-destination="sheet" className="border-b border-rule">
        <td className="px-2 py-2 font-bold">{timeLabel(at, day, today)}</td>
        <td className="px-2 py-2">{room}　{patient.name}</td>
        <td className="px-2 py-2">{label}</td>
        <td className="px-2 py-2">{interactive && onMeasure && <button type="button" onClick={() => onMeasure(patient.id)} className="text-ai underline">測った</button>}</td>
      </tr>
    ))}</tbody></table>}

  </>;
}

/* Help migration source (references and dynamic wording):
<p >{REMEASURE_HINT} <a href={REMEASURE_SOURCE} target="_blank" rel="noreferrer" >RCP NEWS2（Chart 4）</a></p>
*/
