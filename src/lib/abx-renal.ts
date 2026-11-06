import type { HistoryEntry, InjectionOrder, Patient } from "./types";
import { chooseDiluent, diluentChoices } from "./inj-diluent";

/** Formula references; drug doses below are exclusively from the product inserts. */
export const RENAL_FORMULA_SOURCES = {
  cg: "https://www.mhlw.go.jp/topics/bukyoku/iyaku/anzen/",
  egfr: "https://jsn.or.jp/data/gl2023_ckd_ch01.pdf",
  ideal: "https://www.jpn-geriat-soc.or.jp/tool/pdf/guideline2018_01.pdf",
  adjusted: "https://ncuh-pharmacy.jp/wp/wp-content/themes/kb_theme002/images/pages/pharmacy/business/sakura-tdm-instruction-v7.pdf",
};
export const NOT_LISTED = "電子添文に記載なし";
export type WeightKind = "actual" | "ideal" | "adjusted";
export type Dialysis = "HD" | "CHDF" | null;
export function renalWeight(p: Pick<Patient, "heightCm" | "weightKg">, kind: WeightKind): number | null {
  if (!Number.isFinite(p.weightKg) || p.weightKg <= 0) return null;
  if (kind === "actual") return p.weightKg;
  if (!Number.isFinite(p.heightCm) || p.heightCm <= 0) return null;
  const ideal = 22 * (p.heightCm / 100) ** 2;
  return kind === "ideal" ? ideal : ideal + 0.4 * (p.weightKg - ideal);
}
export function renalFunction(age: number, sex: Patient["sex"], weight: number | null, cre: number | null) {
  if (![age, cre].every(v => v !== null && Number.isFinite(v) && v > 0) || age < 18 || age >= 140 || !["男", "女"].includes(sex)) return { ccr: null, egfr: null };
  return {
    ccr: weight !== null && Number.isFinite(weight) && weight > 0 ? (140 - age) * weight / (72 * cre!) * (sex === "女" ? 0.85 : 1) : null,
    egfr: 194 * cre! ** -1.094 * age ** -0.287 * (sex === "女" ? 0.739 : 1),
  };
}
/** Unrounded values decide the band. Dialysis never falls back to a non-dialysis band. */
export function dialysisFromOrders(entries: HistoryEntry[]): Dialysis {
  const active = entries.filter(e => e.kind === "order" && e.status === "有効" && e.order.type === "procedure" && e.order.start.day <= 0 && (e.order.days === undefined || e.order.start.day + e.order.days > 0));
  if (active.some(e => e.kind === "order" && e.order.type === "procedure" && e.order.code === "PROC-CHDF")) return "CHDF";
  if (active.some(e => e.kind === "order" && e.order.type === "procedure" && (e.order.hd?.method === "HD" || e.order.hd?.method === "オンラインHDF" || (e.order.code === "PROC-HD" && !e.order.hd)))) return "HD";
  return null;
}
export interface RenalRow { label: string; min: number; max?: number; maxInclusive?: boolean; factor?: number; mg?: number; hours: number; firstMg?: number; maintenanceDay?: number; text?: string }
export interface AbxItem {
  code: string; name: string; abbreviation: string; route: "注射" | "内服"; family: "LVFX" | "MEPM" | "VCM" | "LZD";
  source: { url: string; version: string; sections: string; checked: string };
  usual: string; rows: RenalRow[]; hd?: string; chdf?: string; tdm?: boolean;
}
const source = (path: string, version: string, sections: string) => ({ url: `https://www.pmda.go.jp/PmdaSearch/iyakuDetail/${path}`, version, sections, checked: "2026-11-07" });
const lvRows: RenalRow[] = [
  { label: "50以上（6節の通常量）", min: 50, mg: 500, hours: 24 },
  { label: "20以上50未満", min: 20, max: 50, mg: 250, hours: 24, firstMg: 500, maintenanceDay: 2 },
  { label: "20未満", min: 0, max: 20, mg: 250, hours: 48, firstMg: 500, maintenanceDay: 3 },
];
const lvSource = source("430773_6241402A1030_1_07", "2020年9月 第1版", "6、7.1、9.2");
const oralSource = source("430574_6241013C2024_1_24", "2023年3月 第2版", "6、7.2、9.2");
// Newly transcribed from the product's PMDA insert. No other product's table is substituted.
export const ABX_RENAL: AbxItem[] = [
  ...[
    { code: "622622001", name: "レボフロキサシン点滴静注500mg/20mL「DSEP」", route: "注射" as const, source: lvSource },
    { code: "622622101", name: "レボフロキサシン点滴静注バッグ500mg/100mL「DSEP」", route: "注射" as const, source: lvSource },
    { code: "621925701", name: "クラビット錠250mg", route: "内服" as const, source: oralSource },
    { code: "621925901", name: "クラビット細粒10%", route: "内服" as const, source: oralSource },
  ].map(p => ({ ...p, abbreviation: "LVFX", family: "LVFX" as const, usual: "成人：500mg 1日1回", rows: lvRows, hd: "用量・間隔の区分は電子添文に記載なし。9.2：透析後の追加投与は不要と考えられる。" })),
  ...[{ code: "621948001", name: "メロペネム点滴静注用0.5g「明治」" }, { code: "622419401", name: "メロペネム点滴静注用1g「明治」" }].map(p => ({
    ...p, abbreviation: "MEPM", family: "MEPM" as const, route: "注射" as const,
    source: source("780009_6139400D1114_1_19", "2025年9月 第3版", "6、7.1、7.2、9.2"),
    usual: "化膿性髄膜炎以外：1日0.5～1gを2～3回。重症・難治性：1回1g、1日3gまで。化膿性髄膜炎：1日6gを3回。発熱性好中球減少症：1日3gを3回。",
    rows: [
      { label: "26～50", min: 26, max: 50, maxInclusive: true, factor: 1, hours: 12 },
      { label: "10～25", min: 10, max: 25, maxInclusive: true, factor: 0.5, hours: 12 },
      { label: "10未満", min: 0, max: 10, factor: 0.5, hours: 24 },
    ], hd: "7.2：血液透析日には透析終了後に投与。用量・間隔の区分は電子添文に記載なし。",
  })),
  { code: "621066003", name: "塩酸バンコマイシン点滴静注用0.5g（OK）", abbreviation: "VCM", family: "VCM", route: "注射", source: source("180024_6113400A1200_1_04", "2026年4月 第2版", "6、7.2、9.2、8.3"), usual: "成人：0.5g 6時間ごと 又は1g 12時間ごと。高齢者：0.5g 12時間ごと 又は1g 24時間ごと。60分以上で点滴。", rows: [], tdm: true },
  { code: "622419501", name: "リネゾリド点滴静注液600mg「明治」", abbreviation: "LZD", family: "LZD", route: "注射", source: source("780009_6249401A1033_1_09", "2025年12月 第3版", "6、7、9.2.1、9.2.2"), usual: "成人：600mg 12時間ごと（1日1200mg）、30分～2時間で点滴。", rows: [], hd: "9.2.2：血液透析後に投与することが望ましい。用量・間隔の区分は電子添文に記載なし。" },
];
export function renalRow(item: AbxItem, ccr: number | null, dialysis: Dialysis): RenalRow | null {
  if (dialysis || ccr === null || !Number.isFinite(ccr) || ccr < 0) return null;
  return item.rows.find(r => ccr >= r.min && (r.max === undefined || (r.maxInclusive ? ccr <= r.max : ccr < r.max))) ?? null;
}
export function rowDose(row: RenalRow, baseMg: number | null) {
  return row.mg ?? (baseMg !== null && Number.isFinite(baseMg) && baseMg > 0 && row.factor !== undefined ? baseMg * row.factor : null);
}
/** The physician selects both indication and the normal dose; no default is selected. */
export const MEPM_INDICATIONS = ["化膿性髄膜炎以外の一般感染症", "重症・難治性感染症", "化膿性髄膜炎", "発熱性好中球減少症"] as const;
export function mepmBase(indication: string, dailyG: number, count: number): number | null {
  if (![dailyG, count].every(Number.isFinite) || dailyG <= 0 || ![2, 3].includes(count)) return null;
  if (indication === MEPM_INDICATIONS[0] && dailyG >= 0.5 && dailyG <= 1) return dailyG * 1000 / count;
  if (indication === MEPM_INDICATIONS[1] && dailyG <= 3 && dailyG / count <= 1) return dailyG * 1000 / count;
  if (indication === MEPM_INDICATIONS[2] && dailyG === 6 && count === 3) return 2000;
  if (indication === MEPM_INDICATIONS[3] && dailyG === 3 && count === 3) return 1000;
  return null;
}
export function abxInjection(item: AbxItem, ccr: number | null, dialysis: Dialysis, baseMg: number | null, phase: "first" | "maintenance", start: { day: number; time: string }, saline: number | null): InjectionOrder | null {
  const row = renalRow(item, ccr, dialysis);
  if (item.route !== "注射" || !row || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start.time) || !Number.isInteger(start.day) || start.day < 0) return null;
  const mg = phase === "first" ? row.firstMg : rowDose(row, baseMg);
  if (!mg || !Number.isFinite(mg)) return null;
  // A first dose is a single administration. Never repeat a loading dose as maintenance.
  const hours = row.hours;
  const drugRows = [{ drugCode: item.code, amount: String(mg), unit: "mg" }];
  if (saline !== null && !diluentChoices(drugRows, "点滴静注").includes(saline)) return null;
  const rows = chooseDiluent({ rows: drugRows }, saline).rows;
  return { type: "injection", items: rows.map(r => ({ ...r, amount: Number(r.amount) })), route: "点滴静注", schedule: phase === "first" ? { kind: "once" } : { kind: "every_hours", hours }, start, doseTimes: Array.from({ length: phase === "first" ? 1 : Math.max(1, 24 / hours) }, (_, i) => { const minutes = (Number(start.time.slice(0, 2)) * 60 + Number(start.time.slice(3)) + i * hours * 60) % 1440; return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; }), ...(hours === 48 && phase !== "first" ? { dayPattern: { kind: "every", n: 2 } } : {}), ...(phase === "first" ? { days: 1 } : {}), minutesPerDose: item.family === "LVFX" ? 60 : 30, comment: `${item.abbreviation} ${phase === "first" ? "初日1回" : "維持量"}・${item.source.version} ${item.source.sections}。${row.firstMg ? `初日${row.firstMg}mgを1回、${row.maintenanceDay}日目以降${row.mg}mg／${row.hours}時間。開始日を確認。` : ""}` };
}
