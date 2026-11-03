// Injection and prescription drafts numbered like an order slip (Rp1, Rp2 …), each kind on its own.

import type { Draft } from "./drafts";
import { drugName, durationText, oralName, scheduleLabel } from "./format";
import { findOralDrug } from "./master";
import { howText, perDoseOf } from "./rx";

export type RpKind = "injection" | "prescription";

/** Draft id → its Rp number within its kind, in the order the drafts were made. */
export function rpNumbers(drafts: Draft[]): Record<string, number> {
  const n: Record<RpKind, number> = { injection: 0, prescription: 0 };
  const out: Record<string, number> = {};
  for (const d of drafts) if (d.kind === "injection" || d.kind === "prescription") out[d.id] = ++n[d.kind];
  return out;
}

/** One line for an injection or prescription draft. */
export function rpLine(d: Draft): string {
  if (d.kind === "injection") {
    const drugs = d.items.map((it) => `${it.drugCode ? drugName(it.drugCode) : it.said} ${it.amount ?? "？"}${it.unit ?? ""}`).join(" ＋ ");
    const parts = [d.route ?? "経路？", d.schedule ? scheduleLabel(d.schedule, d.items[0]?.drugCode) : "回数？"];
    if (d.infusionMinutes) parts.push(`1回${durationText(d.infusionMinutes)}`);
    if (d.days) parts.push(`${d.days}日間`);
    return `${drugs}　${parts.join("　")}`;
  }
  if (d.kind === "prescription") {
    const times = d.timings === null ? 0 : d.timings.length;
    const drugs = d.items
      .map((it) => {
        const per = perDoseOf(it, d.timings && d.timings.length === 0 ? 1 : times);
        return `${it.drugCode ? oralName(it.drugCode) : it.said} 1回${per ?? "？"}${it.drugCode ? (findOralDrug(it.drugCode)?.unit ?? "") : ""}`;
      })
      .join("、");
    return `${drugs}　${howText(d.timings, d.prn, d.maxPerDay)}${d.days ? `　${d.days}日分` : ""}${d.category ? `　${d.category}` : ""}`;
  }
  return "";
}
