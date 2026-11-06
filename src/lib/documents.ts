import { ADDITIONAL_DOC_DEFS } from "./document-forms";
import { NUTRITION_PLAN_FIELDS } from "./nutrition-plan";
// 書類作成: the fictional hospital's forms — 入院診療計画書, 退院証明書, 診断書, 退院療養計画書. What the
// chart already says (name, ward, diagnoses, dates, drugs) is filled in by code; what needs judgement
// is written by the doctor. Nothing is written by AI.

export type DocKind = keyof typeof ADDITIONAL_DOC_DEFS | "栄養管理計画書" | "入院診療計画書" | "退院証明書" | "診断書" | "退院療養計画書" | "退院支援計画書" | "褥瘡対策に関する診療計画書";
export const DOC_KINDS: DocKind[] = [...Object.keys(ADDITIONAL_DOC_DEFS) as (keyof typeof ADDITIONAL_DOC_DEFS)[], "栄養管理計画書","入院診療計画書", "退院証明書", "診断書", "退院療養計画書", "退院支援計画書", "褥瘡対策に関する診療計画書"];

/** What a 退院支援計画 must contain (A246 入退院支援加算 (4) ア〜キ) and that it is explained and handed over in writing ((6)). */
export const DISCHARGE_PLAN_SOURCE = {
  label: "厚生労働省保険局医療課長通知 保医発0305第4号（令和6年3月5日）別添1 A246 入退院支援加算 (4)(6)",
  url: "https://www.mhlw.go.jp/content/12404000/001293312.pdf",
};

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
  ...ADDITIONAL_DOC_DEFS,
  栄養管理計画書: {purpose:"栄養状態と管理の計画を記録して説明する書類（模擬）",fields:NUTRITION_PLAN_FIELDS},
  入院診療計画書: {
    purpose: "入院した日から7日以内に、患者と家族に説明して渡す計画",
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
    purpose: "ほかの病院に入院するときに、入院期間を通算するために渡す",
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
    purpose: "勤務先や保険などに出す一般的な診断書",
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
    purpose: "退院のときに、家での療養の注意を本人と家族に渡す",
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
  退院支援計画書: {
    purpose: "退院困難な要因のある患者に、退院支援の計画を文書で説明して渡す",
    fields: [
      { key: "name", label: "患者氏名", auto: true },
      { key: "admitted", label: "入院日", auto: true },
      { key: "startedAt", label: "退院支援計画着手日", auto: true },
      { key: "madeAt", label: "退院支援計画作成日", auto: true },
      { key: "factors", label: "退院困難な要因", auto: true },
      { key: "consultant", label: "退院に関する患者以外の相談者（続柄）" },
      { key: "planners", label: "退院支援計画を行う者（病棟責任者・病棟専任の入退院支援職員・入退院支援部門の担当者）", long: true },
      { key: "problems", label: "退院に係る問題点・課題等", long: true },
      { key: "goal", label: "退院へ向けた目標・支援期間・支援の概要", long: true },
      { key: "destination", label: "予想される退院先" },
      { key: "services", label: "退院後に利用が予測される福祉サービスと担当者名", long: true, optional: true },
      { key: "inpatient", label: "入院中に必要な療養支援（リハビリ・栄養管理・口腔管理など）と多職種チームとの役割分担", long: true },
      { key: "explainedTo", label: "説明して渡した相手（本人・家族）" },
    ],
  },
  // 項目は通知 別添6 別紙3（pressure-course.ts の PRESSURE_SOURCES）。様式の形は架空の病院のもの。
  褥瘡対策に関する診療計画書: {
    purpose: "褥瘡に関する危険因子のある患者と褥瘡のある患者に、褥瘡対策チームの専任の医師と専任の看護職員が作る診療計画",
    fields: [
      { key: "ward", label: "病棟（病室）", auto: true },
      { key: "ulcerNow", label: "褥瘡の有無（現在）", auto: true },
      { key: "foundOn", label: "褥瘡発生日", auto: true },
      { key: "ulcerPast", label: "褥瘡の有無（過去）" },
      { key: "risk", label: "危険因子の評価（日常生活自立度・危険因子）", auto: true, long: true },
      { key: "design", label: "褥瘡の状態の評価（DESIGN-R®2020）", auto: true, long: true },
      { key: "bed", label: "圧迫・ズレ力の排除（ベッド上：体位変換、体圧分散寝具、頭部挙上方法など）", long: true },
      { key: "chair", label: "圧迫・ズレ力の排除（イス上：車椅子姿勢保持など）", long: true },
      { key: "skin", label: "スキンケア", long: true },
      { key: "nutritionCare", label: "栄養状態改善", long: true },
      { key: "rehab", label: "リハビリテーション", long: true },
      { key: "pharm", label: "薬学的管理に関する事項（褥瘡の発症リスクに影響を与える可能性がある薬剤の使用、薬剤滞留の問題）", long: true, optional: true },
      { key: "nutritionMgmt", label: "栄養管理に関する事項（栄養管理計画書で対応するときはその旨）", long: true, optional: true },
      { key: "doctor", label: "記入医師名" },
      { key: "nurse", label: "記入看護師名" },
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
