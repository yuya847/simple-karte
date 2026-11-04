import type { HistoryEntry, OrderEntry } from "./types";

/** Call within one place/day section. Orders have only 第1版 in the current data model. */
export function groupRx(entries: HistoryEntry[]): HistoryEntry[][] {
  const groups: HistoryEntry[][] = [];
  for (const entry of entries) {
    const previous = groups.at(-1)?.[0];
    if (previous && sameRx(previous, entry)) groups.at(-1)!.push(entry);
    else groups.push([entry]);
  }
  return groups;
}

function sameRx(a: HistoryEntry, b: HistoryEntry): boolean {
  return a.kind === "order" && b.kind === "order"
    && (a.order.type === "prescription" || a.order.type === "injection")
    && a.order.type === b.order.type
    && a.day === b.day && a.time === b.time && a.author === b.author;
}

/** Include the first dose's timing, so different starts remain visible on their own rows. */
export function rxStartKey(entry: OrderEntry): string {
  const o = entry.order;
  return o.type === "prescription" || o.type === "injection" ? JSON.stringify(o.start) : entry.id;
}
