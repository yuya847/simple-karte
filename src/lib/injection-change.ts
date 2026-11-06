import type { InjectionDraft, StopDraft } from "./drafts";
import { orderEndDay } from "./drafts";
import type { OrderEntry } from "./types";

export interface InjectionChange { time: string; rate: number }
export const validChangeTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

/** Copy values into a new version; the original order is never mutated. */
export function injectionRateDraft(entry: OrderEntry, change: InjectionChange, id: string): InjectionDraft {
  if (entry.order.type !== "injection" || !validChangeTime(change.time) || !Number.isFinite(change.rate) || change.rate <= 0) throw new Error("速度・時刻を確認してください");
  const o = entry.order;
  const end = orderEndDay(o);
  return {
    id, origin: "manual", sourceText: "（カレンダーから速度変更）", comment: o.comment ?? null, kind: "injection",
    items: o.items.map(i => ({ ...i, said: i.drugCode })), route: o.route, schedule: { ...o.schedule },
    infusionMinutes: null, infusionScope: "per_dose", rateMlPerH: change.rate, prefer: "rate",
    start: { day: 0, time: change.time }, days: end === null ? null : Math.max(1, end + 1),
    ...(o.end ? { end: { ...o.end } } : {}), dayPattern: o.dayPattern, doseTimes: o.doseTimes,
    duplicate: { action: "replace", orderId: entry.id },
  };
}

export function stopTimesOf(drafts: { kind: string }[], fallback: string): Record<string, string> {
  return Object.fromEntries(drafts.flatMap(d => {
    const stop = d as StopDraft;
    return stop.kind === "stop" && stop.targetOrderId ? [[stop.targetOrderId, stop.stopTime ?? fallback]] : [];
  }));
}
