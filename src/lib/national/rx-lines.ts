// A prescription as the national services need it: one line per drug, with its Rp, 1回量, 用法 and 日数.
// Made from the outpatient prescription's drafts (外来処方) or from the 退院時処方 orders.

import type { Draft } from "../drafts";
import { bagsOf } from "../discharge-rx";
import { findOralDrug } from "../master";
import { patternText } from "../day-pattern";
import { perDoseOf, timingName } from "../rx";
import type { DoseTiming, OrderEntry } from "../types";

export interface RxLine {
  administration?: import("../prescription-kind").PrescriptionUse;
  dayPattern?: import("../types").DayPattern;
  /** Rp number (1, 2 …): drugs taken with one usage share it. */
  rp: number;
  /** Our master code (ORAL-…). */
  drug: string;
  /** 1回量 in the drug's unit; null when the doctor gave none (the prescription cannot be sent then). */
  perDose: number | null;
  unit: string;
  /** 服用時点; empty for 頓服. */
  timings: DoseTiming[];
  prn: string | null;
  maxPerDay: number | null;
  /** 日数 (内服) or 回数 (頓服). */
  days: number | null;
}

/** The lines of the outpatient prescription's drafts (only prescriptions with a drug of the master). */
export function linesFromDrafts(drafts: Draft[]): RxLine[] {
  let rp = 0;
  const out: RxLine[] = [];
  for (const d of drafts) {
    if (d.kind !== "prescription") continue;
    rp += 1;
    const timings = d.timings ?? [];
    const times = timings.length === 0 ? 1 : timings.length;
    for (const it of d.items) {
      if (!it.drugCode) continue;
      out.push({ ...(d.administration ? { administration: d.administration } : {}), dayPattern: d.dayPattern, rp, drug: it.drugCode, perDose: perDoseOf(it, times), unit: findOralDrug(it.drugCode)?.unit ?? "", timings, prn: timings.length === 0 ? d.prn : null, maxPerDay: d.maxPerDay, days: d.days });
    }
  }
  return out;
}

/** Several confirmed prescriptions of one visit as one, the Rp numbers counted on. */
export function joinLines(groups: RxLine[][]): RxLine[] {
  let base = 0;
  return groups.flatMap((g) => {
    const top = Math.max(0, ...g.map((l) => l.rp));
    const out = g.map((l) => ({ ...l, rp: l.rp + base }));
    base += top;
    return out;
  });
}

/** The lines of the active 退院時処方 (one Rp per 薬袋). */
export function linesFromHomeRx(entries: OrderEntry[]): RxLine[] {
  return bagsOf(entries).flatMap((b, i) => {
    const e = entries.find((x) => x.id === b.orderIds[0]);
    const o = e?.order.type === "prescription" ? e.order : null;
    return b.drugs.map((d) => ({ ...(o?.administration ? { administration: o.administration } : {}), dayPattern: o?.dayPattern, rp: i + 1, drug: d.code, perDose: d.per, unit: d.unit, timings: o?.timings ?? [], prn: o && o.timings.length === 0 ? (o.prn ?? null) : null, maxPerDay: o?.maxPerDay ?? null, days: b.days }));
  });
}

/** 処方内容の表示・印字。総量の処方に内服の日数を掛けない。 */
export function prescriptionLineText(line: RxLine): string {
  const d = findOralDrug(line.drug);
  const name = d ? `${d.name}${d.strength && !d.name.includes(d.strength) ? ` ${d.strength}` : ""}` : line.drug;
  if (line.administration) return `Rp${line.rp} ${name}　${line.administration.kind}　${line.administration.usage}　総量${line.perDose ?? "？"}${line.unit}`;
  return `Rp${line.rp} ${d ? `${d.name}${d.strength}` : line.drug} 1回${line.perDose ?? "？"}${line.unit} ${line.dayPattern ? patternText(line.dayPattern) + " " : ""}${line.timings.length ? `1日${line.timings.length}回 ${timingName(line.timings)}` : `頓用 ${line.prn ?? ""}${line.maxPerDay ? `（1日${line.maxPerDay}回まで）` : ""}`} ${line.days ?? "？"}${line.timings.length ? line.dayPattern ? "投与日分" : "日分" : "回分"}`;
}
