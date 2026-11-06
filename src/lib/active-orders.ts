import { orderEndDay } from "./drafts";
import { currentLines, type StandingLine } from "./standing-lines";
import type { HistoryEntry, OrderEntry } from "./types";

/** 未実施の検査は予定時刻を過ぎても、完了・中止まで一覧に残す。 */
export function activeOrders(entries: HistoryEntry[], day = 0): OrderEntry[] {
  return entries.filter((e): e is OrderEntry => {
    if (e.kind !== "order" || e.status !== "有効") return false;
    if (e.order.type === "injection" && e.order.end && e.order.end.day < day) return false;
    if ((e.order.type === "imaging" || e.order.type === "physio") && (e.exam?.done || e.exam?.notDone)) return false;
    if (e.order.type === "injection" || e.order.type === "prescription") {
      const end = orderEndDay(e.order);
      return end === null || end >= day;
    }
    if (e.order.type === "procedure" && e.order.days !== undefined) return e.order.start.day + e.order.days - 1 >= day;
    return true;
  });
}
export function activeStandingLines(lines: StandingLine[], day = 0) {
  return currentLines(lines, day);
}
export function emptyCalendar(tab: string, entries: HistoryEntry[]) {
  const type = tab === "rxcal" ? "prescription" : tab === "proccal" ? "procedure" : null;
  return !!type && !entries.some(e => e.kind === "order" && e.order.type === type);
}
