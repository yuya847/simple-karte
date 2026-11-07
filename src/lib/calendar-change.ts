import { newProcedureDraft, type ProcedureDraft } from "./drafts";
import { previousOf } from "./rx-memory";
import type { OrderEntry } from "./types";
/** Copy the selected order only; confirmation remains in the ordinary order workflow. */
export function calendarChange(entry: OrderEntry, patientId: string, id: string) {
  const o = entry.order;
  if (o.type === "prescription") {
    const [pattern] = previousOf(patientId, [{ ...entry, order: { ...o, category: o.category === "持参薬" ? "定期" : o.category } }]);
    return pattern ? { kind: "rx" as const, pattern } : null;
  }
  if (o.type !== "procedure") return null;
  const draft: ProcedureDraft = { ...newProcedureDraft(o.code, id), sourceText: "（カレンダーから変更）", site: o.site ?? null, area: o.area ?? null, depth: o.depth ?? null, o2: o.o2 ?? { device: null, lpm: null }, hd: o.hd, vent: o.vent, tx: o.tx, rehab: o.rehab, consult: o.consult, leave: o.leave, guide: o.guide, move: o.move, schedule: o.schedule, start: { day: 0, time: o.start.time ?? null }, days: o.days ?? null, drug: o.drug ? { ...o.drug, said: o.drug.code } : null, comment: o.comment ?? null };
  return { kind: "procedure" as const, draft };
}
