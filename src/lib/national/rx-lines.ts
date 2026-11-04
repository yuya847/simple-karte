// A prescription as the national services need it: one line per drug, with its Rp, 1回量, 用法 and 日数.
// Made from the outpatient prescription's drafts (外来処方) or from the 退院時処方 orders.

import type { Draft } from "../drafts";
import { bagsOf } from "../discharge-rx";
import { findOralDrug } from "../master";
import { perDoseOf } from "../rx";
import type { DoseTiming, OrderEntry } from "../types";

export interface RxLine {
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
      out.push({ rp, drug: it.drugCode, perDose: perDoseOf(it, times), unit: findOralDrug(it.drugCode)?.unit ?? "", timings, prn: timings.length === 0 ? d.prn : null, maxPerDay: d.maxPerDay, days: d.days });
    }
  }
  return out;
}

/** The lines of the active 退院時処方 (one Rp per 薬袋). */
export function linesFromHomeRx(entries: OrderEntry[]): RxLine[] {
  return bagsOf(entries).flatMap((b, i) => {
    const e = entries.find((x) => x.id === b.orderIds[0]);
    const o = e?.order.type === "prescription" ? e.order : null;
    return b.drugs.map((d) => ({ rp: i + 1, drug: d.code, perDose: d.per, unit: d.unit, timings: o?.timings ?? [], prn: o && o.timings.length === 0 ? (o.prn ?? null) : null, maxPerDay: o?.maxPerDay ?? null, days: b.days }));
  });
}
