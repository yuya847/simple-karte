// 呼吸器のタブで医師が入れた設定を、処置のオーダ（人工呼吸の設定 PROC-VENT）の下書きにする。確定は医師が記事の下で行う。
import { newProcedureDraft, type ProcedureDraft } from "../drafts";
import type { OrderEntry } from "../types";
import type { VentOrder } from "./types";

/** The setting order in force (the latest 有効 one), which a new setting replaces. */
export function runningVentOrder(entries: OrderEntry[]): OrderEntry | undefined {
  return entries.filter((e) => e.status === "有効" && e.order.type === "procedure" && e.order.code === "PROC-VENT").at(-1);
}

/** The draft: continuous from when the order is taken; a running setting order is replaced (stopped at its start). */
export function ventOrderDraft(vent: VentOrder, id: string, running?: OrderEntry): ProcedureDraft {
  return { ...newProcedureDraft("PROC-VENT", id), sourceText: "（ICU 記録の呼吸器から）", vent, schedule: { kind: "continuous" }, start: { day: 0, time: null }, duplicate: running ? { action: "replace", orderId: running.id } : null };
}
