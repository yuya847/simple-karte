// Emergency department (救急外来) patients — all FICTIONAL. Arrival times are minutes before
// "now" so the board always looks like today. Triage levels (JTAS 1–5) are what a triage
// nurse entered; the app never assigns them.

import { FACILITY_STANDARDS } from "./billing/facility";
import type { Sex } from "./types";

const filed = (code: string) => FACILITY_STANDARDS.some((f) => f.code === code);

export type Jtas = 1 | 2 | 3 | 4 | 5;

export type ErStatus = "搬送中" | "診察待ち" | "診察中" | "入院依頼" | "帰宅" | "入院済";
export type Arrival = "救急車" | "独歩" | "紹介";

export interface ErPatient {
  id: string;
  name: string;
  kana: string;
  sex: Sex;
  age: number;
  /** Months, for a child of 3 or younger (shown as ◯歳◯カ月). */
  ageMonths?: number;
  arrival: Arrival;
  /** Arrival as an absolute minute (day offset × 1440 + minutes). */
  arrivedAbs: number;
  complaint: string;
  /** JTAS level entered by the triage nurse (1 = 蘇生 … 5 = 非緊急). Not set before arrival. */
  jtas?: Jtas;
  /** When the nurse last triaged (absolute minute). Defaults to the arrival. */
  triagedAbs?: number;
  /** Earlier triages (level and time), oldest first. */
  triageLog?: { abs: number; jtas: Jtas }[];
  /** What the ambulance crew said on the phone, read into items (before arrival). */
  hotline?: { eta: number; jcs?: string; history?: string };
  status: ErStatus;
  vitals?: { bt?: number; hr?: number; sbp?: number; dbp?: number; rr?: number; spo2?: number; o2?: string };
  heightCm?: number;
  weightKg?: number;
  allergies: string[];
  note?: string;
  /** Set once admitted: the ward patient id. */
  admittedAs?: string;
}

export const JTAS_LABEL: Record<Jtas, string> = {
  1: "蘇生",
  2: "緊急",
  3: "準緊急",
  4: "低緊急",
  5: "非緊急",
};

/**
 * Minutes until the next re-triage for each JTAS level (JTAS: 蘇生 継続, 緊急 15分, 準緊急 30分,
 * 低緊急 60分, 非緊急 120分). The level itself is the nurse's; code only counts the time.
 */
export const REASSESS_MIN: Record<Jtas, number> = { 1: 0, 2: 15, 3: 30, 4: 60, 5: 120 };

/** Minutes left until re-triage (negative = overdue), or null when not applicable. */
export function reassessIn(p: ErPatient, nowAbs: number): number | null {
  if (!p.jtas || p.status === "帰宅" || p.status === "入院済" || p.status === "搬送中") return null;
  if (p.jtas === 1) return 0;
  const last = p.triagedAbs ?? p.arrivedAbs;
  return last + REASSESS_MIN[p.jtas] - nowAbs;
}

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

// ---------------------------------------------------------------------------
// 救急外来医学管理料（B001-2-6、令和8年度）: which part a visit falls under. Display only:
// outpatient claims are not made in this prototype, and the fictional hospital (modelled on a real
// hospital's filings) has not filed for it.
// ---------------------------------------------------------------------------

/** 国民の祝日（内閣府、2026年）. 診療報酬の「休日」は日曜・祝日と12月29日〜1月3日. */
const HOLIDAYS_2026 = ["01-01", "01-12", "02-11", "02-23", "03-20", "04-29", "05-03", "05-04", "05-05", "05-06", "07-20", "08-11", "09-21", "09-22", "09-23", "10-12", "11-03", "11-23"];

export function isHoliday(y: number, m: number, d: number): boolean {
  const key = `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if ((m === 12 && d >= 29) || (m === 1 && d <= 3)) return true;
  return y === 2026 && HOLIDAYS_2026.includes(key);
}

/** The fictional hospital's 診療時間: weekdays 9:00–17:00, Saturdays 9:00–12:00. 夜間 = 18:00–翌8:00 (通知の目安). */
export function visitTime(arrivedAbs: number, today: { y: number; m: number; d: number }): { label: string; night: boolean; holiday: boolean; saturday: boolean; inHours: boolean } {
  const day = Math.floor(arrivedAbs / 1440);
  const min = arrivedAbs - day * 1440;
  const t = new Date(Date.UTC(today.y, today.m - 1, today.d + day));
  const dow = t.getUTCDay();
  const holiday = dow === 0 || isHoliday(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  const saturday = dow === 6;
  const night = min >= 18 * 60 || min < 8 * 60;
  const inHours = !holiday && (saturday ? min >= 540 && min < 720 : min >= 540 && min < 1020);
  const label = `${holiday ? (dow === 0 ? "日曜" : "祝日") : saturday ? "土曜" : "平日"}${night ? "・夜間" : inHours ? "・診療時間内" : "・時間外"}`;
  return { label, night, holiday, saturday, inHours };
}

export interface ErFeeHint {
  item: string;
  note: string;
}

/**
 * What B001-2-6 says about this visit, against the hospital's filings (施設基準 4230〜4232 for the
 * 管理料, 4229 for 院内トリアージ実施体制加算, which only adds to 夜間休日救急医学管理料).
 */
export function erFeeHint(p: ErPatient, today: { y: number; m: number; d: number }): ErFeeHint | null {
  const v = visitTime(p.arrivedAbs, today);
  const base = ["4230", "4231", "4232"].some(filed);
  const tail = base ? "（届出の区分で算定）" : "（届出が要る。この院は届出なし → 算定しない）";
  if (p.arrival === "救急車") {
    const add = v.holiday || v.saturday ? (v.night ? "時間外救急搬送加算 300点" : "時間外救急搬送加算 200点") : v.night ? "時間外救急搬送加算 250点" : "";
    return { item: "救急搬送医学管理料（B001-2-6 の1）", note: `${v.label}${add ? `・${add}の対象` : ""}${tail}` };
  }
  if (!v.inHours && (v.night || v.holiday || v.saturday)) {
    const triage = filed("4229")
      ? base
        ? "院内トリアージ実施体制加算 50点も（届出あり）"
        : "院内トリアージ実施体制加算は届出ありだが、この管理料に加える加算なので算定しない"
      : "";
    return { item: "夜間休日救急医学管理料（B001-2-6 の2）", note: `${v.label}${tail}${triage ? `。${triage}` : ""}` };
  }
  return null;
}
