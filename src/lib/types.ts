// Domain types for the ward chart. All patient data in this app is fictional.

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
  order: Order;
}

// ---------- Orders ----------

export type Order = InjectionOrder | LabOrder;

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
  modality: "X線" | "CT" | "超音波";
  region: string;
  report: string;
  reader: string;
}
