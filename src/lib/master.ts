// Master data for a FICTIONAL hospital ("架空の病院").
// Drug names and package sizes are public facts; the selection, aliases, set contents
// and ward rules below are made up for this prototype and are not any real hospital's.

import type { InjectionRoute } from "./types";

export interface DrugMaster {
  code: string;
  name: string;
  /** Package description shown on screen, e.g. "500mL/袋". */
  package: string;
  kind: "輸液" | "抗菌薬" | "その他";
  /** For fluids: volume of one bag/bottle in mL. */
  volumeMl?: number;
  /** For vials/ampoules: strength of one unit. */
  strength?: { amount: number; unit: "g" | "mg"; per: "V" | "A" | "袋" };
  /** Units a doctor may use for this drug. Anything else is a unit error. */
  units: string[];
  routes: InjectionRoute[];
  /** Words doctors say for this drug (brand names, abbreviations). */
  aliases: string[];
}

export const DRUGS: DrugMaster[] = [
  {
    code: "INJ-NS500",
    name: "生理食塩液",
    package: "500mL/袋",
    kind: "輸液",
    volumeMl: 500,
    units: ["mL", "本", "袋"],
    routes: ["点滴静注"],
    aliases: ["生食", "生理食塩水", "NS", "生食500"],
  },
  {
    code: "INJ-NS100",
    name: "生理食塩液",
    package: "100mL/袋",
    kind: "輸液",
    volumeMl: 100,
    units: ["mL", "本", "袋"],
    routes: ["点滴静注"],
    aliases: ["生食100", "生食 100"],
  },
  {
    code: "INJ-VEENF500",
    name: "酢酸リンゲル液（ヴィーンF）",
    package: "500mL/袋",
    kind: "輸液",
    volumeMl: 500,
    units: ["mL", "本", "袋"],
    routes: ["点滴静注"],
    aliases: ["ヴィーンF", "ヴィーン", "ビーンF", "酢酸リンゲル"],
  },
  {
    code: "INJ-SOL3A500",
    name: "維持液（ソルデム3A）",
    package: "500mL/袋",
    kind: "輸液",
    volumeMl: 500,
    units: ["mL", "本", "袋"],
    routes: ["点滴静注"],
    aliases: ["ソルデム3A", "ソルデム", "3A", "維持液"],
  },
  {
    code: "INJ-GLU5-500",
    name: "5%ブドウ糖液",
    package: "500mL/袋",
    kind: "輸液",
    volumeMl: 500,
    units: ["mL", "本", "袋"],
    routes: ["点滴静注"],
    aliases: ["5%ブドウ糖", "5%TZ", "5%糖"],
  },
  {
    code: "INJ-VCM05",
    name: "バンコマイシン塩酸塩点滴静注用",
    package: "0.5g/V",
    kind: "抗菌薬",
    strength: { amount: 0.5, unit: "g", per: "V" },
    units: ["g", "mg", "V"],
    routes: ["点滴静注"],
    aliases: ["VCM", "バンコ", "バンコマイシン"],
  },
  {
    code: "INJ-CEZ1",
    name: "セファゾリンナトリウム注射用",
    package: "1g/V",
    kind: "抗菌薬",
    strength: { amount: 1, unit: "g", per: "V" },
    units: ["g", "mg", "V"],
    routes: ["点滴静注", "静注"],
    aliases: ["CEZ", "セファゾリン", "セファメジン"],
  },
  {
    code: "INJ-SBTABPC3",
    name: "スルバクタム・アンピシリン静注用",
    package: "3g/V",
    kind: "抗菌薬",
    strength: { amount: 3, unit: "g", per: "V" },
    units: ["g", "mg", "V"],
    routes: ["点滴静注", "静注"],
    aliases: ["ABPC/SBT", "SBT/ABPC", "ユナシン", "スルバシリン"],
  },
  {
    code: "INJ-CTRX1",
    name: "セフトリアキソンナトリウム静注用",
    package: "1g/V",
    kind: "抗菌薬",
    strength: { amount: 1, unit: "g", per: "V" },
    units: ["g", "mg", "V"],
    routes: ["点滴静注", "静注"],
    aliases: ["CTRX", "セフトリアキソン", "ロセフィン"],
  },
  {
    code: "INJ-FRS20",
    name: "フロセミド注",
    package: "20mg/2mL/A",
    kind: "その他",
    strength: { amount: 20, unit: "mg", per: "A" },
    units: ["mg", "A", "mL"],
    routes: ["静注", "筋注"],
    aliases: ["ラシックス", "フロセミド"],
  },
  {
    code: "INJ-APAP1000",
    name: "アセトアミノフェン静注液",
    package: "1000mg/100mL/袋",
    kind: "その他",
    strength: { amount: 1000, unit: "mg", per: "袋" },
    units: ["mg", "mL", "袋", "本"],
    routes: ["点滴静注"],
    aliases: ["アセリオ", "アセトアミノフェン"],
  },
];

export interface LabMaster {
  code: string;
  name: string;
  specimen: "血液" | "尿" | "その他";
  /** For sets: analyte codes the set contains. */
  contains?: string[];
  aliases: string[];
  /** Words that must be asked when missing, e.g. number of culture sets. */
  needs?: "sets";
}

export const LAB_TESTS: LabMaster[] = [
  {
    code: "LAB-CBC",
    name: "血算（CBC）",
    specimen: "血液",
    contains: ["WBC", "RBC", "Hb", "Ht", "Plt"],
    aliases: ["CBC", "血算", "末梢血"],
  },
  {
    code: "LAB-DIFF",
    name: "白血球分画",
    specimen: "血液",
    contains: ["Neut", "Lymph"],
    aliases: ["分画", "白血球分画", "像"],
  },
  {
    code: "LAB-CHEM",
    name: "生化学（病棟定期セット）",
    specimen: "血液",
    contains: ["TP", "Alb", "AST", "ALT", "LDH", "ALP", "T-Bil", "BUN", "Cre", "Na", "K", "Cl", "Glu"],
    aliases: ["生化", "生化一式", "生化学", "バイオ"],
  },
  {
    code: "LAB-CRP",
    name: "CRP",
    specimen: "血液",
    contains: ["CRP"],
    aliases: ["CRP"],
  },
  {
    code: "LAB-COAG",
    name: "凝固（PT・APTT）",
    specimen: "血液",
    contains: ["PT-INR", "APTT"],
    aliases: ["凝固", "PT", "APTT"],
  },
  {
    code: "LAB-BNP",
    name: "BNP",
    specimen: "血液",
    contains: ["BNP"],
    aliases: ["BNP"],
  },
  {
    code: "LAB-VCM",
    name: "バンコマイシン血中濃度",
    specimen: "血液",
    contains: ["VCM"],
    aliases: ["VCM濃度", "バンコ濃度", "VCMトラフ", "TDM", "バンコマイシン濃度"],
  },
  {
    code: "LAB-BCX",
    name: "血液培養",
    specimen: "血液",
    aliases: ["血培", "血液培養"],
    needs: "sets",
  },
  {
    code: "LAB-UA",
    name: "尿一般（定性・沈渣）",
    specimen: "尿",
    aliases: ["検尿", "尿一般", "尿定性", "沈渣"],
  },
  {
    code: "LAB-UCX",
    name: "尿培養",
    specimen: "尿",
    aliases: ["尿培", "尿培養"],
  },
];

/** A set approved by the (fictional) hospital. The AI may call it, never edit it. */
export interface OrderSet {
  code: string;
  name: string;
  labCodes: string[];
  aliases: string[];
}

export const ORDER_SETS: OrderSet[] = [
  {
    code: "SET-ADMIT",
    name: "入院時採血セット",
    labCodes: ["LAB-CBC", "LAB-DIFF", "LAB-CHEM", "LAB-CRP", "LAB-COAG"],
    aliases: ["入院時セット", "入院時採血", "いつもの入院時"],
  },
  {
    code: "SET-ROUTINE",
    name: "定期採血セット",
    labCodes: ["LAB-CBC", "LAB-CHEM", "LAB-CRP"],
    aliases: ["定期採血", "いつもの採血", "定期セット"],
  },
];

/** Analytes shown in the lab result table, with units and reference ranges (general adult ranges). */
export const ANALYTES: { code: string; name: string; unit: string; low?: number; high?: number }[] = [
  { code: "WBC", name: "WBC", unit: "/μL", low: 3300, high: 8600 },
  { code: "Neut", name: "好中球", unit: "%", low: 40, high: 75 },
  { code: "Hb", name: "Hb", unit: "g/dL", low: 13.7, high: 16.8 },
  { code: "Plt", name: "Plt", unit: "万/μL", low: 15.8, high: 34.8 },
  { code: "CRP", name: "CRP", unit: "mg/dL", high: 0.14 },
  { code: "AST", name: "AST", unit: "U/L", low: 13, high: 30 },
  { code: "ALT", name: "ALT", unit: "U/L", low: 10, high: 42 },
  { code: "BUN", name: "BUN", unit: "mg/dL", low: 8, high: 20 },
  { code: "Cre", name: "Cre", unit: "mg/dL", low: 0.65, high: 1.07 },
  { code: "Na", name: "Na", unit: "mmol/L", low: 138, high: 145 },
  { code: "K", name: "K", unit: "mmol/L", low: 3.6, high: 4.8 },
  { code: "Alb", name: "Alb", unit: "g/dL", low: 4.1, high: 5.1 },
  { code: "BNP", name: "BNP", unit: "pg/mL", high: 18.4 },
  { code: "VCM", name: "VCM", unit: "μg/mL" },
];

/** Ward rules of the fictional hospital. */
export const WARD_RULES = {
  /** Time of the routine morning blood draw ("明日朝" means this time). */
  routineDrawTime: "06:00",
  /** A drug level timed "before the N-th dose" is drawn this many minutes before that dose. */
  minutesBeforeDoseForLevel: 30,
} as const;

export function findDrug(code: string): DrugMaster | undefined {
  return DRUGS.find((d) => d.code === code);
}

export function findLab(code: string): LabMaster | undefined {
  return LAB_TESTS.find((t) => t.code === code);
}

export function findSet(code: string): OrderSet | undefined {
  return ORDER_SETS.find((s) => s.code === code);
}

export function drugLabel(d: DrugMaster): string {
  return `${d.name} ${d.package}`;
}
