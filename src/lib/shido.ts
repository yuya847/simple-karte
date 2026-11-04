// 薬剤管理指導記録（薬剤管理指導料 B008）: what the record must carry, from the 留意事項通知 B008 (令和8年3月5日
// 保医発0305第6号 別添1). Code fills in what the chart already has (氏名・性別・年齢・ID・入院日・投薬と注射・
// アレルギー), shows which running drugs are in the「1」groups and which are 麻薬, and lists what is still missing.
// The pharmacist writes the content and chooses「1」or「2」; whether the content is right is not judged here.
//
// - (1) 医師の同意を得て、薬剤管理指導記録に基づき … 週1回に限り算定
// - (2)「1」は 抗悪性腫瘍剤・免疫抑制剤・… が投薬又は注射されている患者に、これらの薬剤に関し指導した場合
// - (5) 記録の事項：氏名・生年月日・性別・入院年月日・退院年月日・診療録の番号・投薬・注射歴・副作用歴・アレルギー歴・
//   薬学的管理指導の内容・患者への指導及び患者からの相談事項・実施日・記録の作成日 ほか（診療録と重なる項目は別に作らなくてよい）
// - (6)(8) 麻薬管理指導加算：麻薬が投与されている患者に、麻薬の服用の注意事項等を指導した場合。記録に
//   ア 麻薬に係る薬学的管理指導の内容（服薬状況・疼痛緩和の状況等）イ 麻薬に係る患者への指導と相談事項 ウ その他

import { classOf, isNarcotic } from "./drug-class";
import { anyDrugName } from "./master";
import type { DayOffset, OrderEntry, Patient } from "./types";

export const SHIDO_SOURCE = {
  label: "診療報酬の算定方法の一部改正に伴う実施上の留意事項について（令和8年3月5日 保医発0305第6号）別添1 B008 薬剤管理指導料 (1)(2)(5)(6)(8)(9)",
  url: "https://www.mhlw.go.jp/content/12400000/001757385.pdf",
};

export interface ShidoForm {
  kind: "1" | "2";
  /** (1) 医師の同意を得ている. */
  consent: boolean;
  /** 副作用歴 (as heard from the patient and the record). */
  sideEffects: string;
  /** 薬学的管理指導の内容（投与量・投与方法・投与速度・相互作用・重複投薬・配合変化・配合禁忌の確認、効果と副作用の把握）. */
  management: string;
  /** 患者への指導及び患者からの相談事項. */
  teaching: string;
  /** 麻薬管理指導加算: the (8) ア・イ・ウ, when the pharmacist gave it. */
  narcotic?: { status: string; teaching: string; other: string };
}

export const EMPTY_FORM: ShidoForm = { kind: "2", consent: false, sideEffects: "", management: "", teaching: "" };

/** What the chart already has for the record. 生年月日・退院年月日 are not kept in this prototype. */
export interface ShidoFacts {
  name: string;
  sex: string;
  age: number;
  id: string;
  admittedOn: DayOffset;
  allergies: string[];
  /** 投薬・注射歴: the running injection and oral orders, in words. */
  drugs: { code: string; text: string }[];
  /** Running drugs in the「1」groups (B008 (2)), with the group. */
  special: { code: string; group: string }[];
  /** Running 麻薬 (麻薬管理指導加算). */
  narcotics: string[];
}

const running = (entries: OrderEntry[]) => entries.filter((e) => e.status === "有効" && (e.order.type === "injection" || e.order.type === "prescription"));
const codesOf = (e: OrderEntry) => (e.order.type === "injection" ? e.order.items.map((i) => i.drugCode) : e.order.type === "prescription" ? [e.order.drugCode] : []);

export function shidoFacts(p: Pick<Patient, "name" | "sex" | "age" | "id" | "admittedOn" | "allergies">, entries: OrderEntry[]): ShidoFacts {
  const rs = running(entries);
  const codes = [...new Set(rs.flatMap(codesOf))];
  return {
    name: p.name,
    sex: p.sex,
    age: p.age,
    id: p.id,
    admittedOn: p.admittedOn,
    allergies: p.allergies,
    drugs: rs.map((e) => ({ code: codesOf(e)[0], text: `${codesOf(e).map(anyDrugName).join("＋")}（${e.order.type === "prescription" ? `内服・${e.order.category}` : `注射・${e.order.type === "injection" ? e.order.route : ""}`}）` })),
    special: codes.flatMap((c) => (classOf(c)?.b008 ? [{ code: c, group: classOf(c)!.b008!.group }] : [])),
    narcotics: codes.filter(isNarcotic),
  };
}

/** Notes about the「1」/「2」choice and the 麻薬 add-on, from the running drugs (the pharmacist chooses). */
export function kindNotes(form: ShidoForm, f: ShidoFacts): string[] {
  const out: string[] = [];
  const names = f.special.map((s) => `${anyDrugName(s.code)}（${s.group}）`).join("、");
  if (form.kind === "1" && f.special.length === 0) out.push("「1」は対象の薬（抗悪性腫瘍剤・カリウム製剤の注射・糖尿病用剤など）が投薬・注射されている患者に、その薬について指導したときです。いま有効なオーダに対象の薬が見当たりません。");
  if (form.kind === "2" && f.special.length > 0) out.push(`「1」の対象の薬があります：${names}。これらについて指導したなら「1」です。`);
  if (form.narcotic && f.narcotics.length === 0) out.push("麻薬管理指導加算は、麻薬が投与されている患者のときだけです。いま有効な麻薬のオーダがありません。");
  if (!form.narcotic && f.narcotics.length > 0) out.push(`麻薬（${f.narcotics.map(anyDrugName).join("、")}）が投与されています。麻薬の服用について指導したなら、麻薬管理指導加算の欄（ア・イ）も書きます。`);
  return out;
}

/** What is missing before the record can be kept and billed. */
export function shidoProblems(form: ShidoForm): string[] {
  const out: string[] = [];
  if (!form.consent) out.push("医師の同意");
  if (!form.management.trim()) out.push("薬学的管理指導の内容");
  if (!form.teaching.trim()) out.push("患者への指導・相談事項");
  if (form.narcotic) {
    if (!form.narcotic.status.trim()) out.push("麻薬：ア 薬学的管理指導の内容（服薬状況・疼痛緩和の状況など）");
    if (!form.narcotic.teaching.trim()) out.push("麻薬：イ 患者への指導・相談事項");
  }
  return out;
}

/** The record as one note (it goes into the chart, where the doctor reads it: (9) 要点を医師に提供). */
export function shidoText(form: ShidoForm, f: ShidoFacts, fmtDay: (d: DayOffset) => string): string {
  const lines = [
    `区分${form.kind}${form.kind === "1" && f.special.length ? `（${f.special.map((s) => `${anyDrugName(s.code)}：${s.group}`).join("、")}）` : ""}${form.narcotic ? "・麻薬管理指導" : ""}　医師の同意：${form.consent ? "あり" : "なし"}`,
    `入院 ${fmtDay(f.admittedOn)}　投薬・注射：${f.drugs.map((d) => d.text).join("、") || "なし"}`,
    `アレルギー歴：${f.allergies.join("、") || "なし"}　副作用歴：${form.sideEffects.trim() || "聴取した範囲でなし"}`,
    `薬学的管理指導：${form.management.trim()}`,
    `指導・相談：${form.teaching.trim()}`,
  ];
  if (form.narcotic) {
    lines.push(`麻薬 ア：${form.narcotic.status.trim()}`, `麻薬 イ：${form.narcotic.teaching.trim()}`);
    if (form.narcotic.other.trim()) lines.push(`麻薬 ウ：${form.narcotic.other.trim()}`);
  }
  return lines.join("\n");
}
