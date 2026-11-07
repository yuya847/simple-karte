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
