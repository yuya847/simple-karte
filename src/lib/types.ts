// Domain types for the ward chart. All patient data in this app is fictional.

import type { AreaClass, O2Device, ProcSchedule, UlcerDepth } from "./procedures";
import type { ImagingOrder, PhysioOrder } from "./exams";
import type { Role } from "./roles";

export type { ImagingOrder, PhysioOrder } from "./exams";

/** Day offset from "today" (0 = today, -1 = yesterday). Dates are resolved at runtime. */
export type DayOffset = number;

export type Sex = "男" | "女";

export interface Patient {
  /** Code status from the current advance directive ("DNAR" etc.), filled in by the app. */
  codeStatus?: string;
  /** The diet at the next meal ("絶食（…）" etc.), filled in by the app. */
  dietNow?: string;
  id: string;
  name: string;
  kana: string;
  sex: Sex;
  age: number;
  /** Months, for a child of 3 or younger (shown as ◯歳◯カ月). */
  ageMonths?: number;
  ward: string;
  room: string;
  department: string;
  attending: string;
  /** Admission day as an offset from today (e.g. -3 = admitted three days ago). */
  admittedOn: DayOffset;
  admissionDiagnosis: string;
  heightCm: number;
  weightKg: number;
  allergies: string[];
  /** 妊娠中 (marked by a doctor or nurse; weeks if known). Filled in by the app. */
  pregnancy?: { weeks: number | null } | null;
  /** 退院を実施した時 (filled in by the app). */
  dischargedAt?: { day: DayOffset; time: string; by: string };
  /** 血液型 (ABO・RhD), how many separate samples confirmed it, and the irregular antibody screen. */
  blood?: { abo: "A" | "B" | "O" | "AB"; rh: "+" | "-"; checks: number; antibody?: "陰性" | "陽性" };
  infections: string[];
  cautions: string[];
  /** 禁忌 registered in the patient profile (薬・検査など), filled in by the app. */
  contraindications?: string[];
  history: HistoryEntry[];
  labs: LabResult[];
  cultures: CultureResult[];
  imaging: ImagingStudy[];
  vitals: VitalSign[];
  daily: DailyRecord[];
}

// ---------- Flow sheet (経過表) ----------

/** One set of vital signs taken by a nurse. */
export interface VitalSign {
  day: DayOffset;
  time: string;
  bt?: number; // ℃
  hr?: number; // /分
  sbp?: number; // mmHg
  dbp?: number;
  rr?: number; // /分
  spo2?: number; // %
  o2?: string; // "室内気" or "鼻カニュラ 2L" etc.
  /** 意識（ACVPU）. */
  avpu?: "A" | "C" | "V" | "P" | "U";
  /** Who took it (entered in this app). */
  by?: string;
}

/** Per-day nursing record. Meals are the staple eaten, in tenths (割), breakfast/lunch/dinner. */
export interface DailyRecord {
  day: DayOffset;
  meals?: "絶食" | [number | null, number | null, number | null];
  urineMl?: number;
  stools?: number;
  weightKg?: number;
}

// ---------- Past record (left pane) ----------

export type HistoryEntry = NoteEntry | OrderEntry;

export interface NoteEntry {
  templateId?: string;
  templateName?: string;
  kind: "note";
  category?: "指示簿" | "コンサルト返書" | "リハビリ実施" | "リハビリ";
  day: DayOffset;
  time: string; // "HH:MM"
  author: string;
  role: Role | "検査室";
  /** SOAP sections, or a single free-text body. */
  soap?: { s?: string; o?: string; a?: string; p?: string };
  text?: string;
  /** 看護記録 in フォーカスチャーティング: each focus (#) with D（データ）・Act（行為）・R（反応）. */
  focus?: FocusPart[];
  /** 看護記録 as 経時記録: what happened, by clock time. */
  timeline?: { time: string; text: string }[];
  /** Notes confirmed in this app carry an id. */
  id?: string;
  /**
   * When it was written (記載日時), kept and never changed. `day`/`time` above are 記録時刻: when what is
   * written happened, set earlier when writing late. Absent in the stored record (written at that time).
   */
  writtenAt?: { day: DayOffset; time: string };
  /** シェーマ drawn for the note (PNG data URLs with a caption). */
  figures?: { caption: string; dataUrl: string }[];
  /** Every version when the note was corrected, oldest first (the fields above are the last one). */
  versions?: NoteVersion[];
}

export interface FocusPart {
  title: string;
  d?: string;
  act?: string;
  r?: string;
}

export interface NoteVersion {
  day: DayOffset;
  time: string;
  author: string;
  soap?: NoteEntry["soap"];
  text?: string;
  focus?: NoteEntry["focus"];
  timeline?: NoteEntry["timeline"];
  /** Why it was corrected (empty for the first version). */
  reason?: string;
}

export type OrderStatus = "有効" | "中止" | "終了" | "実施済";

export interface OrderEntry {
  kind: "order";
  id: string;
  day: DayOffset;
  time: string;
  author: string;
  status: OrderStatus;
  /** Day the order was stopped, when status is 中止. */
  stoppedOn?: DayOffset;
  /** Clock time of the stop, when known ("HH:MM"). Without it the order counts to the end of stoppedOn. */
  stoppedTime?: string;
  order: Order;
  /** 口頭指示: a nurse entered it on the doctor's spoken order; the doctor signs afterwards. */
  verbal?: { takenBy: string; doctor: string; at: { day: DayOffset; time: string }; readBack?: boolean; signedBy?: string; cancelled?: { by: string; at: { day: DayOffset; time: string }; reason: string }; signedAt?: { day: DayOffset; time: string } };
  /** 画像検査: what 放射線部 recorded (ris.ts), for the claim. Without it a study counts as done once its time passed. */
  exam?: ExamRecord;
}

/** 放射線部's record of one imaging order, as the claim reads it: done (when), not done, and the contrast medium used. */
export interface ExamRecord {
  done?: { day: DayOffset; time: string };
  notDone?: true;
  /** 医薬品マスターのコード, the name and how many (本・筒). */
  contrast?: { code: string; name: string; count: number };
}

// ---------- Orders ----------

export type Order = InjectionOrder | LabOrder | PrescriptionOrder | ProcedureOrder | ImagingOrder | PhysioOrder;

export type InjectionRoute = "点滴静注" | "静注" | "皮下注" | "筋注";

export interface InjectionItem {
  drugCode: string;
  amount: number;
  unit: string;
}

export type InjectionSchedule =
  | { kind: "per_day"; count: number } // e.g. 1日2本 / 1日2回
  | { kind: "every_hours"; hours: number } // e.g. 12時間ごと
  | { kind: "once" };

export interface InjectionOrder {
  doseTimes?: string[];
  end?: { day: number; time: string };
  type: "injection";
  items: InjectionItem[];
  route: InjectionRoute;
  schedule: InjectionSchedule;
  /** Infusion time per dose (minutes), when given. */
  minutesPerDose?: number;
  /** Rate in mL/h, when given or computed. */
  rateMlPerH?: number;
  start: { day: DayOffset; time?: string };
  /** Number of days, or undefined for "until changed". */
  days?: number;
  comment?: string;
  /** The doctor's reasons for 併用禁忌 and for a 配合 the 電子添文 says not to make (interactions.ts). */
  interactionReasons?: InteractionReason[];
}

/** A finding the doctor confirmed with a reason (併用禁忌, or a 配合 the 電子添文 says not to make). */
export interface InteractionReason {
  pairId: string;
  level: "併用禁忌" | "併用注意" | "配合";
  /** "A × B（where）" as shown when confirmed. */
  drugs: string;
  reason: string;
}

export type LabPriority = "定時" | "至急";

/** Where the sample is drawn (the fictional hospital's three places; the ward draws on the ward). */
export type LabSite = "中央採血室" | "自科採血" | "病棟採血";
export const LAB_SITES: readonly LabSite[] = ["中央採血室", "自科採血", "病棟採血"];

export interface LabOrder {
  type: "lab";
  /** Lab test codes or set codes from the master. */
  codes: string[];
  collect: { day: DayOffset; time: string };
  priority: LabPriority;
  /** The items marked 至急 when only some of them are (all of them 至急: `priority` is 至急 and this is left out). */
  urgentCodes?: string[];
  site?: LabSite;
  /** What the test is for (free text the doctor wrote). */
  purpose?: string;
  comment?: string;
}

/** When oral drugs are taken. The clock time of each is a ward rule (see master.ts). */
export type DoseTiming = "朝" | "昼" | "夕" | "眠前";

export interface PrescriptionOrder {
  dispensing?: "院内" | "院外";
  once?: { day: DayOffset; time: string };
  onePack?: boolean;
  type: "prescription";
  /** 定期 = regular, 臨時 = one-off/short, 持参薬 = the patient's own drugs brought from home,
   * 退院時 = 退院時処方 (taken home; dispensed by the pharmacy with 薬袋 and 薬剤情報提供文書, never given on the ward). */
  category: "定期" | "臨時" | "持参薬" | "退院時";
  drugCode: string;
  /** Amount per time, e.g. 1 (錠). */
  amount: number;
  unit: string;
  /** Empty for as-needed (頓用) drugs. */
  timings: DoseTiming[];
  /** Condition for an as-needed drug, e.g. "発熱時（38.5℃以上）". */
  prn?: string;
  maxPerDay?: number;
  start: { day: DayOffset; timing?: DoseTiming };
  days?: number;
  comment?: string;
  /** FICTIONAL record of when an as-needed dose was taken. */
  prnUses?: { day: DayOffset; time: string }[];
  /** Drugs ordered together with one usage share an Rp (剤). */
  rp?: string;
  /** The daily amount as ordered (1日量); `amount` is then 1日量 ÷ 回数. */
  dailyAmount?: number;
  /** 承知コメント the doctor added to confirm a warning (重複承知・アレルギー承知・極量承知). */
  acks?: string[];
  /** The doctor's reasons for 併用禁忌 (interactions.ts). */
  interactionReasons?: InteractionReason[];
}

/** 透析指示: the conditions of a hemodialysis on the ward, as on a dialysis order sheet. */
export interface HdOrder {
  /** 導入（透析を始める）・維持（維持透析の患者の入院中）・緊急. */
  purpose: "導入" | "維持" | "緊急";
  method: "HD" | "オンラインHDF" | "ECUM";
  minutes: number;
  /** 血流量 mL/分 */
  qb: number;
  /** ダイアライザの膜面積 m² */
  membrane: number;
  /** 抗凝固薬: ヘパリンは初回（単位）と持続（単位/時）、ナファモスタットは持続（mg/時）. */
  anticoag: { drug: "ヘパリン" | "ナファモスタット" | "なし"; initial: number | null; hourly: number | null };
  /** 除水量 L */
  uf: number;
  /** ドライウェイト kg（決まっていれば） */
  dw: number | null;
  /** バスキュラーアクセス */
  access: string;
}

/** 輸血: one blood product order. The blood type is copied from the chart when ordered. */
export interface TxOrder {
  product: "RBC" | "FFP" | "PC";
  units: number;
  abo: "A" | "B" | "O" | "AB";
  rh: "+" | "-";
  /** Why (the doctor's words, e.g. 「Hb 6.4、ふらつきあり」). */
  reason: string;
}

/** リハビリ処方: the disease category, who (PT・OT・ST), the onset day it is counted from, goal and cautions. */
export interface RehabOrder {
  field: "脳血管疾患等" | "運動器" | "呼吸器" | "心大血管疾患" | "廃用症候群";
  therapists: ("PT" | "OT" | "ST")[];
  /** 起算日 (day offset): the day the disease began or the operation. */
  onset: number;
  goal: string;
  cautions: string;
}

/** 他科依頼: a question to another department (the answer, 返書, is recorded separately). */
export interface ConsultOrder {
  dept: string;
  question: string;
  urgency: "至急" | "通常" | "本日中" | "数日以内" | "定期";
  doctor?: string;
  summary?: string;
}

/** 退院申込・外泊・外出: when, where to, and (外泊・外出) when the patient comes back. */
export interface LeaveOrder {
  kind: "退院" | "外泊" | "外出";
  from: { day: number; time: string };
  back?: { day: number; time: string };
  destination: string;
  note: string;
}

/** 移動オーダ（転床・転棟・転科）: booked for a day and time; carried out (実施) on the ward. */
export interface MoveOrder {
  kind: "転床" | "転棟" | "転科";
  /** 転床・転棟: the bed. */
  to?: { room: string; bed: string };
  /** 転科: the new department and attending doctor. */
  toDept?: string;
  toDoctor?: string;
  reason: string;
}

/**
 * 外来予約 (PROC-OPD): a visit booked at the hospital's outpatient clinic — after discharge for an inpatient, the
 * next visit for an outpatient. The slot (午前・午後 or a clock time), the clinics and the range are the
 * fictional hospital's rules (opd-booking.ts).
 */
export interface OpdBookingOrder {
  dept: string;
  doctor?: string;
  day: DayOffset;
  slot: "午前" | "午後" | "時刻";
  /** "HH:MM" when the slot is 時刻. */
  time?: string;
  purpose: string;
  note?: string;
}

/** 指導の依頼: asked of another profession (栄養食事指導 → 管理栄養士, 服薬指導 → 薬剤師 …). */
export interface GuideOrder {
  kind: "栄養食事指導" | "服薬指導" | "退院時の生活指導";
  note: string;
}

/** A ward procedure (処置). The item comes from the fictional hospital's master (procedures.ts). */
export interface ProcedureOrder {
  type: "procedure";
  code: string;
  /** 部位, as said. */
  site?: string;
  /** 範囲 (wound / pressure ulcer). */
  area?: AreaClass;
  /** DESIGN-R2020 depth (pressure ulcer). */
  depth?: UlcerDepth;
  o2?: { device: O2Device; lpm: number };
  /** 血液透析の条件 (PROC-HD). */
  hd?: HdOrder;
  /** 輸血 (PROC-TX). */
  tx?: TxOrder;
  /** リハビリ処方 (PROC-REHAB). */
  rehab?: RehabOrder;
  /** 他科依頼 (PROC-CONSULT). */
  consult?: ConsultOrder;
  /** 退院・外泊・外出 (PROC-LEAVE). */
  leave?: LeaveOrder;
  /** 指導の依頼 (PROC-GUIDE). */
  guide?: GuideOrder;
  /** 移動（転床・転棟・転科, PROC-MOVE）. */
  move?: MoveOrder;
  /** 外来予約 (PROC-OPD). */
  opd?: OpdBookingOrder;
  schedule: ProcSchedule;
  start: { day: DayOffset; time?: string };
  days?: number;
  /** Drug used each time (処置薬剤), amount in the drug's unit. */
  drug?: { code: string; amount: number };
  comment?: string;
  /** FICTIONAL record of when an as-needed procedure was done. */
  done?: { day: DayOffset; time: string }[];
}

// ---------- Results ----------

export interface LabResult {
  day: DayOffset;
  time: string;
  values: Record<string, number>; // keyed by analyte code
  /** Set when the laboratory confirmed it in this session: the specimen label code, who and when. */
  id?: string;
  reportedBy?: string;
  reportedAt?: { day: DayOffset; time: string };
  /** Set when the laboratory corrected the values (訂正): the version now shown, why, and the values it replaced. */
  corrected?: { version: number; reason: string; by: string; at: { day: DayOffset; time: string }; before: Record<string, number> };
}

/** The steps the laboratory reports a culture in (塗抹 = グラム染色). */
export type CultureStage = "塗抹" | "中間報告" | "最終報告";

export interface CultureResult {
  /** The label code of a sample taken in during this session (keeps two cultures of one specimen and day apart). */
  id?: string;
  collectedOn: DayOffset;
  specimen: string;
  sets?: string;
  status: "培養中" | "中間報告" | "最終報告";
  /** The step the laboratory reported last in this session (塗抹 and 中間報告 are both status 中間報告). */
  stage?: CultureStage;
  /** Each step reported in this session: who and when, in one line. */
  log?: { stage: CultureStage; by: string; day: DayOffset; time: string; text: string }[];
  reportedOn?: DayOffset;
  /** Clock time of the report ("HH:MM"), when known. */
  reportedTime?: string;
  organism?: string;
  gram?: string;
  susceptibility?: { drug: string; mic: string; result: "S" | "I" | "R" }[];
}

export interface ImagingStudy {
  id: string;
  day: DayOffset;
  modality: "X線" | "CT" | "MRI" | "超音波";
  region: string;
  report: string;
  reader: string;
  /** 部位マスターのコード（画像検査オーダーから作った検査）。 */
  regionCode?: string;
  /** X線の撮影方向（例：["立位正面（PA）", "側面"]）。 */
  views?: string[];
  /** CT・MRI の造影（単純・造影・単純＋造影・放射線科一任）。 */
  contrast?: string;
  /** 撮影の時刻 "HH:MM"。 */
  time?: string;
  /** まだ撮影していない（予約中）。画像はない。 */
  pending?: boolean;
}
