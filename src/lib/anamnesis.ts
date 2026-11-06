// 入院時の情報収集（アナムネーシス・看護プロファイル）: what the nurse asks at admission — 入院までの経過・
// 既往歴・生活・入院前の ADL・家族と社会的背景・退院後の生活の希望. The items are those the hospitals' specs
// list (沖縄県立南部医療センター A2.5.1／A2.5.4、富山市民病院 3.6・1.6); the form
// itself is the fictional hospital's. Each save is a version (an update needs a reason, 富山市民病院 1.6(4)),
// and what was answered goes on without typing it again (1.6(3)): help needed into the patient profile,
// candidates into 入院時の評価 (the nurse confirms each one there), and lines into the 看護サマリ.

import { ADL_RANKS, DISCHARGE_FACTORS, type AdlRank } from "./admit-eval";
import { CARE_CHOICES, CARE_KEYS, type CareKey, type ProfileInput } from "./profile";
import type { DayOffset } from "./types";

export const ANAMNESIS_SOURCES = [
  { name: "沖縄県立南部医療センター・こども医療センター 基幹システム更新 仕様書 A2.5.1・A2.5.4（生活歴・家族構成・身体状況・既往歴・入院アナムネ）", url: "https://nanbuweb.hosp.pref.okinawa.jp/userfiles/files/07-1_siyousyo_server.pdf" },
  { name: "富山市民病院 システム機能一覧 1.6 看護プロファイル・3.6 患者プロファイル", url: "https://www.tch.toyama.toyama.jp/tmh/02_3_siyousyo_system.pdf" },
];

export interface AnamnesisFields {
  reason: string;
  pastHistory: string;
  surgeries: string;
  transfusion: string;
  meds: string;
  medManager: string;
  living: string;
  home: string;
  occupation: string;
  smoking: string;
  alcohol: string;
  sleep: string;
  nightToilet: string;
  adlRank: "" | AdlRank;
  care: Partial<Record<CareKey, string>>;
  fallHistory: string;
  cognition: string;
  deliriumHistory: string;
  aids: string[];
  family: string;
  keyPerson: string;
  keyContact: string;
  careInsurance: string;
  careManager: string;
  services: string[];
  admissionsYear: string;
  hope: string;
  familyHope: string;
  goHome: string;
}

type TextKey = { [K in keyof AnamnesisFields]: AnamnesisFields[K] extends string ? K : never }[keyof AnamnesisFields];
type ListKey = "aids" | "services";

export type AnamnesisField =
  | { key: TextKey; label: string; type: "text" | "long"; placeholder?: string }
  | { key: TextKey; label: string; type: "one"; options: readonly string[] }
  | { key: ListKey; label: string; type: "many"; options: readonly string[] }
  | { key: "care"; label: string; type: "care" };

const CARE_INSURANCE = ["なし（申請していない）", "申請中", "非該当", "要支援1", "要支援2", "要介護1", "要介護2", "要介護3", "要介護4", "要介護5", "わからない"] as const;

/** The form, in the order it is asked (架空の病院の様式). */
export const ANAMNESIS_SECTIONS: { title: string; fields: AnamnesisField[] }[] = [
  {
    title: "入院までの経過・既往歴",
    fields: [
      { key: "reason", label: "入院の理由・経過（本人・家族の言葉で）", type: "long" },
      { key: "pastHistory", label: "既往歴", type: "long", placeholder: "例：高血圧（内服中）、脳梗塞（5年前、後遺症なし）" },
      { key: "surgeries", label: "手術歴", type: "text" },
      { key: "transfusion", label: "輸血歴", type: "one", options: ["なし", "あり", "わからない"] },
      { key: "meds", label: "入院前の薬（持参薬）", type: "long" },
      { key: "medManager", label: "薬の管理", type: "one", options: ["本人", "家族", "訪問看護・施設"] },
    ],
  },
  {
    title: "生活",
    fields: [
      { key: "living", label: "住まい", type: "one", options: ["独居", "家族と同居", "施設"] },
      { key: "home", label: "家の様子（階段・段差など）", type: "text" },
      { key: "occupation", label: "職業（元の職業）", type: "text" },
      { key: "smoking", label: "たばこ", type: "one", options: ["なし", "過去に吸っていた", "吸っている"] },
      { key: "alcohol", label: "お酒", type: "one", options: ["なし", "機会飲酒", "毎日", "多飲"] },
      { key: "sleep", label: "睡眠", type: "one", options: ["よく眠れる", "眠れないことがある", "睡眠薬を使っている"] },
      { key: "nightToilet", label: "夜間にトイレに起きる", type: "one", options: ["なし", "あり"] },
    ],
  },
  {
    title: "入院前の ADL・身体の状況",
    fields: [
      { key: "adlRank", label: "障害高齢者の日常生活自立度", type: "one", options: ADL_RANKS },
      { key: "care", label: "介助", type: "care" },
      { key: "fallHistory", label: "この1年の転倒", type: "one", options: ["なし", "あり"] },
      { key: "cognition", label: "物忘れ・認知症", type: "one", options: ["問題なし", "物忘れがある", "認知症と言われている"] },
      { key: "deliriumHistory", label: "以前の入院でのせん妄", type: "one", options: ["なし", "あり", "わからない"] },
      { key: "aids", label: "使っているもの", type: "many", options: ["眼鏡", "補聴器", "義歯", "杖", "歩行器", "車椅子", "おむつ"] },
    ],
  },
  {
    title: "家族・社会的背景",
    fields: [
      { key: "family", label: "家族構成", type: "text", placeholder: "例：妻（80歳）と二人暮らし。長女が市内に住む" },
      { key: "keyPerson", label: "キーパーソン（続柄・名前）", type: "text", placeholder: "例：長女" },
      { key: "keyContact", label: "キーパーソンへの連絡", type: "text", placeholder: "例：日中は携帯に（番号は患者基本情報）" },
      { key: "careInsurance", label: "介護保険", type: "one", options: CARE_INSURANCE },
      { key: "careManager", label: "ケアマネジャー・事業所", type: "text" },
      { key: "services", label: "使っているサービス", type: "many", options: ["訪問看護", "訪問介護", "通所介護", "通所リハビリ", "福祉用具", "ショートステイ"] },
      { key: "admissionsYear", label: "この1年の入院（今回を除く）", type: "one", options: ["なし", "1回", "2回以上"] },
    ],
  },
  {
    title: "退院後の生活の希望",
    fields: [
      { key: "hope", label: "本人の希望", type: "long" },
      { key: "familyHope", label: "家族の希望", type: "long" },
      { key: "goHome", label: "退院後に過ごしたい場所", type: "one", options: ["自宅", "施設", "まだ決めていない"] },
    ],
  },
];

export const emptyAnamnesis = (): AnamnesisFields => ({
  reason: "",
  pastHistory: "",
  surgeries: "",
  transfusion: "",
  meds: "",
  medManager: "",
  living: "",
  home: "",
  occupation: "",
  smoking: "",
  alcohol: "",
  sleep: "",
  nightToilet: "",
  adlRank: "",
  care: {},
  fallHistory: "",
  cognition: "",
  deliriumHistory: "",
  aids: [],
  family: "",
  keyPerson: "",
  keyContact: "",
  careInsurance: "",
  careManager: "",
  services: [],
  admissionsYear: "",
  hope: "",
  familyHope: "",
  goHome: "",
});

type At = { day: DayOffset; time: string };

export interface AnamnesisVersion {
  fields: AnamnesisFields;
  by: string;
  at: At;
  /** Why it was updated (none for the first version). */
  reason?: string;
}

export interface AnamnesisRecord extends AnamnesisVersion {
  patientId: string;
  /** Earlier versions, oldest first (the fields above are the version in force). */
  earlier?: AnamnesisVersion[];
}

const show = (v: AnamnesisFields[keyof AnamnesisFields]): string => (Array.isArray(v) ? v.join("・") : typeof v === "object" ? CARE_KEYS.filter((k) => v[k]).map((k) => `${k} ${v[k]}`).join("・") : v) || "（なし）";
const labelOf = (k: keyof AnamnesisFields) => ANAMNESIS_SECTIONS.flatMap((s) => s.fields).find((f) => f.key === k)?.label ?? k;

/** What changed from one version to the next, in words. */
export function anamnesisChanges(before: AnamnesisFields, after: AnamnesisFields): string[] {
  return (Object.keys(after) as (keyof AnamnesisFields)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).map((k) => `${labelOf(k)}：${show(before[k])} → ${show(after[k])}`);
}

/** How many of the questions have an answer. */
export function answered(f: AnamnesisFields): { done: number; all: number } {
  const keys = ANAMNESIS_SECTIONS.flatMap((s) => s.fields.map((x) => x.key));
  const done = keys.filter((k) => {
    const v = f[k];
    return Array.isArray(v) ? v.length > 0 : typeof v === "object" ? Object.values(v).some(Boolean) : !!v.trim();
  }).length;
  return { done, all: keys.length };
}

/** Why it cannot be saved yet (empty when it can). An update needs a reason and a change. */
export function anamnesisProblems(prev: AnamnesisRecord | undefined, next: AnamnesisFields, reason: string): string[] {
  if (answered(next).done === 0) return ["まだ何も聞き取っていません。"];
  if (!prev) return [];
  const out: string[] = [];
  if (anamnesisChanges(prev.fields, next).length === 0) out.push("直したところがまだありません。");
  if (!reason.trim()) out.push("更新の理由を書いてください。");
  return out;
}

/** A new version; the one in force becomes the latest earlier one. */
export function saveAnamnesis(prev: AnamnesisRecord | undefined, patientId: string, fields: AnamnesisFields, by: string, at: At, reason: string): AnamnesisRecord {
  if (!prev) return { patientId, fields, by, at };
  const cur: AnamnesisVersion = { fields: prev.fields, by: prev.by, at: prev.at, ...(prev.reason ? { reason: prev.reason } : {}) };
  return { patientId, fields, by, at, reason: reason.trim(), earlier: [...(prev.earlier ?? []), cur] };
}

export const anamnesisVersions = (r: AnamnesisRecord): AnamnesisVersion[] => [...(r.earlier ?? []), { fields: r.fields, by: r.by, at: r.at, reason: r.reason }];

// ---------- つながる先 ----------

/** Candidates for 入院時の評価, each with the answer it came from. The nurse confirms each one there. */
export interface EvalHints {
  adl?: AdlRank;
  fall: string[];
  delirium: string[];
  discharge: string[];
  /** Item → 「情報収集：…」, shown next to the candidate. */
  why: Record<string, string>;
}

export function evalHints(f: AnamnesisFields): EvalHints {
  const why: Record<string, string> = {};
  const add = (list: string[], item: string, from: string) => {
    if (!list.includes(item)) list.push(item);
    why[item] = why[item] ? `${why[item]}・${from}` : `情報収集：${from}`;
  };
  const fall: string[] = [];
  const delirium: string[] = [];
  const discharge: string[] = [];
  const needs = CARE_KEYS.filter((k) => f.care[k] && f.care[k] !== "自立");
  if (f.fallHistory === "あり") add(fall, "転倒・転落歴", "この1年の転倒 あり");
  if (f.care.移動 && f.care.移動 !== "自立") add(fall, "歩行時に介助が必要", `移動 ${f.care.移動}`);
  if (f.nightToilet === "あり") add(fall, "頻尿や夜間の排泄行動", "夜間にトイレに起きる");
  if (f.cognition === "物忘れがある" || f.cognition === "認知症と言われている") add(fall, "認知機能低下・せん妄など", f.cognition);
  if (f.sleep === "睡眠薬を使っている") add(fall, "向精神薬の使用", "睡眠薬を使っている");
  if (f.cognition === "認知症と言われている") add(delirium, "認知症", "認知症と言われている");
  if (f.alcohol === "多飲") add(delirium, "アルコール多飲", "お酒 多飲");
  if (f.deliriumHistory === "あり") add(delirium, "せん妄の既往", "以前の入院でのせん妄 あり");
  const factor = (key: string, from: string) => {
    if (DISCHARGE_FACTORS.some((x) => x.key === key)) add(discharge, key, from);
  };
  if (f.cognition === "認知症と言われている") factor("ア", "認知症と言われている");
  if (f.careInsurance === "なし（申請していない）" && needs.length) factor("ウ", `介護保険を申請していない・介助あり（${needs.join("・")}）`);
  if (f.care.排泄 && f.care.排泄 !== "自立") factor("ケ", `排泄 ${f.care.排泄}`);
  if (f.living === "独居" && needs.length) factor("コ", `独居・介助あり（${needs.join("・")}）`);
  if (f.admissionsYear === "2回以上") factor("シ", "この1年の入院 2回以上");
  return { ...(f.adlRank ? { adl: f.adlRank } : {}), fall, delirium, discharge, why };
}

/** The help answered here that differs from the patient profile: entered there too (without typing it again). */
export function careToProfile(f: AnamnesisFields, now: Partial<Record<CareKey, { value: string }>>): ProfileInput[] {
  return CARE_KEYS.filter((k) => f.care[k] && CARE_CHOICES[k].includes(f.care[k]!) && now[k]?.value !== f.care[k]).map((k) => ({ kind: "care" as const, key: k, value: f.care[k]!, reason: "入院時の情報収集から" }));
}

/** Lines for the 看護サマリ・連携サマリ. */
export function anamnesisSummary(f: AnamnesisFields): string[] {
  const care = CARE_KEYS.filter((k) => f.care[k]).map((k) => `${k} ${f.care[k]}`);
  return [
    f.pastHistory && `既往歴：${f.pastHistory}`,
    (f.living || f.family) && `住まい：${[f.living, f.family].filter(Boolean).join("。")}`,
    f.home && `家の様子：${f.home}`,
    f.keyPerson && `キーパーソン：${f.keyPerson}${f.keyContact ? `（${f.keyContact}）` : ""}`,
    (f.careInsurance || f.services.length) && `介護保険：${f.careInsurance || "記載なし"}${f.careManager ? `（${f.careManager}）` : ""}${f.services.length ? `。サービス：${f.services.join("・")}` : ""}`,
    (f.adlRank || care.length) && `入院前の ADL：${[f.adlRank && `自立度 ${f.adlRank}`, ...care].filter(Boolean).join("・")}`,
    f.aids.length > 0 && `使っているもの：${f.aids.join("・")}`,
    f.medManager && `薬の管理：${f.medManager}`,
    (f.hope || f.familyHope || f.goHome) && `退院後の希望：${[f.hope && `本人「${f.hope}」`, f.familyHope && `家族「${f.familyHope}」`, f.goHome && `過ごしたい場所 ${f.goHome}`].filter(Boolean).join("、")}`,
  ].filter((x): x is string => !!x);
}
