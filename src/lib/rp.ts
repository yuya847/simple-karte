import { patternText } from "./day-pattern";
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
    if (d.dayPattern) parts.push(patternText(d.dayPattern));
    if (d.days && d.schedule?.kind !== "once") parts.push(`${d.days}日間`);
    return `${drugs}　${parts.join("　")}`;
  }
  if (d.kind === "prescription") {
    if (d.administration) return `${d.items.map(it => `${it.drugCode ? oralName(it.drugCode) : it.said} 総量${it.perDose ?? "？"}${findOralDrug(it.drugCode ?? "")?.unit ?? ""}`).join("、")}　${d.administration.usage}　${d.category ?? ""}${d.comment ? `　${d.comment}` : ""}`;
    const times = d.timings === null ? 0 : d.timings.length;
    const drugs = d.items
      .map((it) => {
        const per = perDoseOf(it, d.timings && d.timings.length === 0 ? 1 : times);
        return `${it.drugCode ? oralName(it.drugCode) : it.said} 1回${per ?? "？"}${it.drugCode ? (findOralDrug(it.drugCode)?.unit ?? "") : ""}`;
      })
      .join("、");
    return `${drugs}　${d.dayPattern ? patternText(d.dayPattern) + "　" : ""}${d.once ? "1回だけ・今すぐ" : howText(d.timings, d.prn, d.maxPerDay)}${!d.once && d.days ? `　${d.days}${d.dayPattern ? "投与日分" : "日分"}` : ""}${d.category ? `　${d.category}` : ""}${d.category === "退院時" && d.start.day === null ? "　退院日から" : ""}${d.comment ? `　${d.comment}` : ""}${d.onePack ? "　一包化" : ""}`;
  }
  return "";
}
