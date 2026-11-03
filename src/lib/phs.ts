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
// ナースコール (the kinds of call, teams, and how an unanswered call slides on)
// ---------------------------------------------------------------------------

/** Kinds of call the fictional ward tells apart (a sensor or a monitor also rings as a call). */
export const CALL_KINDS = ["通常", "トイレ", "点滴", "離床センサー", "起き上がりセンサー", "見守りカメラ", "モニタのアラーム"] as const;
export type CallKind = (typeof CALL_KINDS)[number];

/** Sensors a nurse can register on a bed (物品管理), each ringing as its own kind of call. */
export const SENSORS = ["離床センサー", "起き上がりセンサー", "見守りカメラ"] as const;
export type Sensor = (typeof SENSORS)[number];

/** 救護区分: how a patient is moved out in a fire (set by a nurse). */
export const RESCUE = ["担送", "護送", "独歩"] as const;
export type Rescue = (typeof RESCUE)[number];

/** Per bed: what the nurse registered (患者情報管理). */
export interface BedInfo {
  rescue?: Rescue;
  sensors: Sensor[];
}

/** Teams of the fictional 5階東 (rooms 501–508 = A, 510–516 = B). */
export const teamOf = (room: string): "A" | "B" => (Number(room.replace(/[A-Z]$/, "")) < 510 ? "A" : "B");

/** Seconds without an answer before a call slides to the next (架空の病院の取り決め). */
export const PASS_ON_SECONDS = 60;
export const CALL_REASONS = ["トイレ", "痛み・苦しい", "点滴・機器のアラーム", "転倒・ベッドから出ている", "その他"] as const;
export const ALL_NURSES = "病棟の看護師全員（一斉）";

export interface NurseCall {
  id: string;
  kind: CallKind;
  patientId: string;
  room: string;
  bed: string;
  /** When it rang: clock time and real milliseconds (for the slide timer). */
  at: string;
  ms: number;
  to: string;
  /** Where it slid when nobody answered: team, then the leader, then everyone. */
  slides: { at: string; to: string; why: string }[];
  answered?: { at: string; by: string };
  arrived?: { at: string; by: string };
  done?: { at: string; by: string; reason: (typeof CALL_REASONS)[number]; memo: string };
}

export type CallState = "呼出中" | "応答" | "訪室" | "完了";
export const callState = (c: NurseCall): CallState => (c.done ? "完了" : c.arrived ? "訪室" : c.answered ? "応答" : "呼出中");
export const callTarget = (c: NurseCall) => c.slides.at(-1)?.to ?? c.to;

/**
 * 呼出スライド: every PASS_ON_SECONDS without an answer the call goes one step on — the patient's team,
 * the ward leader, then every nurse on the ward. Each step keeps why.
 */
export function slide(c: NurseCall, nowMs: number, team: string, leader: string, clock: string): NurseCall {
  if (c.answered) return c;
  const steps = [team, leader, ALL_NURSES].filter((x, i, all) => x !== c.to && all.indexOf(x) === i);
  const due = Math.min(steps.length, Math.floor((nowMs - c.ms) / (PASS_ON_SECONDS * 1000)));
  if (due <= c.slides.length) return c;
  // Each step names who did not answer before it (the first, the team, the leader …).
  const prevOf = (i: number) => (i === 0 ? c.to : steps[i - 1]);
  const next = steps.slice(c.slides.length, due).map((to, k) => ({ at: clock, to, why: `${prevOf(c.slides.length + k)}が${PASS_ON_SECONDS}秒応答しなかったため（病棟の取り決め）` }));
  return { ...c, slides: [...c.slides, ...next] };
}

/** 呼出履歴: how many calls of each kind (and the average minutes to answer). */
export function callCounts(calls: NurseCall[]): { kind: CallKind; n: number; avgAnswerMin: number | null }[] {
  return CALL_KINDS.map((kind) => {
    const of = calls.filter((c) => c.kind === kind);
    const waits = of.filter((c) => c.answered).map((c) => {
      const [h1, m1] = c.at.split(":").map(Number);
      const [h2, m2] = c.answered!.at.split(":").map(Number);
      return h2 * 60 + m2 - (h1 * 60 + m1);
    });
    return { kind, n: of.length, avgAnswerMin: waits.length ? Math.round((waits.reduce((a, b) => a + b, 0) / waits.length) * 10) / 10 : null };
  }).filter((x) => x.n > 0);
}

// ---------------------------------------------------------------------------
// お知らせ (オーダ変更・一斉連絡) on the nurses' phones
// ---------------------------------------------------------------------------

export interface PhsNotice {
  id: string;
  at: string;
  kind: "オーダ変更" | "一斉連絡" | "火災";
  text: string;
  patientId?: string;
  /** Who it is for: a team, or every nurse. */
  to: "A" | "B" | "全員";
  from: string;
  readBy: string[];
}

/** Patients to help out in a fire (担送・護送), and those whose 救護区分 nobody has set yet. */
export function evacuation(people: { id: string; name: string; room: string }[], beds: Record<string, BedInfo>) {
  return {
    carry: people.filter((p) => beds[p.id]?.rescue === "担送"),
    escort: people.filter((p) => beds[p.id]?.rescue === "護送"),
    unknown: people.filter((p) => !beds[p.id]?.rescue),
  };
}

// ---------------------------------------------------------------------------
// 緊急通報
// ---------------------------------------------------------------------------

export const EMERGENCY_KINDS = ["コードブルー（急変・心肺停止）", "応援要請（人手が要る）", "スタットコール（暴言・暴力）", "AED の使用（扉が開いた）", "火災（避難）"] as const;

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
