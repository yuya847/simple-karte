// 「LD」と打って Tab（または Enter）で、直近の血液検査を学会発表の症例提示の書式で記事に貼る。
// 書式：項目名 値 単位 を「、」で並べ、基準範囲（master.ts の共用基準範囲・SRL）から外れる値に ↑↓ を付ける。
// 血算・凝固・生化学・炎症・心・血液ガス の順（症例提示の慣習。架空の病院の取り決め）。値は直近 1 回分だけ。
import { addDays, formatShort, type CalendarDate } from "./dates";
import { ANALYTES, rangeFor } from "./master";
import type { LabResult, Patient, VitalSign } from "./types";

/** What a person types to call this up (the whole line, with or without the 定型文 の「;」). */
export const LAB_PASTE_KEYS = /^[;；]?(?:LD|ld|Ｌ[Ｄｄ]|ｌｄ)$/;
export const isLabPasteLine = (line: string) => LAB_PASTE_KEYS.test(line.trim());

const GROUPS: { name: string; codes: string[] }[] = [
  { name: "血算", codes: ["WBC", "Neut", "Lymph", "Hb", "Ht", "MCV", "Plt", "Ret"] },
  { name: "凝固", codes: ["PT", "PT-INR", "APTT", "Fib", "DD", "FDP"] },
  { name: "生化学", codes: ["TP", "Alb", "T-Bil", "D-Bil", "AST", "ALT", "LDH", "ALP", "γ-GTP", "ChE", "AMY", "CK", "BUN", "Cre", "eGFR", "UA", "Na", "K", "Cl", "Ca", "IP", "Mg", "Glu", "HbA1c", "TG", "T-Cho", "HDL-C", "LDL-C", "Fe", "UIBC", "Ferritin", "NH3"] },
  { name: "炎症", codes: ["CRP", "PCT"] },
  { name: "心", codes: ["BNP", "NT-proBNP", "TnT", "TnI", "CK-MB"] },
  { name: "血液ガス", codes: ["pH", "PaCO2", "PaO2", "HCO3", "BE", "Lac", "SaO2"] },
];

const fmt = (v: number) => (Number.isInteger(v) && Math.abs(v) >= 1000 ? v.toLocaleString("en-US") : String(v));

/** One item as it is spoken in a case presentation: 「Hb 12.4 g/dL↓」. */
export function labItemText(code: string, value: number, sex: Patient["sex"]): string {
  const a = ANALYTES.find((x) => x.code === code);
  const r = a ? rangeFor(a, sex) : {};
  const flag = r.high !== undefined && value > r.high ? "↑" : r.low !== undefined && value < r.low ? "↓" : "";
  const unit = a?.unit ? ` ${a.unit}` : "";
  return `${code} ${fmt(value)}${unit}${flag}`;
}

/** The latest result (the newest day, then the latest time). */
export function latestLab(labs: LabResult[]): LabResult | null {
  return labs.length ? [...labs].sort((x, y) => y.day - x.day || y.time.localeCompare(x.time))[0] : null;
}

/** The lines to paste, or null when the patient has no result yet. */
export function labPasteText(p: Pick<Patient, "labs" | "sex">, today: CalendarDate): string | null {
  const r = latestLab(p.labs);
  if (!r) return null;
  const used = new Set<string>();
  const lines = GROUPS.flatMap(({ name, codes }) => {
    const items = codes.filter((c) => r.values[c] !== undefined).map((c) => (used.add(c), labItemText(c, r.values[c], p.sex)));
    return items.length ? [`${name}：${items.join("、")}`] : [];
  });
  const rest = Object.keys(r.values).filter((c) => !used.has(c)).map((c) => labItemText(c, r.values[c], p.sex));
  if (rest.length) lines.push(`その他：${rest.join("、")}`);
  return [`血液検査（${formatShort(addDays(today, r.day))} ${r.time}）`, ...lines].join("\n");
}

// ---------- 「ばいたる」で直近のバイタル ----------

/** 「ばいたる」「バイタル」「VS」 on its own line (with or without the 定型文 の「;」). */
export const VITALS_PASTE_KEYS = /^[;；]?(?:ばいたる|バイタル|ﾊﾞｲﾀﾙ|VS|vs|ＶＳ|ｖｓ)$/;
export const isVitalsPasteLine = (line: string) => VITALS_PASTE_KEYS.test(line.trim());

const AVPU_JA: Record<string, string> = { A: "清明（A）", C: "新たな錯乱（C）", V: "声に反応（V）", P: "痛みに反応（P）", U: "反応なし（U）" };

/** The latest vital signs (the newest day, then the latest time). */
export function latestVital(vitals: VitalSign[]): VitalSign | null {
  return vitals.length ? [...vitals].sort((x, y) => y.day - x.day || y.time.localeCompare(x.time))[0] : null;
}

/** 「バイタル（11/5（木） 11:32）：JCS …、BT 38.2℃、BP 92/54 mmHg、HR 118 /分、RR 26 /分、SpO2 90%（室内気）」 */
export function vitalsPasteText(p: Pick<Patient, "vitals">, today: CalendarDate): string | null {
  const v = latestVital(p.vitals);
  if (!v) return null;
  const items = [
    v.avpu && `意識 ${AVPU_JA[v.avpu] ?? v.avpu}`,
    v.bt !== undefined && `BT ${v.bt}℃`,
    v.sbp !== undefined && `BP ${v.sbp}${v.dbp !== undefined ? `/${v.dbp}` : ""} mmHg`,
    v.hr !== undefined && `HR ${v.hr} /分`,
    v.rr !== undefined && `RR ${v.rr} /分`,
    v.spo2 !== undefined && `SpO2 ${v.spo2}%（${v.o2 || "室内気"}）`,
  ].filter(Boolean) as string[];
  if (!items.length) return null;
  return `バイタル（${formatShort(addDays(today, v.day))} ${v.time}）：${items.join("、")}`;
}
