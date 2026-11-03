// 院内連絡: what an in-hospital phone (院内PHS, and the smartphones that replace it) is used for on a ward —
// who to call now, nurse calls with the patient's cautions on screen, emergency calls to everyone, and a
// short record of each call so that "言った・言わない" can be checked later. Everything here is the
// fictional hospital's: names, extension numbers and the rules for passing a call on. Code applies the
// rules; it does not judge how urgent anything is.

export type DutyShift = "日勤" | "夜勤";

/** 日勤 08:30–17:00; otherwise 夜勤 (the hospital's 当直 hours). */
export const dutyShiftAt = (minutesOfDay: number): DutyShift => (minutesOfDay >= 510 && minutesOfDay < 1020 ? "日勤" : "夜勤");

export interface Contact {
  /** What the person is for, e.g. 当直医. */
  role: string;
  name: string;
  /** Fictional extension. */
  ext: string;
  note?: string;
}

/** The fictional hospital's duty list (架空). Weekends and nights have 当直 instead of day staff. */
export function onDuty(minutesOfDay: number, weekend: boolean): Contact[] {
  const day = dutyShiftAt(minutesOfDay) === "日勤" && !weekend;
  return [
    day ? { role: "病棟の医師", name: "山本（専攻医）", ext: "7101", note: "総合診療科 A チーム" } : { role: "当直医", name: "松本（内科当直）", ext: "7000", note: "病棟の急変・指示の確認" },
    { role: "病棟リーダー", name: day ? "看護師 田中" : "看護師 渡辺", ext: "5100", note: "5階東" },
    day ? { role: "看護師長", name: "看護師長 小松", ext: "5101" } : { role: "管理当直", name: "副看護部長 石井", ext: "1000", note: "病院全体の判断（ベッド・人員）" },
    { role: day ? "病棟薬剤師" : "当直薬剤師", name: day ? "薬剤師 小林" : "薬剤師 中島", ext: day ? "3105" : "3000" },
    { role: day ? "検査室" : "検査室（夜間）", name: day ? "検査技師 中村" : "検査技師 木村", ext: "2101" },
    { role: day ? "放射線科" : "放射線科（夜間）", name: day ? "放射線技師 原" : "放射線技師 永井", ext: "2201" },
    ...(day ? [{ role: "地域連携室", name: "MSW 伊藤", ext: "1205" }, { role: "医事課", name: "医事課 渡辺", ext: "1101" }] : []),
  ];
}

// ---------------------------------------------------------------------------
// ナースコール
// ---------------------------------------------------------------------------

/** Seconds without an answer before a call goes on to the ward leader (架空の病院の取り決め). */
export const PASS_ON_SECONDS = 60;
export const CALL_REASONS = ["トイレ", "痛み・苦しい", "点滴・機器のアラーム", "転倒・ベッドから出ている", "その他"] as const;

export interface NurseCall {
  id: string;
  patientId: string;
  room: string;
  bed: string;
  /** When it rang: clock time and real milliseconds (for the pass-on timer). */
  at: string;
  ms: number;
  to: string;
  passedOn?: { at: string; to: string; why: string };
  answered?: { at: string; by: string };
  arrived?: { at: string; by: string };
  done?: { at: string; by: string; reason: (typeof CALL_REASONS)[number]; memo: string };
}

export type CallState = "呼出中" | "応答" | "訪室" | "完了";
export const callState = (c: NurseCall): CallState => (c.done ? "完了" : c.arrived ? "訪室" : c.answered ? "応答" : "呼出中");

/** Where a call goes when the leader is the one who did not answer. */
export const ALL_NURSES = "病棟の看護師全員（一斉）";

/** A call nobody answered for PASS_ON_SECONDS goes to the leader (once; to everyone if the leader had it), with the reason shown. */
export function passOn(c: NurseCall, nowMs: number, leader: string, clock: string): NurseCall {
  if (c.answered || c.passedOn || nowMs - c.ms < PASS_ON_SECONDS * 1000) return c;
  const to = c.to === leader ? ALL_NURSES : leader;
  return { ...c, passedOn: { at: clock, to, why: `${c.to}が${PASS_ON_SECONDS}秒応答しなかったため（病棟の取り決め）` } };
}

// ---------------------------------------------------------------------------
// 緊急通報
// ---------------------------------------------------------------------------

export const EMERGENCY_KINDS = ["コードブルー（急変・心肺停止）", "応援要請（人手が要る）", "スタットコール（暴言・暴力）"] as const;

export interface Emergency {
  id: string;
  kind: (typeof EMERGENCY_KINDS)[number];
  place: string;
  patientId?: string;
  at: string;
  by: string;
  came: { name: string; at: string }[];
  closed?: { at: string; by: string; note: string };
}

// ---------------------------------------------------------------------------
// 通話メモ
// ---------------------------------------------------------------------------

export interface CallNote {
  id: string;
  at: string;
  from: string;
  to: string;
  patientId?: string;
  text: string;
}
