import { DRUGS } from "./master";
import { isInsulin, slidingProblems } from "./insulin";
import { insulinDoses, insulinDoseTimes, fixedInsulinUnits, parseInsulinDoses } from "./insulin-doses";
import type { InjectionDraft } from "./drafts";
import type { AdminRecord } from "./mar";
import type { OrderEntry, SlidingScale } from "./types";

export const insulinProducts = DRUGS.filter(d => d.category === "インスリン");
/** Display names only: order codes remain the existing fictional formulary. */
export function insulinProductLabel(code: string): string {
  const names: Record<string, string> = {
    "DEMO-INS-LISPRO": "ヒューマログ / リスプロ（模擬）",
    "DEMO-INS-ASPART": "ノボラピッド / アスパルト（模擬）",
    "DEMO-INS-HUMAN": "ヒューマリンR / ヒトインスリン（模擬）",
    "DEMO-INS-GLARGINE": "ランタス / グラルギン（模擬）",
    "DEMO-INS-DEGLUDEC": "トレシーバ / デグルデク（模擬）",
  };
  return names[code] ?? insulinProducts.find(d => d.code === code)?.name ?? code;
}
export function interventionDraft(code: string, text: string, day: number, sliding: SlidingScale | undefined, previous?: OrderEntry): InjectionDraft {
  const units = parseInsulinDoses(text);
  if (!insulinProducts.some(d => d.code === code) || !units || units.some(u => !Number.isInteger(u) || u < 0 || u > 30) || (!units.some(Boolean) && !sliding) || !Number.isInteger(day) || day < 1 || (sliding && slidingProblems(sliding).length)) throw new Error("品名・0〜30単位・開始日・スケールを確認してください。");
  if (previous && (previous.status !== "有効" || previous.order.type !== "injection" || !isInsulin(previous.order))) throw new Error("有効なインスリン指示を選んでください。");
  const doses = insulinDoses(units);
  const times = insulinDoseTimes(doses, sliding?.times);
  return { id: crypto.randomUUID(), kind: "injection", origin: "manual", sourceText: `インスリン ${text}（${day}日後から）`, comment: null, items: [{ drugCode: code, said: insulinProducts.find(d => d.code === code)!.name, amount: 0, unit: "単位" }], route: "皮下注", schedule: { kind: "per_day", count: times.length }, infusionMinutes: null, infusionScope: null, rateMlPerH: null, prefer: null, start: { day, time: times[0] }, days: null, duplicate: previous ? { action: "replace", orderId: previous.id } : null, insulinDoses: doses, doseTimes: times, sliding };
}
/** Actual totals only. Never turn an unrecorded planned dose into an administration. */
export function insulinDay(entries: OrderEntry[], records: Record<string, AdminRecord>, patientId: string, day: number) {
  const doses = Object.values(records).flatMap(r => {
    const e = entries.find(e => e.id === r.orderId);
    if (r.patientId !== patientId || r.status !== "実施" || r.cancellation || Math.floor(r.at / 1440) !== day || !r.insulin || !Number.isFinite(r.insulin.units) || r.insulin.units < 0 || !e || e.order.type !== "injection" || !isInsulin(e.order)) return [];
    const fixed = e.order.sliding && !e.order.insulinDoses ? 0 : fixedInsulinUnits(e.order, r.at);
    return [{ record: r, fixed: Math.min(fixed, r.insulin.units), scale: e.order.sliding ? Math.max(0, r.insulin.units - fixed) : 0 }];
  });
  return { doses, total: doses.reduce((s, d) => s + d.record.insulin!.units, 0), scale: doses.reduce((s, d) => s + d.scale, 0) };
}
export function repeatedScale(entries: OrderEntry[], records: Record<string, AdminRecord>, patientId: string, lastDay: number) {
  const clocks = [...new Set([lastDay - 2, lastDay - 1, lastDay].flatMap(day => insulinDay(entries, records, patientId, day).doses.map(d => ((d.record.at % 1440) + 1440) % 1440)))].sort((a, b) => a - b);
  return clocks.flatMap(minute => {
    const totals = [lastDay - 2, lastDay - 1, lastDay].map(day => insulinDay(entries, records, patientId, day).doses.filter(d => ((d.record.at % 1440) + 1440) % 1440 === minute).reduce((s, d) => s + d.scale, 0));
    const label = ({450: "朝", 690: "昼", 1050: "夕", 1260: "眠前"} as Record<number, string>)[minute] ?? `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    return totals.every(n => n >= 4) ? [`3日続けて${label}のスケール4単位以上`] : [];
  });
}

/** Open the shared nursing observation entry, creating its item only when absent. */
export function glucoseEntry(orders: import("./care-orders").CareOrder[], patientId: string, day: number, time: string, by: string, id: string): { request: import("./flow-entry").FlowEntry; order?: import("./care-orders").CareOrder } {
  const existing = orders.find(o => o.patientId === patientId && o.kind === "観察" && /血糖/.test(o.item) && !o.stopped);
  const item = existing?.item ?? "血糖測定";
  return {
    request: { kind: "care", item, lo: day * 1440, hi: (day + 1) * 1440 },
    order: existing ? undefined : { id, patientId, item, kind: "観察", unit: "mg/dL", schedule: { kind: "prn" }, everyDays: 1, start: { day, time }, note: "", by, at: { day: 0, time } },
  };
}
