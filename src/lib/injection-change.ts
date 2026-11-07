import type { InjectionDraft, StopDraft } from "./drafts";
import { orderEndDay } from "./drafts";
import { doseTimes, orderInterval } from "./flowsheet";
import type { OrderEntry } from "./types";

export interface InjectionChange { time: string; rate: number }
export const validChangeTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

/** Copy values into a new version; the original order is never mutated. */
export function injectionRateDraft(entry: OrderEntry, change: InjectionChange, id: string): InjectionDraft {
  if (entry.order.type !== "injection" || !validChangeTime(change.time) || !Number.isFinite(change.rate) || (change.rate < 0 || (change.rate === 0 && !entry.order.continuous))) throw new Error("速度・時刻を確認してください");
  const o = entry.order;
  const end = orderEndDay(o);
  return {
    id, origin: "manual", sourceText: "（カレンダーから速度変更）", comment: o.comment ?? null, kind: "injection",
    continuous: o.continuous,
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

/** One occurrence is excluded; the remaining schedule keeps its original phase. */
export function toggleInjectionDose(entry: OrderEntry, at: number, now: number, drafts: InjectionDraft[], id: string): InjectionDraft | null {
  if (entry.order.type !== "injection" || entry.status !== "有効" || at < now) throw new Error("これからの回を選んでください");
  const o = entry.order;
  const previous = drafts.find(d => d.duplicate?.orderId === entry.id && d.sourceText === "（カレンダーから回を取り消し）");
  if (!doseTimes({ ...entry, order: { ...o, omittedDoses: [] } }, now, at, at + 1).includes(at)) throw new Error("予定された回を選んでください");
  const originalDay = o.start.day;
  const omitted = (previous ? previous.omittedDoses ?? [] : o.omittedDoses ?? []).map(x => ({ day: x.day + (previous?.start.day ?? originalDay), time: x.time }));
  const day = Math.floor(at / 1440), time = `${String(Math.floor((at % 1440) / 60)).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`;
  const exists = omitted.some(x => x.day === day && x.time === time);
  const next = exists ? omitted.filter(x => x.day !== day || x.time !== time) : [...omitted, { day, time }];
  const unchanged = JSON.stringify([...next].sort((a,b) => a.day - b.day || a.time.localeCompare(b.time))) === JSON.stringify((o.omittedDoses ?? []).map(x => ({ ...x, day: x.day + originalDay })).sort((a,b) => a.day - b.day || a.time.localeCompare(b.time)));
  if (unchanged) return null;
  const start = firstRemainingStart(entry, now);
  const end = orderEndDay(o);
  const until = o.schedule.kind === "every_hours" ? orderInterval(entry, now).to : null;
  const preciseEnd = until === null ? o.end : { day: Math.floor(until / 1440), time: `${String(Math.floor(until % 1440 / 60)).padStart(2, "0")}:${String(until % 60).padStart(2, "0")}` };
  return {
    id: previous?.id ?? id, origin: "manual", sourceText: "（カレンダーから回を取り消し）", comment: o.comment ?? null, kind: "injection",
    items: o.items.map(i => ({ ...i, said: i.drugCode })), route: o.route, schedule: { ...o.schedule },
    infusionMinutes: o.minutesPerDose ?? null, infusionScope: "per_dose", rateMlPerH: o.rateMlPerH ?? null,
    prefer: o.rateMlPerH ? "rate" : "time", start, days: until !== null ? Math.ceil((until - start.day * 1440) / 1440) : end === null ? null : end - start.day + 1,
    end: preciseEnd, dayPattern: o.dayPattern, doseTimes: o.doseTimes, insulinDoses: o.insulinDoses, sliding: o.sliding,
    omittedDoses: next.map(x => ({ ...x, day: x.day - start.day })), duplicate: { action: "replace", orderId: entry.id },
  };
}

function firstRemainingStart(entry: OrderEntry, now: number): { day: number; time: string } {
  const o = entry.order;
  if (o.type !== "injection") throw new Error("注射を選んでください");
  const first = doseTimes({ ...entry, order: { ...o, omittedDoses: [] } }, now, now, now + 366 * 1440)[0];
  const at = first ?? Math.max(now, o.start.day * 1440);
  return { day: Math.floor(at / 1440), time: `${String(Math.floor(at % 1440 / 60)).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}` };
}
