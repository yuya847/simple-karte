import { abs } from "../flowsheet";
import { unitOf, type At, type IcuRecords, type UnitKind } from "./types";

export function stayOnArrive(records: IcuRecords, patientId: string, unit: UnitKind, at: At, from: string, reason: string): IcuRecords {
  if (records.stays.some(s => s.patientId === patientId && !s.out)) return records;
  return { ...records, stays: [...records.stays, { id: `stay-${patientId}-${unit}-${abs(at.day, at.time)}`, patientId, unit, in: { ...at }, from, reason }] };
}
export function stayOnMove(records: IcuRecords, patientId: string, fromWard: string, toWard: string, at: At): IcuRecords {
  if (fromWard === toWard) return records;
  const from = unitOf(fromWard), to = unitOf(toWard);
  const next = { ...records, stays: records.stays.map(s => s.patientId === patientId && s.unit === from && !s.out ? { ...s, out: { ...at }, to: toWard } : s) };
  return to ? stayOnArrive(next, patientId, to, at, fromWard, "転棟") : next;
}

export function stayDayText(records: IcuRecords, patientId: string, now: number): string | null {
  const stays = records.stays.filter(s => s.patientId === patientId && abs(s.in.day,s.in.time) <= now).sort((a,b)=>abs(a.in.day,a.in.time)-abs(b.in.day,b.in.time));
  const current = stays.filter(s => !s.out || abs(s.out.day,s.out.time)>now).at(-1);
  if (!current) return null;
  const day = Math.floor(now/1440);
  return `${current.unit} ${day-current.in.day+1}日目${stays[0].id!==current.id ? `（${stays[0].unit} から ${day-stays[0].in.day+1}日目）` : ""}`;
}

/** ICU・HCU のベッドにいる、または今日（day 0）まで入室していた患者：ICU 記録の道具と経過表の ICU の行を出す。 */
export function icuRecordShown(p: { id: string; ward: string }, records: Pick<IcuRecords, "stays">, today = 0): boolean {
  return !!unitOf(p.ward) || records.stays.some(s => s.patientId === p.id && (!s.out || s.out.day >= today));
}
