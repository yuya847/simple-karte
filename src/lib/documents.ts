// 書類作成: the fictional hospital's forms — 入院診療計画書, 退院証明書, 診断書, 退院療養計画書. What the
// chart already says (name, ward, diagnoses, dates, drugs) is filled in by code; what needs judgement
// is written by the doctor. Nothing is written by AI.

export type DocKind = "入院診療計画書" | "退院証明書" | "診断書" | "退院療養計画書";
export const DOC_KINDS: DocKind[] = ["入院診療計画書", "退院証明書", "診断書", "退院療養計画書"];

export interface DocField {
  key: string;
  label: string;
  /** Filled from the chart (shown, not typed). */
  auto?: boolean;
  long?: boolean;
  /** Choices to pick from (the doctor picks; nothing preselected). */
  choices?: string[];
  optional?: boolean;
}

export const DOC_DEFS: Record<DocKind, { purpose: string; fields: DocField[] }> = {
  入院診療計画書: {
    purpose: "入院した日から7日以内に、患者と家族に説明して渡す計画（架空の病院の様式）",
    fields: [
      { key: "ward", label: "病棟（病室）", auto: true },
      { key: "attending", label: "主治医", auto: true },
      { key: "staff", label: "主治医以外の担当者", auto: true },
      { key: "diagnosis", label: "病名", auto: true },
      { key: "symptoms", label: "症状", long: true },
      { key: "treatment", label: "治療計画", long: true },
      { key: "tests", label: "検査の内容と日程", long: true },
      { key: "surgery", label: "手術の内容と日程", optional: true },
      { key: "days", label: "推定される入院期間（日）" },
      { key: "nutrition", label: "特別な栄養管理の必要性", choices: ["有", "無"] },
      { key: "other", label: "その他（看護・リハビリなどの計画）", long: true, optional: true },
      { key: "explainedTo", label: "説明した相手（本人・家族）" },
    ],
  },
  退院証明書: {
    purpose: "ほかの病院に入院するときに、入院期間を通算するために渡す（架空の病院の様式）",
    fields: [
      { key: "name", label: "氏名", auto: true },
      { key: "admitted", label: "入院日", auto: true },
      { key: "discharge", label: "退院日", auto: true },
      { key: "stay", label: "入院日数", auto: true },
      { key: "diagnosis", label: "傷病名", auto: true },
      { key: "fee", label: "算定した入院料の種別", auto: true },
      { key: "outcome", label: "退院時の状況", choices: ["治癒", "軽快", "不変", "転院", "その他"] },
      { key: "note", label: "備考", optional: true },
    ],
  },
  診断書: {
    purpose: "勤務先や保険などに出す一般的な診断書（架空の病院の様式）",
    fields: [
      { key: "name", label: "氏名", auto: true },
      { key: "diagnosis", label: "病名", auto: true },
      { key: "admitted", label: "入院日", auto: true },
      { key: "onset", label: "発症日・初診日" },
      { key: "course", label: "経過と現在の状態", long: true },
      { key: "remark", label: "付記（安静・就労の目安など）", long: true, optional: true },
      { key: "use", label: "使いみち（提出先）" },
    ],
  },
  退院療養計画書: {
    purpose: "退院のときに、家での療養の注意を本人と家族に渡す（架空の病院の様式）",
    fields: [
      { key: "name", label: "氏名", auto: true },
      { key: "discharge", label: "退院日", auto: true },
      { key: "drugs", label: "退院後の内服", auto: true },
      { key: "care", label: "療養上の注意（食事・入浴・運動など）", long: true },
      { key: "services", label: "必要な保健・医療・福祉のサービス", long: true, optional: true },
      { key: "next", label: "次の受診" },
      { key: "contact", label: "具合が悪いときの連絡先" },
    ],
  },
};

export interface DocRecord {
  id: string;
  patientId: string;
  kind: DocKind;
  values: Record<string, string>;
  by: string;
  at: { day: number; time: string };
}

/** The fields that must still be written. */
export function docMissing(kind: DocKind, values: Record<string, string>): string[] {
  return DOC_DEFS[kind].fields.filter((f) => !f.auto && !f.optional && !(values[f.key] ?? "").trim()).map((f) => f.label);
}

/** 入院日数 counted by code (the admission day is day 1). */
export const stayDays = (admittedOn: number, dischargeDay: number) => dischargeDay - admittedOn + 1;
