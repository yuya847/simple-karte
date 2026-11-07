// 入院時の情報（患者さんの入力）: the questions of the nurse's 入院時の情報収集 (anamnesis.ts) that the patient
// can answer, in plain words. No new item: each one is an item of the 情報収集 form (the answers and the
// choices are its own values; only the words shown to the patient differ), plus アレルギー, which the nurse
// registers in the patient profile. What the patient sends is "患者さんの入力" until a nurse confirms it.

import { ANAMNESIS_SECTIONS, type AnamnesisField, type AnamnesisFields } from "../anamnesis";

export type IntakeKey = Exclude<AnamnesisField["key"], "care"> | "allergy";
export type IntakeAnswers = Partial<Record<IntakeKey, string | string[]>>;

export interface IntakeItem {
  key: IntakeKey;
  /** The words for the patient. */
  label: string;
  /** The words of the 情報収集 form (for the nurse). */
  staff: string;
  type: "text" | "long" | "one" | "many";
  /** The form's values, each with the words for the patient. */
  options?: { value: string; label: string }[];
}

/** The patient's words for the form's choices (a choice not listed here is not offered to the patient). */
const PLAIN: Partial<Record<IntakeKey, Record<string, string>>> = {
  transfusion: { なし: "ない", あり: "ある", わからない: "わからない" },
  medManager: { 本人: "自分", 家族: "家族", "訪問看護・施設": "訪問看護・施設" },
  living: { 独居: "ひとり暮らし", 家族と同居: "家族と住んでいる", 施設: "施設" },
  smoking: { なし: "吸わない", 過去に吸っていた: "以前吸っていた", 吸っている: "吸っている" },
  alcohol: { なし: "飲まない", 機会飲酒: "ときどき", 毎日: "毎日" },
  sleep: { よく眠れる: "よく眠れる", 眠れないことがある: "眠れないことがある", 睡眠薬を使っている: "眠る薬を使っている" },
  nightToilet: { なし: "起きない", あり: "起きる" },
  fallHistory: { なし: "ない", あり: "ある" },
  aids: { 眼鏡: "めがね", 補聴器: "補聴器", 義歯: "入れ歯", 杖: "杖", 歩行器: "歩行器", 車椅子: "車いす", おむつ: "おむつ" },
  careInsurance: { "なし（申請していない）": "申請していない", 申請中: "申請中", 非該当: "非該当", 要支援1: "要支援1", 要支援2: "要支援2", 要介護1: "要介護1", 要介護2: "要介護2", 要介護3: "要介護3", 要介護4: "要介護4", 要介護5: "要介護5", わからない: "わからない" },
  services: { 訪問看護: "訪問看護", 訪問介護: "訪問介護（ヘルパー）", 通所介護: "デイサービス", 通所リハビリ: "デイケア", 福祉用具: "福祉用具", ショートステイ: "ショートステイ" },
  admissionsYear: { なし: "ない", "1回": "1回", "2回以上": "2回以上" },
  goHome: { 自宅: "自宅", 施設: "施設", まだ決めていない: "まだ決めていない" },
};

const SECTIONS: { title: string; items: [IntakeKey, string][] }[] = [
  {
    title: "入院のいきさつ・病気・お薬",
    items: [
      ["reason", "入院することになったいきさつ"],
      ["pastHistory", "これまでにかかった病気"],
      ["surgeries", "これまでに受けた手術"],
      ["transfusion", "輸血を受けたこと"],
      ["meds", "ふだん飲んでいる薬"],
      ["medManager", "薬を管理している人"],
      ["allergy", "アレルギー（薬・食べ物など）"],
    ],
  },
  {
    title: "ふだんの暮らし",
    items: [
      ["living", "住まい"],
      ["home", "家の様子（階段・段差など）"],
      ["occupation", "お仕事（以前のお仕事）"],
      ["smoking", "たばこ"],
      ["alcohol", "お酒"],
      ["sleep", "眠り"],
      ["nightToilet", "夜中にトイレに起きる"],
      ["fallHistory", "この1年で転んだこと"],
      ["aids", "使っているもの"],
    ],
  },
  {
    title: "ご家族・連絡",
    items: [
      ["family", "ご家族（一緒に住んでいる人など）"],
      ["keyPerson", "何かあったときに連絡する人（続柄・お名前）"],
      ["keyContact", "その方への連絡のしかた"],
    ],
  },
  {
    title: "介護保険・サービス",
    items: [
      ["careInsurance", "介護保険"],
      ["careManager", "ケアマネジャー・事業所"],
      ["services", "使っているサービス"],
      ["admissionsYear", "この1年の入院（今回のほか）"],
    ],
  },
  {
    title: "退院したあと",
    items: [
      ["hope", "退院したあと、どう過ごしたいか"],
      ["familyHope", "ご家族の希望"],
      ["goHome", "退院したあと過ごしたい場所"],
    ],
  },
];

const FORM = ANAMNESIS_SECTIONS.flatMap((s) => s.fields);
const ALLERGY_STAFF = "アレルギー（患者プロファイル）";

function itemOf(key: IntakeKey, label: string): IntakeItem {
  if (key === "allergy") return { key, label, staff: ALLERGY_STAFF, type: "text" };
  const f = FORM.find((x) => x.key === key);
  if (!f || f.type === "care") throw new Error(`情報収集にない項目：${key}`);
  if (f.type === "one" || f.type === "many") {
    const plain = PLAIN[key] ?? {};
    return { key, label, staff: f.label, type: f.type, options: f.options.filter((o) => o in plain).map((o) => ({ value: o, label: plain[o] })) };
  }
  return { key, label, staff: f.label, type: f.type };
}

export const INTAKE_SECTIONS: { title: string; items: IntakeItem[] }[] = SECTIONS.map((s) => ({ title: s.title, items: s.items.map(([k, l]) => itemOf(k, l)) }));
export const INTAKE_ITEMS: IntakeItem[] = INTAKE_SECTIONS.flatMap((s) => s.items);

const MAX = { text: 100, long: 600 } as const;

/** Only the questions above, each answer in the form's shape (a choice must be one of its values); null when it is not answers at all. */
export function cleanIntake(raw: unknown): IntakeAnswers | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: IntakeAnswers = {};
  for (const item of INTAKE_ITEMS) {
    const v = (raw as Record<string, unknown>)[item.key];
    if (item.type === "many") {
      if (!Array.isArray(v)) continue;
      const picked = [...new Set(v.filter((x): x is string => typeof x === "string" && !!item.options?.some((o) => o.value === x)))];
      if (picked.length) out[item.key] = picked;
    } else if (typeof v === "string") {
      if (item.type === "one") {
        if (item.options?.some((o) => o.value === v)) out[item.key] = v;
      } else {
        const t = v.replace(/\r\n?/g, "\n").trim().slice(0, MAX[item.type]);
        if (t) out[item.key] = t;
      }
    }
  }
  return out;
}

export const answeredCount = (a: IntakeAnswers) => INTAKE_ITEMS.filter((i) => hasAnswer(a[i.key])).length;
const hasAnswer = (v: string | string[] | undefined) => (Array.isArray(v) ? v.length > 0 : !!v?.trim());

/** The 情報収集's answers with the patient's put in (only what the patient answered; アレルギー is not one of them). */
export function intakeToFields(base: AnamnesisFields, a: IntakeAnswers): AnamnesisFields {
  const next: AnamnesisFields = { ...base, care: { ...base.care }, aids: [...base.aids], services: [...base.services] };
  for (const item of INTAKE_ITEMS) {
    const v = a[item.key];
    if (item.key === "allergy" || !hasAnswer(v)) continue;
    (next as unknown as Record<string, unknown>)[item.key] = Array.isArray(v) ? [...v] : v;
  }
  return next;
}

const shown = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join("・") : (v ?? ""));

/** For the nurse: each answered question in the form's words, with what the 情報収集 says now. */
export function intakeRows(a: IntakeAnswers, now?: AnamnesisFields): { item: IntakeItem; answer: string; now: string }[] {
  return INTAKE_ITEMS.filter((i) => hasAnswer(a[i.key])).map((item) => ({
    item,
    answer: shown(a[item.key]),
    now: item.key === "allergy" || !now ? "" : shown(now[item.key as keyof AnamnesisFields] as string | string[]),
  }));
}
