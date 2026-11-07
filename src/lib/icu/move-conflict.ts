import { abs } from "../flowsheet";
import type { BedAssignment } from "../ward";
import type { Patient, ProcedureOrder } from "../types";
import type { BoardOrders } from "./board";

/** Project recorded departures and moves in time order up to this reservation. */
export function moveConflict(patientId: string, move: ProcedureOrder, beds: BedAssignment[], patients: Patient[], orders: BoardOrders): string | undefined {
  const target = move.move?.to;
  if (!target) return undefined;
  const when = abs(move.start.day, move.start.time ?? "00:00");
  const projected = beds.map(b => ({ ...b }));
  const events = Object.entries(orders).flatMap(([pid, es]) => es.flatMap(e => {
    const o = e.order;
    if (pid === patientId || e.status !== "有効" || o.type !== "procedure") return [];
    const at = o.leave?.kind === "退院" ? abs(o.leave.from.day,o.leave.from.time) : o.move?.to ? abs(o.start.day,o.start.time ?? "00:00") : Infinity;
    return at <= when ? [{ pid, o, at }] : [];
  })).sort((a,b) => a.at-b.at);
  for (const { pid, o } of events) {
    const source = projected.findIndex(b => b.patientId === pid);
    if (o.move?.to && projected.some(b => b.room === o.move!.to!.room && b.bed === o.move!.to!.bed && (b.patientId || b.other))) continue;
    if (source >= 0) projected.splice(source,1);
    if (o.move?.to) projected.push({ ...o.move.to, patientId: pid });
  }
  const b = projected.find(b => b.room === target.room && b.bed === target.bed && b.patientId !== patientId && (b.patientId || b.other));
  const who = b?.patientId ? patients.find(p => p.id === b.patientId)?.name : b?.other?.name;
  return b ? `${target.room}${target.bed} は${who ?? "別の患者"}さんが在床` : undefined;
}
