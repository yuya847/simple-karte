import { lineEffective } from "./standing-calendar";
import type { StandingLine } from "./standing-lines";
import type { AdminRecord } from "./mar";
import type { OrderEntry, Patient, HdOrder } from "./types";
import { findDrug, findOralDrug } from "./master";
import { findProc } from "./procedures";

export type SpecialistScreen = "equipment" | "infection" | "oral";
export const specialistRoles = ["臨床工学技士", "ICT", "歯科衛生士"];
// OHAT-J 原著日本語版: https://www.jstage.jst.go.jp/article/jsdr/21/3/21_145/_pdf/-char/ja
export const OHAT = ["口唇", "舌", "歯肉・粘膜", "唾液", "残存歯", "義歯", "口腔清掃", "歯痛"] as const;
export function ohatTotal(scores: number[]): number {
  if (scores.length !== 8 || scores.some(s => !Number.isInteger(s) || s < 0 || s > 2)) throw new Error("8項目を0〜2点で入力してください");
  return scores.reduce((a, b) => a + b, 0);
}
export function activeOrders(entries: OrderEntry[]) {
  return entries.filter(e => {
    if (e.status !== "有効") return false;
    const o = e.order;
    if (!("start" in o)) return false;
    return o.start.day <= 0 && (!("days" in o) || o.days === undefined || o.start.day + o.days > 0) && (!("end" in o) || !o.end || o.end.day >= 0);
  });
}
export interface Equipment { id: string; label: string; hd?: HdOrder }
export function equipmentOf(entries: OrderEntry[], lines: StandingLine[] = [], nowTime = "23:59"): Equipment[] {
  const ordered: Equipment[] = activeOrders(entries).flatMap(e => {
    const o = e.order;
    if (o.type === "injection" && o.rateMlPerH && o.rateMlPerH > 0) return [{ id: e.id, label: `シリンジ／輸液ポンプ ${o.rateMlPerH} mL/時` }];
    if (o.type !== "procedure") return [];
    const label = findProc(o.code)?.name ?? o.code;
    if (o.hd) return [{ id: e.id, label: `透析 ${o.hd.method}`, hd: o.hd }];
    if (o.o2) return [{ id: e.id, label: `酸素 ${o.o2.device} ${o.o2.lpm} L/分` }];
    return /人工呼吸|NPPV|ハイフロー|HFNC|CHDF|モニタ/i.test(label + (o.comment ?? "")) ? [{ id: e.id, label: `${label}${o.comment ? ` ${o.comment}` : ""}` }] : [];
  });
  const instructions = lines.filter(l => lineEffective(l, 0, nowTime)).flatMap(l => l.text.split("\n").flatMap((text, i) => {
    if (!/^\s*(モニター|心電図モニター|人工呼吸器?|NPPV|ハイフロー|HFNC|CHDF)\s*[：:]/i.test(text) || /なし|中止|解除|不要|終了|検討|予定/.test(text)) return [];
    const body = text.split(/[：:]/).slice(1).join(":").trim();
    return body ? [{ id: `${l.id}:${i}`, label: text.trim() }] : [];
  }));
  return [...ordered, ...instructions];
}
// 届出・許可の区分はアプリ内の業務分担（全国共通の制度ではない）。薬剤選択の提案はしない。
export const ANTIBIOTIC_RULES = [
  { match: /メロペネム|イミペネム|ドリペネム/, kind: "許可確認" },
  { match: /タゾバクタム|セフェピム|セフタジジム/, kind: "届出確認" },
  { match: /バンコマイシン|テイコプラニン|アルベカシン|リネゾリド|ダプトマイシン/, kind: "抗MRSA・届出確認" },
];
export function antibioticsOf(entries: OrderEntry[]) {
  return activeOrders(entries).flatMap(e => {
    const o = e.order;
    const names = o.type === "injection" ? o.items.map(i => findDrug(i.drugCode)?.generic ?? findDrug(i.drugCode)?.name ?? i.drugCode) : o.type === "prescription" ? [findOralDrug(o.drugCode)?.name ?? o.drugCode] : [];
    return [...new Set(names)].flatMap(name => {
      const rule = ANTIBIOTIC_RULES.find(r => r.match.test(name));
      return rule && "start" in o ? [{ id: e.id, names: name, kind: rule.kind, days: 1 - o.start.day }] : [];
    });
  });
}
// 厚労省 院内感染対策講習会 https://www.mhlw.go.jp/content/10800000/001530237.pdf
// 個室・接触予防策を自動確定せず、培養陽性から確認対象を示す。
// 耐性菌名の明示だけを拾う。陰性記載・単なる菌種名から耐性や隔離を推測しない。
export function infectionFlags(p: Patient) {
  return p.cultures.flatMap(c => {
    const t = c.organism ?? "";
    if (/陰性|検出せず|negative/i.test(t)) return [];
    const hit = t.match(/MRSA|ESBL|CRE|CD\s*トキシン|C\.?\s*difficile/ig);
    return hit ? [{ text: hit.join("・"), specimen: c.specimen, precaution: "接触予防策・個室の要否を確認" }] : [];
  });
}
export function oralFlags(p: Patient, entries: OrderEntry[], surgery: boolean, lines: StandingLine[] = [], nowTime = "23:59", diagnoses: string[] = []) {
  const diagnosisText = [p.admissionDiagnosis, ...diagnoses].join("・");
  const equipment = equipmentOf(entries, lines, nowTime);
  const priority = [surgery ? "手術予定" : "", /誤嚥性肺炎/.test(diagnosisText) ? "誤嚥性肺炎" : "", /絶食|食止/.test(p.dietNow ?? "") ? "絶食" : "", equipment.some(e => /人工呼吸/.test(e.label)) ? "挿管・人工呼吸" : ""].filter(Boolean);
  const management = surgery || /がん|癌|悪性/.test(diagnosisText) || activeOrders(entries).some(e => /化学療法|抗がん|レジメン/.test(JSON.stringify(e.order)) || (e.order.type === "injection" && e.order.items.some(i => findDrug(i.drugCode)?.chemo)));
  return { priority, management };
}
export interface SpecialistRecord { id: string; patientId: string; screen: SpecialistScreen; at: string; by: string; text: string; scores?: number[]; equipmentId?: string }
export function appendRecord(records: SpecialistRecord[], record: SpecialistRecord) {
  if (!record.text.trim() || !record.by.trim() || !record.at || !record.patientId) throw new Error("記録が不足しています");
  if (record.scores) ohatTotal(record.scores);
  return [...records, record];
}

/** DOT: 同じ薬剤を同じ日に複数回投与しても1日。未実施・取消は含めない。 */
export function dotFor(orderIds: string[], patientId: string, records: AdminRecord[]): number {
  return new Set(records.filter(r => r.patientId === patientId && orderIds.includes(r.orderId) && r.status === "実施" && !r.cancellation).map(r => Math.floor(r.at / 1440))).size;
}
