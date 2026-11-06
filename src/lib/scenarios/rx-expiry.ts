import type { Patient } from "../types";
/** 架空の処方切れ操作例。既存処方の量・薬剤は変えず、数人の残日数を設定する。 */
export function addRxExpiryCases(p: Patient, i: number, stage: string) {
  if (stage !== "入院" || i % 6 > 1) return;
  for (const type of ["prescription", "injection"] as const) {
    const e = p.history.find(e => e.kind === "order" && e.status === "有効" && e.order.type === type && e.order.days && (e.order.type !== "prescription" || (e.order.category !== "退院時" && !e.order.prn && !e.order.once && e.order.timings.length)) && (e.order.type !== "injection" || e.order.schedule.kind !== "once"));
    if (e?.kind !== "order" || (e.order.type !== "prescription" && e.order.type !== "injection")) continue;
    e.order.start.day = Math.min(-1, e.order.start.day);
    e.order.days = -e.order.start.day + 1 + i % 2;
    e.order.dayPattern = undefined;
    if (e.order.type === "injection" && e.order.end) e.order.end.day = i % 2;
  }
}
