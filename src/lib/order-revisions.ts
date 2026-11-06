import { WARD_RULES } from "./master";
import type { OrderEntry } from "./types";

/** A replacement has exactly one predecessor and becomes effective at its start. */
export function replacementBoundaries(entries: OrderEntry[]) {
  const result = new Map<string, { day: number; time: string }>();
  for (const e of entries) {
    if (!("replaces" in e.order) || !e.order.replaces || !("start" in e.order)) continue;
    if (result.has(e.order.replaces)) throw new Error("同じ指示への変更が重なっています");
    const predecessor = e.order.replaces;
    if (predecessor === e.id || !entries.some(old => old.id === predecessor)) throw new Error("変更元の指示を確認してください");
    result.set(e.order.replaces, { day: e.order.start.day, time: "time" in e.order.start ? e.order.start.time ?? e.time : e.order.type === "prescription" ? WARD_RULES.medTimes[e.order.start.timing ?? e.order.timings[0]] ?? e.time : e.time });
  }
  return result;
}
