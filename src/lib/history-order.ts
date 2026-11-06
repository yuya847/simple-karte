import type { OrderEntry } from "./types";
import { oralName, drugName, timingText, scheduleTextFor } from "./format";

export function orderLocked(id: string, audited: Record<string, string>, dispensed: Record<string, string>, released: readonly string[]): boolean {
  return !released.includes(id) && (!!audited[id] || Object.keys(dispensed).some(key => key.startsWith(`${id}|`)));
}
export function prescriptionText(entries: OrderEntry[]): string {
  const rows = entries.flatMap(({ order: o }) => {
    if (o.type === "prescription") return [[oralName(o.drugCode), `1回${o.amount}${o.unit}`, timingText(o), o.days ? `${o.days}日分` : ""]];
    if (o.type === "injection") return o.items.map(it => [drugName(it.drugCode), `${it.amount}${it.unit}`, o.route, scheduleTextFor(o), o.days ? `${o.days}日分` : ""]);
    return [];
  });
  const width = (text: string) => Array.from(text).reduce((n, char) => n + (char.charCodeAt(0) > 255 ? 2 : 1), 0);
  const widths = rows.reduce<number[]>((all, row) => row.map((cell, i) => Math.max(all[i] ?? 0, width(cell))), []);
  return rows.map(row => row.map((cell, i) => i === row.length - 1 ? cell : cell + " ".repeat(widths[i] - width(cell))).join("　").trimEnd()).join("\n");
}

export function revisionEntries(entry: OrderEntry, entries: OrderEntry[]): OrderEntry[] {
  const o = entry.order;
  if (o.type !== "prescription" || !o.rp) return [entry];
  return entries.filter(e => e.status !== "中止" && e.day === entry.day && e.time === entry.time && e.author === entry.author && e.order.type === "prescription" && e.order.rp === o.rp);
}

type HistoryHandlers = {
  entries: OrderEntry[];
  locked: (id: string) => boolean;
  canEdit: boolean;
  modifyInjection: (entry: OrderEntry) => void;
  stopDraft: (entry: OrderEntry, source: string) => void;
  load: (entry: OrderEntry) => void;
};
export function historyOrderHandlers(options: HistoryHandlers) {
  const allowed = (entry: OrderEntry) => {
    const related = revisionEntries(entry, options.entries);
    return options.canEdit && related.every(e => e.status !== "中止" && !options.locked(e.id)) ? related : [];
  };
  return {
    modify(entry: OrderEntry) {
      const related = allowed(entry);
      if (!related.length) return;
      if (entry.order.type === "injection") options.modifyInjection(entry);
      else {
        related.forEach(e => options.stopDraft(e, "（経過から修正）"));
        options.load(entry);
      }
    },
    stop(entry: OrderEntry) { allowed(entry).forEach(e => options.stopDraft(e, "（経過から中止）")); },
  };
}

export type UnlockRequest = { orderId: string; patientId: string; patientName: string; reason: string };
export type UnlockState = { requests: UnlockRequest[]; released: string[] };
export type UnlockAction = { type: "restore"; state: UnlockState } | { type: "request"; request: UnlockRequest } | { type: "release" | "relock"; id: string };
export function unlockReducer(state: UnlockState, action: UnlockAction): UnlockState {
  if (action.type === "restore") return action.state;
  if (action.type === "request") return { ...state, requests: [...state.requests.filter(r => r.orderId !== action.request.orderId), action.request] };
  if (action.type === "release") return { requests: state.requests.filter(r => r.orderId !== action.id), released: [...state.released.filter(id => id !== action.id), action.id] };
  return { ...state, released: state.released.filter(id => id !== action.id) };
}
