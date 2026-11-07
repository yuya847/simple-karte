import { abs } from "../flowsheet";
import { doseText } from "./gamma";
import { lineDays } from "./lines";
import type { IcuRecords } from "./types";

/** Copy recorded pump changes and line dates; no clinical conclusion is inferred. */
export function icuDischargeCourse(records: IcuRecords, patientId: string, now: number): string {
  const stamp = (at: { day: number; time: string }) => `${at.day === 0 ? "今日" : `${-at.day}日前`} ${at.time}`;
  return [
    ...records.infusions.filter(i => i.patientId === patientId).flatMap(i => i.changes.filter(c => abs(c.at.day, c.at.time) <= now).map(c => `${stamp(c.at)} ${i.name} ${c.rateMlPerH.toFixed(1)}mL/時・${doseText(i, abs(c.at.day,c.at.time)).split("（")[0]}`)),
    ...records.lines.filter(l => l.patientId === patientId && abs(l.insertedAt.day,l.insertedAt.time) <= now).map(l => `${l.kind} ${l.site}：挿入 ${stamp(l.insertedAt)}・${lineDays(l, Math.floor(Math.min(now, l.removedAt ? abs(l.removedAt.day,l.removedAt.time) : now)/1440))}${l.removedAt && abs(l.removedAt.day,l.removedAt.time) <= now ? `・抜去 ${stamp(l.removedAt)}` : ""}`),
  ].join("\n");
}
