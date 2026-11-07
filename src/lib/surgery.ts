// The operating rooms (手術室) of the FICTIONAL hospital: requests (手術申込), the schedule, and the
// anaesthesia record's arithmetic. Items follow public hospital requirement lists for Japanese
// EHRs (予定日・手術室・時間・術式・部位・左右・体位・麻酔・申込区分・術後の行き先・麻酔科依頼).
// Checks and the L008 time arithmetic are code; Claude only fills the request from dictation.

import { minutesOf } from "./dates";
import type { Sex } from "./types";

export const OR_ROOMS = ["手術室1", "手術室2", "手術室3"] as const;
export type OrRoom = (typeof OR_ROOMS)[number];
export type Side = "右" | "左" | "両側" | "なし";
export type Position = "仰臥位" | "側臥位" | "伏臥位" | "砕石位" | "坐位";
export type Anesthesia = "全身麻酔" | "脊椎麻酔" | "硬膜外麻酔" | "局所麻酔" | "伝達麻酔";
export type RequestKind = "予定" | "締切後" | "緊急";

export const POSITIONS: Position[] = ["仰臥位", "側臥位", "伏臥位", "砕石位", "坐位"];
export const ANESTHESIAS: Anesthesia[] = ["全身麻酔", "脊椎麻酔", "硬膜外麻酔", "局所麻酔", "伝達麻酔"];
export const SIDES: Side[] = ["右", "左", "両側", "なし"];

/** Ward rules of the fictional hospital. */
export const OR_RULES = {
  open: "08:30",
  close: "18:00",
  /** Cleaning and setting up between two cases (minutes). */
  turnover: 30,
  /** A 予定 request for a day must come in by 15:00 the day before; later ones are 締切後. */
  deadline: "15:00",
};

export interface AnesRecord {
  /** 麻酔器を接続 / 手術開始 / 手術終了 / 麻酔器から離脱 (absolute minutes). */
  anesStart?: number;
  opStart?: number;
  opEnd?: number;
  anesEnd?: number;
}

export interface Surgery {
  anesthesiaCase?: import("./anesthesia").AnesthesiaCase;
  id: string;
  /** One of our ward patients, or a fictional patient of another team. */
  patientId?: string;
  name: string;
  sex: Sex;
  age: number;
  ward: string;
  department: string;
  day: number;
  room: OrRoom | null;
  start: string | null;
  minutes: number | null;
  procedure: string;
  site: string;
  side: Side | null;
  position: Position | null;
  anesthesia: Anesthesia | null;
  laparoscopic: boolean;
  kind: RequestKind;
  blood: "なし" | "血液型・不規則抗体" | "輸血準備";
  after: "病棟" | "ICU" | "回復室";
  anesthesiaConsult: boolean;
  infections: string[];
  allergies: string[];
  heightCm?: number;
  weightKg?: number;
  status: "申込" | "受付済" | "入室" | "退室";
  requestedAt: number;
  surgeon?: string;
  assistant?: string;
  preop?: { consent: string; anticoagulant: string; fasting: string; bloodType: string };
  bloodUnits?: number;
  special?: string;
  record?: AnesRecord;
  /** 麻酔が困難な患者（告示の別表）: the anaesthesiologist marks it. */
  difficult?: boolean;
}

const s = (o: Partial<Surgery> & Pick<Surgery, "id" | "name" | "sex" | "age" | "department" | "day" | "room" | "start" | "minutes" | "procedure">): Surgery => ({
  ward: "（他病棟）",
  site: "",
  side: "なし",
  position: "仰臥位",
  anesthesia: "全身麻酔",
  laparoscopic: false,
  kind: "予定",
  blood: "血液型・不規則抗体",
  after: "病棟",
  anesthesiaConsult: true,
  infections: [],
  allergies: [],
  status: "受付済",
  requestedAt: -2 * 1440 + 600,
  ...o,
});

/** FICTIONAL schedule for today and tomorrow (other teams' patients). */
export function initialSurgeries(nowAbs: number): Surgery[] {
  return [
    // The first case is under way once it is past its start (fixed clock times, not "minutes ago").
    s({
      id: "or-1",
      name: "本田 美香",
      sex: "女",
      age: 52,
      department: "外科",
      day: 0,
      room: "手術室1",
      start: "08:45",
      minutes: 120,
      procedure: "腹腔鏡下胆嚢摘出術",
      site: "胆嚢",
      laparoscopic: true,
      ...(nowAbs >= 9 * 60 + 5 ? { status: "入室" as const, record: { anesStart: 8 * 60 + 50, opStart: 9 * 60 + 5 } } : {}),
    }),
    s({ id: "or-2", name: "大野 勇", sex: "男", age: 78, department: "整形外科", day: 0, room: "手術室2", start: "09:00", minutes: 120, procedure: "人工骨頭挿入術", site: "股関節", side: "左", position: "側臥位", anesthesia: "脊椎麻酔", blood: "輸血準備" }),
    s({ id: "or-3", name: "森田 哲也", sex: "男", age: 64, department: "外科", day: 0, room: "手術室1", start: "13:30", minutes: 90, procedure: "鼠径ヘルニア手術", site: "鼠径部", side: "右" }),
    s({ id: "or-4", name: "小松 恵子", sex: "女", age: 69, department: "整形外科", day: 1, room: "手術室2", start: "09:00", minutes: 150, procedure: "人工膝関節置換術", site: "膝関節", side: "右", blood: "輸血準備" }),
    s({ id: "or-5", name: "長谷川 修", sex: "男", age: 58, department: "外科", day: 1, room: "手術室1", start: "09:00", minutes: 180, procedure: "腹腔鏡下結腸切除術", site: "S状結腸", laparoscopic: true, after: "ICU" }),
  ];
}

export const endOf = (x: Surgery) => (x.start && x.minutes ? minutesOf(x.start) + x.minutes : null);

/** Cases in the same room and day that overlap, counting the turnover after each case. */
export function overlaps(all: Surgery[], x: Surgery): Surgery[] {
  if (!x.room || !x.start || !x.minutes) return [];
  const a0 = minutesOf(x.start);
  const a1 = a0 + x.minutes + OR_RULES.turnover;
  return all.filter((y) => {
    if (y.id === x.id || y.room !== x.room || y.day !== x.day || !y.start || !y.minutes) return false;
    const b0 = minutesOf(y.start);
    const b1 = b0 + y.minutes + OR_RULES.turnover;
    return a0 < b1 && b0 < a1;
  });
}

export interface OrCheck {
  level: "stop" | "ask" | "info";
  text: string;
  /** "deadline": past the deadline for 予定 — answered by switching the request to 締切後. */
  key?: "deadline";
}

/** What a request still lacks or collides with. The doctor and the OR staff decide. */
export function checkRequest(all: Surgery[], x: Surgery, nowAbs: number): OrCheck[] {
  const out: OrCheck[] = [];
  const missing = [
    !x.procedure.trim() && "術式",
    !x.site.trim() && "部位",
    !x.side && "左右",
    !x.position && "体位",
    !x.anesthesia && "麻酔",
    x.room === null && "手術室",
    !x.start && "開始時刻",
    !x.minutes && "予定時間",
  ].filter(Boolean);
  if (missing.length) out.push({ level: "ask", text: `${missing.join("・")}が抜けています。` });
  for (const y of overlaps(all, x)) out.push({ level: "stop", text: `${y.room}の ${y.start}〜（${y.procedure}、片付け${OR_RULES.turnover}分を含む）と重なります。` });
  const end = endOf(x);
  if (end !== null && end > minutesOf(OR_RULES.close)) out.push({ level: "ask", text: `終わりが ${OR_RULES.close} を過ぎます（予定 ${Math.floor(end / 60)}:${String(end % 60).padStart(2, "0")}）。` });
  if (x.kind === "予定" && x.day >= 1 && nowAbs > (x.day - 1) * 1440 + minutesOf(OR_RULES.deadline)) {
    out.push({ level: "ask", key: "deadline", text: `予定手術の締切（前日 ${OR_RULES.deadline}）を過ぎています。申込区分は「締切後」になります。` });
  }
  if (x.kind === "予定" && x.day === 0) out.push({ level: "ask", text: "今日の手術は「緊急」か「締切後」で申し込みます。" });
  if (x.infections.length) out.push({ level: "info", text: `感染症：${x.infections.join("、")}（カルテから）` });
  if (x.allergies.length) out.push({ level: "info", text: `アレルギー：${x.allergies.join("、")}（カルテから）` });
  if (x.heightCm && x.weightKg) out.push({ level: "info", text: `身長 ${x.heightCm}cm・体重 ${x.weightKg}kg（カルテから）` });
  return out;
}

// ---------------------------------------------------------------------------
// L008 閉鎖循環式全身麻酔（令和8年度）: 区分 × 麻酔が困難な患者かどうか、2時間を超えたら30分
// （端数を含む）ごとに加算。時間は麻酔器を接続してから離脱するまで。
// ---------------------------------------------------------------------------

const L008: Record<1 | 2 | 3 | 4 | 5, { hard: number; base: number; per30: number }> = {
  1: { hard: 24900, base: 18200, per30: 1800 },
  2: { hard: 16720, base: 12190, per30: 1200 },
  3: { hard: 12610, base: 9170, per30: 900 },
  4: { hard: 9015, base: 6500, per30: 650 },
  5: { hard: 8300, base: 6000, per30: 600 },
};

/** The 区分 that follows from the facts on the request (心臓手術・分離肺換気など 1・2 are not handled here). */
export function l008Category(x: Surgery): { cat: 3 | 4 | 5; why: string } {
  if (x.position === "伏臥位") return { cat: 3, why: "伏臥位で麻酔（L008 の3）" };
  if (x.laparoscopic) return { cat: 4, why: "腹腔鏡を用いた手術（L008 の4）" };
  if (x.position === "側臥位") return { cat: 4, why: "側臥位で麻酔（L008 の4）" };
  return { cat: 5, why: "その他の場合（L008 の5）" };
}

export function l008Fee(x: Surgery): { points: number; minutes: number; extra: number; formula: string; why: string } | null {
  if (x.anesthesia !== "全身麻酔" || surgeryTimes(x).anesStart === undefined || surgeryTimes(x).anesEnd === undefined) return null;
  const minutes = surgeryTimes(x).anesEnd! - surgeryTimes(x).anesStart!;
  const { cat, why } = l008Category(x);
  const t = L008[cat];
  const base = x.difficult ? t.hard : t.base;
  const extra = minutes > 120 ? Math.ceil((minutes - 120) / 30) : 0;
  const points = base + extra * t.per30;
  return {
    points,
    minutes,
    extra,
    why: `${why}・${x.difficult ? "麻酔が困難な患者（イ）" : "イ以外（ロ）"}`,
    formula: `${base.toLocaleString("ja-JP")}点${extra ? ` ＋ ${t.per30}点 × ${extra}（2時間を超えた ${minutes - 120}分 → 30分ごと、端数を含む）` : ""} = ${points.toLocaleString("ja-JP")}点（麻酔 ${Math.floor(minutes / 60)}時間${minutes % 60}分）`,
  };
}

/** Canonical event times, with migration of the older record on first edit. */
export function surgeryTimes(s: Surgery): AnesRecord {
  const e = s.anesthesiaCase?.events;
  return e ? {anesStart:e['麻酔器接続'],opStart:e['執刀'],opEnd:e['手術終了'],anesEnd:e['麻酔器離脱']} : s.record ?? {};
}
export function surgeryAnesthesia(s: Surgery): import('./anesthesia').AnesthesiaCase {
  return s.anesthesiaCase ?? {events:{...(s.record?.anesStart!==undefined ? {'麻酔器接続':s.record.anesStart}:{}),...(s.record?.opStart!==undefined ? {'執刀':s.record.opStart}:{}),...(s.record?.opEnd!==undefined ? {'手術終了':s.record.opEnd}:{}),...(s.record?.anesEnd!==undefined ? {'麻酔器離脱':s.record.anesEnd}:{})},vitals:[],administrations:[]};
}
