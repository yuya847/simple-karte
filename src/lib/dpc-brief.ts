// DPC の入院期間 for the patient list: which 入院期間 today falls in and how many days until the next one,
// from the same calculation as the 算定 tab's DPC (/api/dpc). Until the doctor chooses 医療資源を最も
// 投入した傷病名 the code is a provisional one (仮). The doctor and the 医事課 decide the code.

import type { DpcPeriod } from "./billing/dpc";
import type { DpcMonthView } from "./billing/dpc-claim";

export type DpcBrief =
  | { ok: true; code: string; name: string; period: DpcPeriod | null; hospitalDay: number; days: readonly [number, number, number] | null; provisional: boolean; hokatsu: boolean }
  | { ok: false; reason: string };

export function briefOf(v: DpcMonthView): DpcBrief {
  if (!v.outcome) return { ok: false, reason: "ICD-10 の付いた病名がない" };
  if (!v.outcome.ok) return { ok: false, reason: v.outcome.reason };
  const d = v.outcome.d;
  return {
    ok: true,
    code: d.code,
    name: d.cls.name,
    period: v.now.period,
    hospitalDay: v.now.hospitalDay,
    days: d.row.days ? [d.row.days[0], d.row.days[1], d.row.days[2]] : null,
    provisional: v.chosen?.by !== "doctor",
    hokatsu: d.hokatsu,
  };
}

/** "Ⅲまであと4日" / "期間を超えるまであと2日" / "期間超え（出来高）" / "包括の対象外". */
export function periodNote(b: Extract<DpcBrief, { ok: true }>): string {
  if (!b.hokatsu || !b.days || !b.period) return "包括の対象外（出来高）";
  const [d1, d2, d3] = b.days;
  const hd = b.hospitalDay;
  if (b.period === "Ⅰ") return `Ⅱまであと${d1 + 1 - hd}日`;
  if (b.period === "Ⅱ") return `Ⅲまであと${d2 + 1 - hd}日`;
  if (b.period === "Ⅲ") return `期間を超えるまであと${d3 + 1 - hd}日`;
  return "期間超え（出来高）";
}

/** The 入院日 ranges, for the tooltip: "Ⅰ 1〜4日・Ⅱ 5〜9日・Ⅲ 10〜30日". */
export const rangesText = (days: readonly [number, number, number]) => `Ⅰ 1〜${days[0]}日・Ⅱ ${days[0] + 1}〜${days[1]}日・Ⅲ ${days[1] + 1}〜${days[2]}日`;
