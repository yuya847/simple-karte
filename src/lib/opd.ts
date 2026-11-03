// 外来 of the FICTIONAL hospital: today's outpatients (予約と予約外), where each one is in the visit,
// and their past visits. All people are fictional.

import type { Sex } from "./types";

export type OpdStatus = "予約" | "受付済" | "診察待ち" | "診察中" | "会計待ち" | "終了";
export const OPD_STATUSES: OpdStatus[] = ["予約", "受付済", "診察待ち", "診察中", "会計待ち", "終了"];

export interface OpdPatient {
  id: string;
  name: string;
  kana: string;
  sex: Sex;
  age: number;
  ageMonths?: number;
  department: string;
  doctor: string;
  /** 予約の時刻, or null for a walk-in (予約外). */
  slot: string | null;
  /** 受付の時刻. */
  arrived?: string;
  status: OpdStatus;
  kind: "初診" | "再診";
  /** Why the patient comes today (主訴 or the follow-up). */
  reason: string;
  allergies: string[];
  heightCm?: number;
  weightKg?: number;
  /** 病名 being followed. */
  problems: string[];
  /** 処方中の薬 (as written on the last prescription). */
  meds: string[];
  /** Today's measurements at reception (血圧計・体温計). */
  vitals?: { bt?: number; hr?: number; sbp?: number; dbp?: number; spo2?: number };
  /** Past visits, newest first (day offset and a short note). */
  visits: { day: number; text: string }[];
  /** 紹介状 brought by a new patient. */
  referral?: string;
}

const DOCTOR = "山本（専攻医）";

/** Today's outpatient list of 総合診療科 (fictional). Times are fixed clock times of the day. */
export const OPD_PATIENTS: OpdPatient[] = [
  {
    id: "opd-1",
    name: "石田 正男",
    kana: "イシダ マサオ",
    sex: "男",
    age: 78,
    department: "総合診療科",
    doctor: DOCTOR,
    slot: "09:00",
    arrived: "08:42",
    status: "診察中",
    kind: "再診",
    reason: "定期受診（心不全）。1週間で体重が3kg増え、夜に息苦しい",
    allergies: [],
    heightCm: 164,
    weightKg: 63.5,
    problems: ["慢性心不全", "高血圧症", "2型糖尿病"],
    meds: ["フロセミド錠20mg 1回1錠 1日1回 朝食後", "エナラプリル錠5mg 1回1錠 1日1回 朝食後", "メトホルミン錠250mg 1回1錠 1日2回 朝夕食後"],
    vitals: { bt: 36.5, hr: 98, sbp: 156, dbp: 88, spo2: 92 },
    visits: [
      { day: -28, text: "体重60.5kg、下腿浮腫なし。処方継続。" },
      { day: -56, text: "HbA1c 7.1%。体重60.8kg。処方継続。" },
    ],
  },
  {
    id: "opd-2",
    name: "原田 恵子",
    kana: "ハラダ ケイコ",
    sex: "女",
    age: 54,
    department: "総合診療科",
    doctor: DOCTOR,
    slot: "09:15",
    arrived: "09:05",
    status: "診察待ち",
    kind: "再診",
    reason: "定期受診（高血圧・脂質異常症）",
    allergies: ["造影剤（じんましん）"],
    problems: ["高血圧症", "脂質異常症"],
    meds: ["アムロジピン錠5mg 1回1錠 1日1回 朝食後", "ロスバスタチン錠2.5mg 1回1錠 1日1回 夕食後"],
    vitals: { sbp: 132, dbp: 80, hr: 72 },
    visits: [{ day: -84, text: "家庭血圧 128/78。処方継続。" }],
  },
  {
    id: "opd-3",
    name: "吉村 拓也",
    kana: "ヨシムラ タクヤ",
    sex: "男",
    age: 32,
    department: "総合診療科",
    doctor: DOCTOR,
    slot: null,
    arrived: "09:20",
    status: "受付済",
    kind: "初診",
    reason: "3日前から咳と38度の熱（予約外）",
    allergies: [],
    problems: [],
    meds: [],
    vitals: { bt: 38.1, hr: 96, sbp: 124, dbp: 76, spo2: 97 },
    visits: [],
  },
  {
    id: "opd-4",
    name: "坂本 ヨシ",
    kana: "サカモト ヨシ",
    sex: "女",
    age: 86,
    department: "総合診療科",
    doctor: DOCTOR,
    slot: "09:45",
    status: "予約",
    kind: "初診",
    reason: "かかりつけ医から紹介：2週間で食事量が半分、体重減少",
    allergies: [],
    problems: [],
    meds: ["ランソプラゾール錠15mg 1回1錠 1日1回 朝食後"],
    visits: [],
    referral: "〇〇内科クリニック（架空）より。2週間前から食欲低下、体重 −3kg。採血で Alb 3.0。精査をお願いします。",
  },
  {
    id: "opd-5",
    name: "森田 早苗",
    kana: "モリタ サナエ",
    sex: "女",
    age: 67,
    department: "総合診療科",
    doctor: DOCTOR,
    slot: "10:00",
    status: "予約",
    kind: "再診",
    reason: "定期受診（骨粗鬆症・逆流性食道炎）",
    allergies: [],
    problems: ["骨粗鬆症", "逆流性食道炎"],
    meds: ["ランソプラゾール錠15mg 1回1錠 1日1回 朝食後"],
    visits: [{ day: -90, text: "骨密度の再検は半年後。" }],
  },
  {
    id: "opd-6",
    name: "中谷 修",
    kana: "ナカタニ オサム",
    sex: "男",
    age: 71,
    department: "総合診療科",
    doctor: DOCTOR,
    slot: "08:45",
    arrived: "08:30",
    status: "会計待ち",
    kind: "再診",
    reason: "定期受診（COPD）",
    allergies: [],
    problems: ["COPD（慢性閉塞性肺疾患）"],
    meds: [],
    vitals: { spo2: 95, hr: 80 },
    visits: [{ day: -30, text: "息切れは変わらず。吸入の手技を確認。" }],
  },
];

/** Waiting time since reception, in minutes (null before reception or after the visit ended). */
export function waitingMinutes(p: OpdPatient, nowMin: number): number | null {
  if (!p.arrived || p.status === "終了" || p.status === "会計待ち" || p.status === "診察中") return null;
  const [h, m] = p.arrived.split(":").map(Number);
  return Math.max(0, nowMin - (h * 60 + m));
}
