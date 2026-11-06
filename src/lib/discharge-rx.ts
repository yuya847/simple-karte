import { patternText } from "./day-pattern";
// 退院時処方 → 薬袋 and 薬剤情報提供文書. One bag per Rp (drugs taken with one usage), the total
// amount counted in code (1回量 × 回数 × 日数), and one information sheet listing every drug with what it
// is for and what to watch for (drug-info.ts). The pharmacist dispenses, checks and hands them over.

import { drugInfoOf, type DrugInfo } from "./drug-info";
import { findOralDrug } from "./master";
import { timingName } from "./rx";
import type { OrderEntry, PrescriptionOrder } from "./types";

export interface BagDrug {
  code: string;
  name: string;
  strength: string;
  per: number;
  unit: string;
  /** Total handed over (1回量 × 回数 × 日数), null for 頓服 without a count. */
  total: number | null;
  info: DrugInfo;
}

export interface MedBag {
  dayPattern?: import("./types").DayPattern;
  rp: string;
  kind: "内服" | "頓服" | "外用" | "材料" | "自己注射";
  /** "1日2回　朝・夕食後" or the 頓服 condition. */
  how: string;
  times: number;
  days: number | null;
  drugs: BagDrug[];
  orderIds: string[];
  doctor: string;
  /** When the doctor wrote it (day offset and time). */
  at: { day: number; time: string };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const isHomeRx = (e: OrderEntry): e is OrderEntry & { order: PrescriptionOrder } => e.order.type === "prescription" && e.order.category === "退院時" && e.status !== "中止";

/** The bags for a patient's 退院時処方 (active ones), in the order written. */
export function bagsOf(entries: OrderEntry[]): MedBag[] {
  const groups = new Map<string, (OrderEntry & { order: PrescriptionOrder })[]>();
  for (const e of entries.filter(isHomeRx)) {
    const k = e.order.rp ?? e.id;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  return [...groups.entries()].map(([rp, es]) => {
    const o = es[0].order;
    const prn = o.timings.length === 0;
    const times = o.timings.length;
    return {
      rp,
      dayPattern: o.dayPattern,
      kind: o.administration ? o.administration.kind : prn ? "頓服" : "内服",
      how: o.administration ? o.administration.usage : prn ? `${o.prn ?? "必要時"}${o.maxPerDay ? `（1日${o.maxPerDay}回まで）` : ""}` : `${o.dayPattern ? patternText(o.dayPattern) + "　" : ""}1日${times}回　${timingName(o.timings)}`,
      times,
      days: o.days ?? null,
      drugs: es.map((e) => {
        const m = findOralDrug(e.order.drugCode);
        return {
          code: e.order.drugCode,
          name: m?.name ?? e.order.drugCode,
          strength: m?.strength ?? "",
          per: e.order.amount,
          unit: e.order.unit,
          total: e.order.administration ? e.order.amount : o.days ? round2(e.order.amount * (prn ? 1 : times) * o.days) : null,
          info: drugInfoOf(e.order.drugCode),
        };
      }),
      orderIds: es.map((e) => e.id),
      doctor: es[0].author,
      at: { day: es[0].day, time: es[0].time },
    };
  });
}

/** "14日分" or "10回分" (頓服). */
export const amountText = (b: MedBag) => (b.days ? (b.kind === "頓服" ? `${b.days}回分` : `${b.days}${b.dayPattern ? "投与日分" : "日分"}`) : "");

/** One line per bag, for the record and the お薬手帳 sticker. */
export const bagLine = (b: MedBag) => `${b.drugs.map((d) => `${d.name}${d.strength} ${["外用", "材料", "自己注射"].includes(b.kind) ? "総量" : "1回"}${d.per}${d.unit}`).join("、")}　${b.how}　${amountText(b)}`;
