import type { Patient } from "../types";
import type { PlannedMove } from "../bed-control";
import { floorOf } from "../ward";
import type { BoardOrders } from "./board";

/** One outgoing and one incoming bed for each unperformed ward transfer. */
export function moveBedPlans(patients: Patient[], orders: BoardOrders): PlannedMove[] {
  return patients.flatMap(p => (orders[p.id] ?? []).flatMap(e => {
    const o=e.order;
    if (p.dischargedAt || e.status !== "有効" || o.type !== "procedure" || o.code !== "PROC-MOVE" || !o.move?.to || o.start.day < 0 || o.start.day > 1) return [];
    const from=floorOf(p.room), to=floorOf(o.move.to.room);
    return from === to ? [] : [{floor:from,day:o.start.day,kind:"退院" as const,transfer:true},{floor:to,day:o.start.day,kind:"入院" as const,transfer:true}];
  }));
}
