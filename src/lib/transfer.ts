// 転院・施設の調整: asking several hospitals or facilities at once with a summary that does not name the
// patient, and keeping each one's answer (打診中 → 返事 → 面談 → 決定). The summary is put together by code
// from the chart; who goes where is decided by the patient, the family and the doctor. Facilities are
// fictional.

import { biOf, biTotal, type BiEval } from "./barthel";
import { ANAMNESIS_SECTIONS, type AnamnesisFields } from "./anamnesis";
import { findDrug, findOralDrug } from "./master";
import type { OrderEntry, Patient } from "./types";

export const FACILITIES = [
  { name: "みどり台リハビリテーション病院（架空）", kind: "回復期リハビリテーション病棟" },
  { name: "さくら坂病院（架空）", kind: "医療療養病棟" },
  { name: "かえで地域包括ケア病院（架空）", kind: "地域包括ケア病棟" },
  { name: "介護老人保健施設 ひだまり（架空）", kind: "介護老人保健施設" },
  { name: "特別養護老人ホーム あおば（架空）", kind: "特別養護老人ホーム" },
  { name: "サービス付き高齢者向け住宅 こもれび（架空）", kind: "サービス付き高齢者向け住宅" },
] as const;

export const ASK_STATES = ["打診中", "受け入れ可", "受け入れ不可", "面談・見学の予定", "決定", "取り下げ"] as const;
export type AskState = (typeof ASK_STATES)[number];

export interface TransferAsk {
  id: string;
  patientId: string;
  facility: string;
  kind: string;
  state: AskState;
  /** Each change: when, who, what (the facility's answer in words). */
  log: { at: string; by: string; state: AskState; note: string }[];
  /** 面談・見学 date (free text, e.g. 11/6 14:00). */
  meeting?: string;
}

export function transferAdl(records: BiEval[], patientId: string): string | undefined {
  const latest = biOf(records, patientId).at(-1);
  const total = latest ? biTotal(latest.scores) : null;
  return total === null ? undefined : `Barthel Index ${total}/100点`;
}

// Free text is never copied from keyPerson: only a known relationship is returned.
export function transferRelationship(value: string): string | undefined {
  return value.trim().match(/^(配偶者|夫|妻|長男|長女|次男|次女|三男|三女|息子|娘|父|母|兄|姉|弟|妹|孫|甥|姪|友人|後見人)(?=$|[\s（(:：、・])/u)?.[1];
}
const recordedChoice = (key: "living" | "careInsurance" | "cognition", value?: string) => {
  const field = ANAMNESIS_SECTIONS.flatMap(s => s.fields).find(f => f.key === key);
  return field?.type === "one" && field.options.includes(value ?? "") ? value : undefined;
};

const decade = (age: number) => (age >= 90 ? "90代" : `${Math.floor(age / 10) * 10}代`);

/** A summary for asking, without the name, ID, birth date or address. Lines of facts from the chart. */
export function transferSummary(p: Patient, orders: OrderEntry[], extra: { dietNow?: string; restrained: boolean; adl?: string; rest?: string | null; anamnesis?: AnamnesisFields }): string[] {
  const live = orders.filter((e) => e.status === "有効");
  const has = (code: string) => live.some((e) => e.order.type === "procedure" && e.order.code === code);
  const drips = live.filter((e) => e.order.type === "injection").length;
  const care = [has("PROC-O2") && "酸素", has("PROC-FOLEY") && "尿道カテーテル", has("PROC-CVC") && "中心静脈カテーテル", drips > 0 && `点滴（${drips}件）`, has("PROC-SUCTION") && "吸引", has("PROC-HD") && "透析"].filter(Boolean);
  const oral = live.filter(e => e.order.type === "prescription" && e.order.category === "定期" && !e.order.prn && e.order.timings.length > 0);
  const rp = new Set(oral.map(e => e.order.type === "prescription" ? e.order.rp || e.id : e.id)).size;
  const codes = live.flatMap(e => e.order.type === "prescription" ? [e.order.drugCode] : e.order.type === "injection" ? e.order.items.map(i => i.drugCode) : []);
  const drugs = codes.map(code => findOralDrug(code) ?? findDrug(code));
  const known = drugs.every(d => !!d);
  const anticoagulant = drugs.some(d => d && "classes" in d && d.classes?.includes("抗凝固薬"));
  const insulin = drugs.some(d => d?.name.includes("インスリン"));
  const missing = "（記録なし）";
  const f = extra.anamnesis;
  return [
    `${decade(p.age)}${p.sex}性`,
    `病名：${p.admissionDiagnosis}`,
    `入院中の医療処置：${care.length ? care.join("・") : "なし"}`,
    `食事：${extra.dietNow ?? "（記録なし）"}`,
    `日常生活：${extra.adl || missing}`,
    `安静度：${extra.rest || missing}`,
    `住まい：${recordedChoice("living", f?.living) || missing}`,
    `介護保険：${recordedChoice("careInsurance", f?.careInsurance) || missing}`,
    `キーパーソン（続柄）：${transferRelationship(f?.keyPerson ?? "") || missing}`,
    `認知：${recordedChoice("cognition", f?.cognition) || missing}`,
    `定期の内服：${rp} Rp`,
    ...(anticoagulant || known ? [`抗凝固薬：${anticoagulant ? "あり" : "なし"}`] : []),
    ...(insulin || known ? [`インスリン：${insulin ? "あり" : "なし"}`] : []),
    `感染症：${p.infections.length ? p.infections.join("・") : "なし"}`,
    `注意：${[...p.cautions, ...(extra.restrained ? ["身体的拘束中"] : [])].join("・") || "なし"}`,
  ];
}

/** The state after the last change, and whether one place is already decided. */
export const decidedOf = (asks: TransferAsk[]) => asks.find((a) => a.state === "決定");
