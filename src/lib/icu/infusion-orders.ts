import type { Draft, InjectionDraft, StopDraft } from "../drafts";
import { injectionRateDraft } from "../injection-change";
import { findDrug } from "../master";
import { abs } from "../flowsheet";
import type { InjectionOrder, OrderEntry } from "../types";
import { doseText } from "./gamma";
import type { At, Infusion } from "./types";

const latest = (inf: Infusion) => [...inf.changes].sort((a, b) => abs(a.at.day, a.at.time) - abs(b.at.day, b.at.time)).at(-1)!;
const comment = (inf: Infusion, at: At) => `持続（シリンジポンプ）総量 ${inf.volumeMl}mL ${doseText({ ...inf, end: undefined }, abs(at.day, at.time)).split("（")[0]}`;

export function infusionDraft(inf: Infusion, by: string, id: string): InjectionDraft {
  const unit = inf.doseUnit === "単位/h" ? "単位" : "mg";
  const drug = findDrug(inf.drugCode);
  if (!drug) throw new Error("薬をマスターから選んでください");
  const now = latest(inf);
  return { id, origin: "manual", sourceText: `${by} 持続投与`, comment: comment(inf, now.at), kind: "injection",
    items: [{ drugCode: inf.drugCode, said: inf.name, amount: inf.amountMg, unit }],
    route: "静注", schedule: { kind: "once" }, start: { ...inf.start }, days: null,
    infusionMinutes: null, infusionScope: "per_dose", rateMlPerH: now.rateMlPerH, prefer: "rate", duplicate: null,
    continuous: { infusionId: inf.id } };
}

export function infusionRateChangeDraft(entry: OrderEntry, inf: Infusion, rateMlPerH: number, at: At, by: string, id: string): Draft {
  const d = injectionRateDraft(entry, { time: at.time, rate: rateMlPerH }, id);
  const changed = { ...inf, changes: [...inf.changes, { at, rateMlPerH, by }] };
  return { ...d, start: { ...at }, days: null, continuous: { infusionId: inf.id }, comment: comment(changed, at) };
}

export function infusionStopDraft(entry: OrderEntry, at: At, by: string, id: string): StopDraft {
  return { id, origin: "manual", sourceText: `${by} 持続投与終了`, comment: null, kind: "stop", drugCode: null, said: "持続投与終了", targetOrderId: entry.id, effectiveDay: at.day, stopTime: at.time };
}

export function infusionOrderEntry(inf: Infusion, by: string): OrderEntry {
  const d = infusionDraft(inf, by, inf.orderId ?? `${inf.id}-order`);
  const order: InjectionOrder = { type: "injection", items: d.items.map(i => ({ drugCode: i.drugCode!, amount: i.amount!, unit: i.unit! })), route: "静注", schedule: { kind: "once" }, start: { ...inf.start }, rateMlPerH: d.rateMlPerH!, comment: d.comment!, continuous: d.continuous, ...(inf.end ? { end: { ...inf.end } } : {}) };
  return { kind: "order", id: d.id, ...inf.start, author: by, status: inf.end ? "終了" : "有効", order };
}
