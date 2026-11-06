import { ADOPTED_TOPICAL } from "./formulary-items";
import type { OralDrugMaster } from "./master";
export interface PrescriptionUse { kind: "外用" | "材料" | "自己注射"; usage: string; frequency?: number; site?: string; method?: string }
export const PEN_NEEDLE_CODE = "710010093";
export const PEN_NEEDLE: OralDrugMaster = { code: PEN_NEEDLE_CODE, name: "ペン型注入器用注射針（標準型）", strength: "", unit: "本", prescriptionKind: "材料", aliases: ["インスリン針", "ペン針", "万年筆型注入器用注射針"] };
const adoptedTopical: OralDrugMaster[] = ADOPTED_TOPICAL.map(r => ({ code: r[0], name: r[1].normalize("NFKC"), strength: "", unit: r[2].normalize("NFKC") as OralDrugMaster["unit"], prescriptionKind: "外用", aliases: [r[5].normalize("NFKC").replace("【般】", ""), ...(/パップ|テープ/.test(r[1]) ? ["湿布", "貼付剤"] : [])] }));
// タリビッド耳科用液 IF（2022年7月 第3版）X.13：620007669 / 1329706Q1039。
// https://pins.japic.or.jp/pdf/medical_interview/IF00004852.pdf
export const EAR_DROP = { code: "620007669", yakka: "1329706Q1039", name: "タリビッド耳科用液０．３％　３ｍｇ", unit: "ｍＬ" };
export const TOPICAL_PRESCRIPTIONS: OralDrugMaster[] = [...adoptedTopical, { code: EAR_DROP.code, name: EAR_DROP.name.normalize("NFKC"), strength: "", unit: "mL", prescriptionKind: "外用", aliases: ["点耳", "耳科用液", "オフロキサシン"] }];
export const TOPICAL_METHODS = ["貼付", "塗布", "点眼", "点鼻", "点耳", "噴霧", "挿入", "吸入", "含嗽"];
export const TOPICAL_SITES = ["腰", "膝", "両膝", "肩", "患部", "両眼", "右眼", "左眼", "両鼻", "両耳"];
export function totalPrescriptionText(use: PrescriptionUse, amount: number | null, unit: string): string {
  return `${use.usage}　総量${amount ?? "？"}${unit}`;
}
