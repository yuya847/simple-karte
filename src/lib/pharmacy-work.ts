import type { OrderEntry } from "./types";

/** Today's extra dispensing: new/changed orders today and one-off doses. */
export function isExtraInjection(e: OrderEntry, day: number): boolean {
  return e.order.type === "injection" && (e.day === day || e.order.schedule.kind === "once");
}
