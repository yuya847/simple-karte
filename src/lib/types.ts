// Domain types for the ward chart. All patient data in this app is fictional.

import type { AreaClass, O2Device, ProcSchedule, UlcerDepth } from "./procedures";
import type { ImagingOrder, PhysioOrder } from "./exams";

export type { ImagingOrder, PhysioOrder } from "./exams";

/** Day offset from "today" (0 = today, -1 = yesterday). Dates are resolved at runtime. */
export type DayOffset = number;

export type Sex = "男" | "女";

export interface Patient {
  id: string;
  name: string;
  kana: string;
  sex: Sex;
  age: number;
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
  infections: string[];
  cautions: string[];
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
  kind: "note";
  day: DayOffset;
  time: string; // "HH:MM"
  author: string;
  role: "医師" | "看護師" | "薬剤師" | "検査室";
  /** SOAP sections, or a single free-text body. */
  soap?: { s?: string; o?: string; a?: string; p?: string };
  text?: string;
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
}

export type LabPriority = "定時" | "至急";

export interface LabOrder {
  type: "lab";
  /** Lab test codes or set codes from the master. */
  codes: string[];
  collect: { day: DayOffset; time: string };
  priority: LabPriority;
  comment?: string;
}

/** When oral drugs are taken. The clock time of each is a ward rule (see master.ts). */
export type DoseTiming = "朝" | "昼" | "夕" | "眠前";

export interface PrescriptionOrder {
  type: "prescription";
  /** 定期 = regular, 臨時 = one-off/short, 持参薬 = the patient's own drugs brought from home. */
  category: "定期" | "臨時" | "持参薬";
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
}

export interface CultureResult {
  collectedOn: DayOffset;
  specimen: string;
  sets?: string;
  status: "培養中" | "中間報告" | "最終報告";
  reportedOn?: DayOffset;
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
}
