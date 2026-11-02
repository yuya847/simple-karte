// Emergency department (救急外来) patients — all FICTIONAL. Arrival times are minutes before
// "now" so the board always looks like today. Triage levels (JTAS 1–5) are what a triage
// nurse entered; the app never assigns them.

import type { Sex } from "./types";

export type ErStatus = "診察待ち" | "診察中" | "入院依頼" | "帰宅" | "入院済";
export type Arrival = "救急車" | "独歩" | "紹介";

export interface ErPatient {
  id: string;
  name: string;
  kana: string;
  sex: Sex;
  age: number;
  arrival: Arrival;
  /** Arrival as an absolute minute (day offset × 1440 + minutes). */
  arrivedAbs: number;
  complaint: string;
  /** JTAS level entered by the triage nurse (1 = 蘇生 … 5 = 非緊急). */
  jtas: 1 | 2 | 3 | 4 | 5;
  status: ErStatus;
  vitals?: { bt?: number; hr?: number; sbp?: number; dbp?: number; rr?: number; spo2?: number; o2?: string };
  heightCm?: number;
  weightKg?: number;
  allergies: string[];
  note?: string;
  /** Set once admitted: the ward patient id. */
  admittedAs?: string;
}

export const JTAS_LABEL: Record<ErPatient["jtas"], string> = {
  1: "蘇生",
  2: "緊急",
  3: "準緊急",
  4: "低緊急",
  5: "非緊急",
};

/** Fictional ED board relative to the current time (minutes since midnight). */
export function initialErPatients(nowAbs: number): ErPatient[] {
  const ago = (min: number) => nowAbs - min;
  return [
    {
      id: "er-1",
      name: "宮本 タケ",
      kana: "ミヤモト タケ",
      sex: "女",
      age: 82,
      arrival: "救急車",
      arrivedAbs: ago(95),
      complaint: "発熱・ぐったりしている（施設から）",
      jtas: 2,
      status: "入院依頼",
      vitals: { bt: 38.8, hr: 112, sbp: 98, dbp: 54, rr: 24, spo2: 94, o2: "室内気" },
      heightCm: 148,
      weightKg: 42,
      allergies: [],
      note: "総合診療科に入院依頼。尿の混濁あり（救急外来の申し送り）。",
    },
    {
      id: "er-2",
      name: "片山 健太",
      kana: "カタヤマ ケンタ",
      sex: "男",
      age: 45,
      arrival: "独歩",
      arrivedAbs: ago(150),
      complaint: "腹痛",
      jtas: 3,
      status: "帰宅",
      vitals: { bt: 36.9, hr: 84, sbp: 132, dbp: 82, rr: 16, spo2: 99, o2: "室内気" },
      allergies: [],
    },
    {
      id: "er-3",
      name: "永井 茂",
      kana: "ナガイ シゲル",
      sex: "男",
      age: 76,
      arrival: "救急車",
      arrivedAbs: ago(40),
      complaint: "息苦しい",
      jtas: 2,
      status: "診察中",
      vitals: { bt: 37.2, hr: 104, sbp: 168, dbp: 96, rr: 28, spo2: 89, o2: "室内気" },
      heightCm: 166,
      weightKg: 71,
      allergies: ["ペニシリン系（皮疹）"],
    },
    {
      id: "er-4",
      name: "沢田 キミ",
      kana: "サワダ キミ",
      sex: "女",
      age: 88,
      arrival: "紹介",
      arrivedAbs: ago(12),
      complaint: "食事が取れない（かかりつけ医から紹介）",
      jtas: 4,
      status: "診察待ち",
      vitals: { bt: 36.6, hr: 78, sbp: 112, dbp: 64, rr: 18, spo2: 96, o2: "室内気" },
      allergies: [],
    },
  ];
}
