// 患者プロファイル: allergies, infections, contraindications (禁忌), blood type, height and weight, and
// help needed (移動・食事・排泄・入浴), registered and changed with who and when. Nothing is overwritten:
// each change is kept, so the history shows what was there before, who changed it and why. The chart
// (patient band, ward map, labels, meals) and the order checks read the profile as it stands.
// Items as in 富山市民病院 システム機能一覧 3.6（身体的情報・アレルギー情報をオーダ時のアレルギーチェックへ、
// 身長体重の上限下限と前回との差）, 沖縄県立南部医療センター 仕様書 A2.5（感染・禁忌・身体状況・移動・食事の
// 登録と変更履歴）.

import { ORAL_DRUGS } from "./master";
import type { Role } from "./roles";
import type { DayOffset, Patient } from "./types";

export const PROFILE_SOURCES = [
  { name: "富山市民病院 システム機能一覧 3.6 患者プロファイル", url: "https://www.tch.toyama.toyama.jp/tmh/02_3_siyousyo_system.pdf" },
  { name: "沖縄県立南部医療センター・こども医療センター 基幹システム更新 仕様書 A2.5 患者プロファイル", url: "https://nanbuweb.hosp.pref.okinawa.jp/userfiles/files/07-1_siyousyo_server.pdf" },
];

export type ListKind = "allergy" | "infection" | "contra";
export const LIST_LABEL: Record<ListKind, string> = { allergy: "アレルギー", infection: "感染症", contra: "禁忌" };

export const CARE_KEYS = ["移動", "食事", "排泄", "入浴"] as const;
export type CareKey = (typeof CARE_KEYS)[number];
/** The choices for each kind of help (架空の病院の取り決め). */
export const CARE_CHOICES: Record<CareKey, string[]> = {
  移動: ["自立", "杖", "歩行器", "車椅子", "ストレッチャー"],
  食事: ["自立", "一部介助", "全介助", "経管栄養"],
  排泄: ["自立", "一部介助", "全介助", "おむつ"],
  入浴: ["自立", "一部介助", "全介助", "清拭のみ"],
};

type At = { day: DayOffset; time: string };
interface ChangeBase {
  id: string;
  patientId: string;
  by: string;
  role: Role;
  at: At;
  /** Why (required to take an item away or to change a registered blood type). */
  reason?: string;
}

export type ProfileChange = ChangeBase &
  (
    | { kind: ListKind; op: "追加" | "削除"; text: string }
    | { kind: "care"; key: CareKey; value: string }
    | { kind: "body"; heightCm: number; weightKg: number }
    | { kind: "blood"; blood: NonNullable<Patient["blood"]> }
  );

/** What a person enters; who and when are added by code. */
export type ProfileInput = ProfileChange extends infer C ? (C extends ProfileChange ? Omit<C, "id" | "patientId" | "by" | "role" | "at"> : never) : never;

/** Each kind of change and the action (roles.ts) that allows it. */
export const PROFILE_ACTION = {
  allergy: "profile.allergy",
  infection: "profile.infection",
  contra: "profile.contra",
  care: "profile.care",
  body: "profile.body",
  blood: "profile.blood",
} as const;

const listOf = (p: Patient, k: ListKind) => (k === "allergy" ? p.allergies : k === "infection" ? p.infections : (p.contraindications ?? []));

/** The patient as the profile stands: the lists, blood type, height and weight; help needed is shown with the cautions. */
export function applyProfile(p: Patient, log: ProfileChange[]): Patient {
  const mine = log.filter((c) => c.patientId === p.id);
  if (!mine.length) return p;
  const lists: Record<ListKind, string[]> = { allergy: [...p.allergies], infection: [...p.infections], contra: [...(p.contraindications ?? [])] };
  let { heightCm, weightKg, blood } = p;
  const care: Partial<Record<CareKey, string>> = {};
  for (const c of mine) {
    if (c.kind === "care") care[c.key] = c.value;
    else if (c.kind === "body") ({ heightCm, weightKg } = c);
    else if (c.kind === "blood") blood = c.blood;
    else if (c.op === "追加") lists[c.kind] = lists[c.kind].includes(c.text) ? lists[c.kind] : [...lists[c.kind], c.text];
    else lists[c.kind] = lists[c.kind].filter((x) => x !== c.text);
  }
  const helps = CARE_KEYS.filter((k) => care[k] && care[k] !== "自立").map((k) => `${k}：${care[k]}`);
  return { ...p, allergies: lists.allergy, infections: lists.infection, contraindications: lists.contra, heightCm, weightKg, blood, cautions: [...p.cautions, ...helps] };
}

export interface ProfileItem {
  text: string;
  /** Who registered it and when; null for what the chart had before (架空の記録). */
  since: { by: string; at: At } | null;
}

/** The items of a list now, each with who registered it. */
export function listItems(p: Patient, log: ProfileChange[], kind: ListKind): ProfileItem[] {
  let items: ProfileItem[] = listOf(p, kind).map((text) => ({ text, since: null }));
  for (const c of log) {
    if (c.patientId !== p.id || c.kind !== kind) continue;
    if (c.op === "追加" && !items.some((i) => i.text === c.text)) items = [...items, { text: c.text, since: { by: c.by, at: c.at } }];
    if (c.op === "削除") items = items.filter((i) => i.text !== c.text);
  }
  return items;
}

/** The help registered now for each kind (none until someone registers it). */
export function careNow(log: ProfileChange[], patientId: string): Partial<Record<CareKey, { value: string; by: string; at: At }>> {
  const out: Partial<Record<CareKey, { value: string; by: string; at: At }>> = {};
  for (const c of log) if (c.patientId === patientId && c.kind === "care") out[c.key] = { value: c.value, by: c.by, at: c.at };
  return out;
}

/** The latest change of height/weight or blood type (who and when), if any. */
export function lastChange<K extends "body" | "blood">(log: ProfileChange[], patientId: string, kind: K): Extract<ProfileChange, { kind: K }> | undefined {
  return log.filter((c): c is Extract<ProfileChange, { kind: K }> => c.patientId === patientId && c.kind === kind).at(-1);
}

export const bloodText = (b: Patient["blood"]) => (b ? `${b.abo}型 Rh(${b.rh === "+" ? "+" : "−"})（確認した検体 ${b.checks}回${b.antibody ? `・不規則抗体 ${b.antibody}` : ""}）` : "未登録");

/** Every change, newest first, in words with what it was before. */
export function profileHistory(p: Patient, log: ProfileChange[]): { change: ProfileChange; text: string }[] {
  let h = p.heightCm;
  let w = p.weightKg;
  let blood = p.blood;
  const care: Partial<Record<CareKey, string>> = {};
  const out: { change: ProfileChange; text: string }[] = [];
  for (const c of log) {
    if (c.patientId !== p.id) continue;
    let text: string;
    if (c.kind === "care") {
      text = `介助（${c.key}）：${care[c.key] ?? "未登録"} → ${c.value}`;
      care[c.key] = c.value;
    } else if (c.kind === "body") {
      text = `身長・体重：${h}cm・${w}kg → ${c.heightCm}cm・${c.weightKg}kg`;
      h = c.heightCm;
      w = c.weightKg;
    } else if (c.kind === "blood") {
      text = `血液型：${bloodText(blood)} → ${bloodText(c.blood)}`;
      blood = c.blood;
    } else text = `${LIST_LABEL[c.kind]}を${c.op}：${c.text}`;
    out.push({ change: c, text: c.reason ? `${text}（理由：${c.reason}）` : text });
  }
  return out.reverse();
}

// ---------- 入力の確かめ ----------

export const ALLERGY_TYPES = ["薬", "食物", "その他"] as const;
export type AllergyType = (typeof ALLERGY_TYPES)[number];

/** 「NSAIDs（喘息発作）」, 「食物：卵（蕁麻疹）」: the written form the chart and the checks read. */
export function allergyText(type: AllergyType, what: string, reaction: string): string {
  const w = what.trim();
  const r = reaction.trim();
  const body = r ? `${w}（${r}）` : w;
  return type === "食物" ? `食物：${body}` : body;
}

/** Why an item cannot be added (empty when it can). */
export function itemProblems(kind: ListKind, text: string, current: string[]): string[] {
  if (!text.trim() || /^食物：\s*$/.test(text)) return [`${LIST_LABEL[kind]}の内容を入れてください。`];
  if (current.includes(text.trim())) return ["すでに登録されています。"];
  return [];
}

/** Words the existing order checks look for in the allergies (lib/rx.ts 内服, lib/exams.ts 造影). */
export const CHECK_WORDS: { word: string; where: string }[] = [
  ...[...new Set(ORAL_DRUGS.flatMap((d) => d.classes ?? []))].map((word) => ({ word, where: "内服のオーダ" })),
  { word: "造影剤", where: "造影の画像検査" },
  { word: "喘息", where: "造影の画像検査" },
];

/** Which order checks an allergy or contraindication will be found by. */
export function checkedBy(text: string): string[] {
  return [...new Set(CHECK_WORDS.filter((c) => text.includes(c.word)).map((c) => `${c.where}（「${c.word}」）`))];
}

/** What the order checks read: the allergies, and the contraindications marked 「禁忌：」. */
export const checkList = (p: Pick<Patient, "allergies" | "contraindications">) => [...p.allergies, ...(p.contraindications ?? []).map((c) => `禁忌：${c}`)];

/** 身長・体重の上限・下限. */
export const BODY_LIMITS = { heightCm: [30, 230], weightKg: [1, 300] } as const;
/** A change from the last value this large asks the person to confirm (架空の病院の取り決め). */
export const BODY_JUMP = { heightCm: 5, weightRatio: 0.1 } as const;

/** Values that cannot be (stop) and big differences from the last value (confirm). */
export function bodyProblems(h: number, w: number, prev: { heightCm: number; weightKg: number }): { stop: string[]; confirm: string[] } {
  const stop: string[] = [];
  const confirm: string[] = [];
  if (!Number.isFinite(h) || h < BODY_LIMITS.heightCm[0] || h > BODY_LIMITS.heightCm[1]) stop.push(`身長は ${BODY_LIMITS.heightCm[0]}〜${BODY_LIMITS.heightCm[1]}cm の範囲で入れてください。`);
  if (!Number.isFinite(w) || w < BODY_LIMITS.weightKg[0] || w > BODY_LIMITS.weightKg[1]) stop.push(`体重は ${BODY_LIMITS.weightKg[0]}〜${BODY_LIMITS.weightKg[1]}kg の範囲で入れてください。`);
  if (stop.length) return { stop, confirm };
  if (prev.heightCm && Math.abs(h - prev.heightCm) > BODY_JUMP.heightCm) confirm.push(`身長が前回（${prev.heightCm}cm）から ${Math.abs(h - prev.heightCm).toFixed(1)}cm 違います。`);
  if (prev.weightKg && Math.abs(w - prev.weightKg) / prev.weightKg > BODY_JUMP.weightRatio) confirm.push(`体重が前回（${prev.weightKg}kg）から ${Math.round((Math.abs(w - prev.weightKg) / prev.weightKg) * 100)}% 違います。`);
  return { stop, confirm };
}

/** A registered blood type changed to another type needs a reason (it is used for 輸血). */
export const bloodChanged = (before: Patient["blood"], next: NonNullable<Patient["blood"]>) => !!before && (before.abo !== next.abo || before.rh !== next.rh);
