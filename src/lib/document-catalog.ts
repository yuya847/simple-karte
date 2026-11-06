import { DOC_DEFS, DOC_KINDS } from "./documents";
import { CONSENT_TEMPLATES } from "./consent";
import { PROCEDURE_CONSENT_DATA } from "./consent-procedures";
import type { Surgery } from "./surgery";
import type { Diagnosis } from "./diagnoses";
import type { ConsentCode } from "./consent";
import type { OrderEntry, Patient } from "./types";

export const DOCUMENT_CATEGORIES = ["診断書・証明書", "紹介状・返書・情報提供書", "同意書・説明書", "保険・介護", "退院", "死亡", "院内"] as const;
export type DocumentCategory = typeof DOCUMENT_CATEGORIES[number];
export interface CatalogItem { id: string; name: string; description: string; category: DocumentCategory; aliases: string[] }
const readings: Record<string, string[]> = {
  診断書: ["しんだんしょ"], 証明書: ["しょうめいしょ"], 返書: ["へんしょ"], 看護計画: ["かんごけいかく"], 栄養管理計画書: ["えいようかんりけいかくしょ"], 退院支援計画書: ["たいいんしえんけいかくしょ"], 褥瘡対策に関する診療計画書: ["じょくそう", "じょくそうたいさく"], 主治医意見書: ["しゅじいいけんしょ", "意見書"], 訪問看護指示書: ["ほうもんかんごしじしょ"],
  死亡診断書: ["しぼうしんだんしょ"], 死体検案書: ["したいけんあんしょ", "死亡"],
  入院診療計画書: ["にゅういんしんりょうけいかくしょ"], 退院証明書: ["たいいんしょうめいしょ"], 退院療養計画書: ["たいいんりょうようけいかくしょ"],
};
export function documentCategory(name: string): DocumentCategory {
  if (/死亡|検案/.test(name)) return "死亡";
  if (/主治医|訪問看護|保険|介護/.test(name)) return "保険・介護";
  if (/退院/.test(name)) return "退院";
  if (/診断書|証明書/.test(name)) return "診断書・証明書";
  if (/紹介|返書|情報提供/.test(name)) return "紹介状・返書・情報提供書";
  return "院内";
}
export const DOCUMENT_CATALOG: CatalogItem[] = [
  ...DOC_KINDS.map(name => ({ id: name, name, description: DOC_DEFS[name].purpose, category: documentCategory(name), aliases: readings[name] ?? [] })),
  { id: "referral", name: "紹介状・診療情報提供書", description: "紹介先に病状と治療経過を伝える", category: "紹介状・返書・情報提供書", aliases: ["しょうかいじょう", "しんりょうじょうほうていきょうしょ"] },
  ...CONSENT_TEMPLATES.map(t => ({ id: t.code, name: t.short, description: t.sections[0]?.lines[0] ?? t.title, category: "同意書・説明書" as const, aliases: [t.title, PROCEDURE_CONSENT_DATA.find(r => `CONSENT-${r[0]}` === t.code)?.[2] ?? "", ...(( { "CONSENT-ANESTHESIA": ["ますい"], "CONSENT-CVC": ["中心静脈", "ちゅうしんじょうみゃく"], "CONSENT-TRANSFUSION": ["ゆけつ"], "CONSENT-ADMISSION": ["ほうかつどうい"] } as Record<string, string[]>)[t.code] ?? [])] })),
];
export function normalizeDocumentSearch(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/\s+/g, "");
}
export function filterDocuments(items: CatalogItem[], query: string, category?: DocumentCategory): CatalogItem[] {
  const words = query.trim().split(/\s+/).map(normalizeDocumentSearch);
  return items.filter(item => (!category || item.category === category) && words.every(word => normalizeDocumentSearch([item.name, ...item.aliases].join(" ")).includes(word)));
}
export const hasPlannedSurgery = (surgeries: Pick<Surgery, "patientId" | "day" | "status">[], patientId: string) => surgeries.some(s => s.patientId === patientId && s.day >= 0 && (s.status === "申込" || s.status === "受付済"));
export const hasActiveCancer = (diagnoses: Pick<Diagnosis, "icd10" | "outcome">[]) => diagnoses.some(d => d.outcome === "継続" && /^C[0-9]{2}/.test(d.icd10 ?? ""));
export interface DocumentSuggestion { id: string; reason: string }
// Workflow candidates only. No deadline, indication or treatment decision is inferred from these rules.
export function suggestedDocuments(patient: Pick<Patient, "admittedOn">, orders: OrderEntry[], surgery = false, cancer = false): DocumentSuggestion[] {
  const result: DocumentSuggestion[] = [];
  if (patient.admittedOn <= 0 && patient.admittedOn >= -6) result.push({ id: "入院診療計画書", reason: "入院7日以内" });
  if (orders.some(e => e.status === "有効" && e.order.type === "procedure" && e.order.leave?.kind === "退院")) result.push(...["退院証明書", "退院療養計画書"].map(id => ({ id, reason: "退院予定" })));
  if (surgery) result.push({ id: "CONSENT-SURGERY", reason: "手術予定" }, { id: "CONSENT-ANESTHESIA", reason: "手術予定" });
  if (cancer) result.push({ id: "CONSENT-CHEMOTHERAPY", reason: "がんの病名あり" }, { id: "CONSENT-RADIOTHERAPY", reason: "がんの病名あり" });
  return result;
}
export function orderConsentCodes(order: { type: string; code?: string; test?: string; modality?: string; contrast?: string }): ConsentCode[] {
  if (order.type === "physio") return ({ "PHY-EGD": ["CONSENT-EGD"], "PHY-CF": ["CONSENT-COLONOSCOPY"], "PHY-BF": ["CONSENT-BRONCHOSCOPY"] } as Record<string, ConsentCode[]>)[order.test ?? ""] ?? [];
  if (order.type === "procedure") return ({ "PROC-HD": ["CONSENT-DIALYSIS"], "PROC-CVC": ["CONSENT-CVC"], "PROC-TX": ["CONSENT-TRANSFUSION"] } as Record<string, ConsentCode[]>)[order.code ?? ""] ?? [];
  if (order.type === "imaging" && order.contrast && order.contrast !== "単純") return order.modality === "CT" ? ["CONSENT-CT-CONTRAST"] : order.modality === "MRI" ? ["CONSENT-MRI-CONTRAST"] : [];
  return [];
}
export function surgeryConsentCodes(s: { laparoscopic: boolean; procedure: string }): ConsentCode[] {
  const codes: ConsentCode[] = ["CONSENT-SURGERY", "CONSENT-ANESTHESIA"];
  if (s.laparoscopic) codes.push("CONSENT-LAPAROSCOPY");
  else if (/開腹/.test(s.procedure)) codes.push("CONSENT-LAPAROTOMY");
  if (/人工骨頭/.test(s.procedure)) codes.push("CONSENT-HEMIARTHROPLASTY");
  if (/観血的|ORIF/.test(s.procedure)) codes.push("CONSENT-ORIF");
  return codes;
}
