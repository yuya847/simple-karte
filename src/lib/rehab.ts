import type { ExecutionCancellation } from "./mar";
// リハビリテーション部 of the fictional hospital: the doctors' リハビリ処方 (procedures.ts PROC-REHAB) are booked
// with a therapist (療法士の予約), taken in (受付), done and recorded with their start and end (実施記録), counted
// in units (疾患別リハビリテーション料：20分以上の個別療法で1単位), checked against the limits of the 告示 and
// the 通知 (患者1日6単位、従事者1日18単位を標準・24単位まで・週108単位), the days from the 起算日 (標準的算定
// 日数、早期リハビリテーション加算、休日リハビリテーション加算) and the 実施計画書 (別紙様式21). Code counts and
// shows the rule it read; the therapist and the doctor decide. Therapists, bookings and records are fictional.

import { biOf, biTotal, type BiEval } from "./barthel";
import { addDays, minutesOf, type CalendarDate } from "./dates";
import { isHoliday } from "./er";
import { examAt } from "./exams";
import { abs } from "./flowsheet";
import type { DayOffset, OrderEntry, Patient, RehabOrder } from "./types";

export type Discipline = "PT" | "OT" | "ST";
export const DISCIPLINE_NAME: Record<Discipline, string> = { PT: "理学療法", OT: "作業療法", ST: "言語聴覚療法" };

export interface Therapist {
  name: string;
  discipline: Discipline;
}

/** The therapists of the fictional hospital (架空). */
export const THERAPISTS: Therapist[] = [
  { name: "理学療法士 木村", discipline: "PT" },
  { name: "理学療法士 斎藤", discipline: "PT" },
  { name: "作業療法士 森田", discipline: "OT" },
  { name: "言語聴覚士 林", discipline: "ST" },
];

export const REHAB_RULES = {
  hours: "予約の枠は 9:00〜17:00 の20分ごと。",
  place: "訓練室か病棟（ベッドサイドを含む）で行います。",
  booking: "予約は療法士が入れます。同じ療法士・同じ患者の時間の重なりと、同じ時間の検査（画像・生理検査）を知らせます。",
};

// ---------------------------------------------------------------------------
// 出典（告示・通知）
// ---------------------------------------------------------------------------

export const REHAB_SOURCES = {
  kokuji: { label: "診療報酬の算定方法 別表第一 医科診療報酬点数表（令和8年）第2章 第7部 リハビリテーション 通則4・H000〜H003（標準的算定日数・早期リハビリテーション加算・休日リハビリテーション加算・点数）", url: "https://www.mhlw.go.jp/content/12400000/001686842.pdf" },
  tsuchi: { label: "診療報酬の算定方法の一部改正に伴う実施上の留意事項について（令和8年3月5日 保医発0305第6号）別添1 第7部 通則3・4・5・5の2・7・9・10、H001 (9)(11)", url: "https://www.mhlw.go.jp/content/12400000/001757385.pdf" },
  form: { label: "同 様式（医科）別紙様式21「リハビリテーション実施計画書」", url: "https://www.mhlw.go.jp/content/12400000/001713885.pdf" },
  facility: { label: "特掲診療料の施設基準等及びその届出に関する手続きの取扱いについて（令和8年3月5日 保医発0305第8号）第41の4（廃用症候群リハビリテーション料(Ⅲ)は脳血管疾患等リハビリテーション料(Ⅲ)の届出でよい）", url: "https://www.mhlw.go.jp/content/12400000/001757367.pdf" },
};

// ---------------------------------------------------------------------------
// 疾患別リハビリテーション料の区分（告示 H000〜H003）と、この架空の病院の届出（billing/facility.ts）
// ---------------------------------------------------------------------------

export interface RehabCategory {
  field: RehabOrder["field"];
  kubun: string;
  name: string;
  standardDays: number;
  /** 標準的算定日数を数える起点. */
  countFrom: "onset" | "treatment";
  countFromText: string;
  /** この架空の病院が算定できる区分と1単位の点数（届け出ていなければ null）. */
  tier: { name: string; points: number } | null;
}

export const REHAB_CATEGORIES: RehabCategory[] = [
  { field: "心大血管疾患", kubun: "H000", name: "心大血管疾患リハビリテーション料", standardDays: 150, countFrom: "treatment", countFromText: "治療開始日から150日", tier: null },
  { field: "脳血管疾患等", kubun: "H001", name: "脳血管疾患等リハビリテーション料", standardDays: 180, countFrom: "onset", countFromText: "発症・手術・急性増悪または最初に診断された日から180日", tier: { name: "（Ⅲ）", points: 100 } },
  { field: "廃用症候群", kubun: "H001-2", name: "廃用症候群リハビリテーション料", standardDays: 120, countFrom: "onset", countFromText: "廃用症候群の診断または急性増悪から120日", tier: { name: "（Ⅲ）", points: 77 } },
  { field: "運動器", kubun: "H002", name: "運動器リハビリテーション料", standardDays: 150, countFrom: "onset", countFromText: "発症・手術・急性増悪または最初に診断された日から150日", tier: { name: "（Ⅰ）", points: 185 } },
  { field: "呼吸器", kubun: "H003", name: "呼吸器リハビリテーション料", standardDays: 90, countFrom: "treatment", countFromText: "治療開始日から90日", tier: { name: "（Ⅰ）", points: 175 } },
];

export const categoryOf = (f: RehabOrder["field"]) => REHAB_CATEGORIES.find((c) => c.field === f)!;

export const FACILITY_NOTE =
  "この病院の届出（算定の設定 billing/facility.ts）は、脳血管疾患等（Ⅲ）・運動器（Ⅰ）・呼吸器（Ⅰ）です。廃用症候群（Ⅲ）は脳血管疾患等（Ⅲ）の届出で算定できます。心大血管疾患は届け出ていません。初期加算・急性期リハビリテーション加算の届出もありません。";

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface Stamp {
  day: DayOffset;
  time: string;
  by: string;
}

export type RehabPlace = "訓練室" | "病棟（ベッドサイド）";

export interface RehabBooking {
  id: string;
  orderId: string;
  patientId: string;
  therapist: string;
  discipline: Discipline;
  day: DayOffset;
  start: string;
  minutes: number;
  place: RehabPlace;
  by: string;
}

export interface RehabSession {
  cancellations?: ExecutionCancellation[];
  id: string;
  bookingId?: string;
  orderId: string;
  patientId: string;
  therapist: string;
  discipline: Discipline;
  day: DayOffset;
  /** 受付（来室した、または病棟へ向かった）. */
  arrived?: Stamp;
  /** 実施時刻（開始時刻と終了時刻、通則3）. */
  start?: string;
  end?: string;
  place: RehabPlace;
  /** 機能訓練の内容の要点（通則3）. */
  content?: string;
  notDone?: Stamp & { reason: string };
  recordedAt?: Stamp;
}

export type BasicLevel = "自立" | "一部介助" | "介助" | "非実施";
export const BASIC_ITEMS = ["寝返り", "起き上がり", "立ち上がり", "座位保持", "立位保持"] as const;

/** 心身機能・構造 of 別紙様式21 (the items; 該当する項目のみ記載). */
export const BODY_ITEMS = [
  "意識障害",
  "呼吸機能障害",
  "循環障害",
  "危険因子",
  "摂食嚥下障害",
  "栄養障害",
  "排泄機能障害",
  "褥瘡",
  "疼痛",
  "関節可動域制限",
  "拘縮・変形",
  "筋力低下",
  "運動機能障害",
  "筋緊張異常",
  "感覚機能障害",
  "音声・発話障害",
  "高次脳機能障害",
  "精神行動障害",
  "見当識障害",
  "記憶障害",
  "発達障害",
  "認知症",
  "その他",
] as const;

/** リハビリテーション実施計画書（別紙様式21 の主な欄）. */
export interface RehabPlan {
  id: string;
  orderId: string;
  patientId: string;
  /** 算定病名. */
  diagnosis: string;
  /** 治療内容（手術を行った場合は、術式を含む）. */
  treatment: string;
  onsetDay: DayOffset;
  surgeryDay?: DayOffset;
  startDay: DayOffset;
  comorbidities: string;
  /** 安静度・リスク. */
  risks: string;
  /** 禁忌・特記事項. */
  contraindications: string;
  /** 心身機能・構造: the items that apply, with their detail (客観的評価も). */
  body: Partial<Record<(typeof BODY_ITEMS)[number], string>>;
  basic: Partial<Record<(typeof BASIC_ITEMS)[number], BasicLevel>>;
  /** 日常生活活動（BI）の開始時と現在の評価（BiEval の id）. */
  biStartId?: string;
  biNowId?: string;
  /** 社会保障サービスの申請状況（該当する場合）. */
  social: string;
  goalMonth: string;
  goalEnd: string;
  /** 治療方針（リハビリテーション実施方針）. */
  policy: string;
  /** 治療内容（リハビリテーション実施内容）: 理学療法・作業療法・言語聴覚療法. */
  content: Partial<Record<Discipline, string>>;
  /** 作成（医師）と、作成に関わった療法士（記名）. */
  madeBy: Stamp;
  staff: string[];
  /** 説明日・説明者・相手（写しは診療録に添付。患者等の署名は不要）. */
  explained?: Stamp & { to: string };
  /** 前の版の id（3か月ごとの見直し）. */
  replaces?: string;
}

export interface RehabDesk {
  bookings: RehabBooking[];
  sessions: RehabSession[];
  bi: BiEval[];
  plans: RehabPlan[];
  /** 1日9単位の対象（別に厚生労働大臣が定める患者）と医師が判断した患者. */
  nine: Record<string, Stamp>;
}

export const EMPTY_REHAB: RehabDesk = { bookings: [], sessions: [], bi: [], plans: [], nine: {} };

// ---------------------------------------------------------------------------
// 単位（通則5）と上限（告示 通則4・通知 通則5の2・7）
// ---------------------------------------------------------------------------

/** 1単位 = 20分以上の個別療法. Minutes from start to end (only the time of direct training counts). */
export function unitsOf(start: string | undefined, end: string | undefined): { minutes: number; units: number } {
  if (!start || !end) return { minutes: 0, units: 0 };
  const minutes = Math.max(0, minutesOf(end) - minutesOf(start));
  return { minutes, units: Math.floor(minutes / 20) };
}

export const UNIT_RULE = "1単位は患者に20分以上の個別療法として訓練を行った場合。計画書の作成・説明・記録・移動の時間は含みません（留意事項通知 第7部 通則5）。";

/** What 実施を記録 still needs (shown beside the button while it is disabled): 受付, both times, 20 minutes, the content. */
export function sessionProblems(x: { arrived: boolean; start: string; end: string; content: string }): string[] {
  const out: string[] = [];
  if (!x.arrived) out.push("受付がまだです");
  if (!x.start || !x.end) out.push("開始と終了の時刻を入れてください");
  else if (unitsOf(x.start, x.end).units === 0) out.push("20分に満たないので単位になりません（基本診療料に含まれます）");
  if (!x.content.trim()) out.push("訓練の内容の要点を書いてください");
  return out;
}

export const doneSessions = (desk: RehabDesk, patientId?: string) => desk.sessions.filter((s) => s.recordedAt && !s.notDone && (!patientId || s.patientId === patientId));

export interface DayUnits {
  day: DayOffset;
  units: number;
  limit: 6 | 9;
  /** Units over the patient's daily limit (算定できない分). */
  over: number;
}

/** The patient's units by day, against 1日6単位 (or 9 for the patients the doctor marked). */
export function patientDayUnits(desk: RehabDesk, patientId: string): DayUnits[] {
  const by = new Map<number, number>();
  for (const s of doneSessions(desk, patientId)) by.set(s.day, (by.get(s.day) ?? 0) + unitsOf(s.start, s.end).units);
  const limit = desk.nine[patientId] ? 9 : 6;
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([day, units]) => ({ day, units, limit, over: Math.max(0, units - limit) }));
}

export interface TherapistLoad {
  therapist: string;
  day: number;
  week: number;
  /** 18単位を標準、24単位を上限（1日）、108単位まで（週）. */
  notes: string[];
}

/** One therapist's units for a day and the week up to that day (Monday to Sunday), against 通知 第7部 通則5の2. */
export function therapistLoad(desk: RehabDesk, therapist: string, day: DayOffset, today: CalendarDate, extra = 0): TherapistLoad {
  const dow = (d: number) => {
    const c = addDays(today, d);
    return (new Date(Date.UTC(c.y, c.m - 1, c.d)).getUTCDay() + 6) % 7; // 月曜=0
  };
  const monday = day - dow(day);
  const units = (d: number) => desk.sessions.filter((s) => s.therapist === therapist && s.day === d && !s.notDone).reduce((n, s) => n + unitsOf(s.start, s.end).units, 0);
  const dayUnits = units(day) + extra;
  let week = extra;
  for (let d = monday; d <= day; d++) week += units(d);
  const notes = [dayUnits > 24 ? `1日 ${dayUnits}単位：上限の24単位を超えます。` : dayUnits > 18 ? `1日 ${dayUnits}単位：標準の18単位を超えています（上限24単位）。` : "", week > 108 ? `週 ${week}単位：108単位を超えます。` : ""].filter(Boolean);
  return { therapist, day: dayUnits, week, notes };
}

// ---------------------------------------------------------------------------
// 日数：標準的算定日数・早期リハビリテーション加算・休日リハビリテーション加算
// ---------------------------------------------------------------------------

/** The first day treatment was given (治療開始日), or the order's first day when none yet. */
export function treatmentStart(desk: RehabDesk, orderId: string, fallback: DayOffset): DayOffset {
  const days = desk.sessions.filter((s) => s.orderId === orderId && s.recordedAt && !s.notDone).map((s) => s.day);
  return days.length ? Math.min(...days) : fallback;
}

export interface DayCount {
  /** 起算日 for the 標準的算定日数. */
  from: DayOffset;
  fromText: string;
  dayNo: number;
  left: number;
  over: boolean;
}

/** 標準的算定日数: day N counted from the category's start (the start day is day 1). */
export function standardDays(o: RehabOrder, desk: RehabDesk, orderId: string, orderStart: DayOffset, day: DayOffset): DayCount {
  const c = categoryOf(o.field);
  const from = c.countFrom === "onset" ? o.onset : treatmentStart(desk, orderId, orderStart);
  const dayNo = day - from + 1;
  return { from, fromText: c.countFromText, dayNo, left: c.standardDays - dayNo, over: dayNo > c.standardDays };
}

export interface EarlyAddition {
  /** Day of the admission it is counted from (入院した日。転院してきた患者は転院前の最初の入院日). */
  from: DayOffset;
  dayNo: number;
  /** 1単位につき：1〜3日目 60点、4〜14日目 25点、15日目から なし. */
  points: 60 | 25 | 0;
  until: DayOffset;
}

/**
 * 早期リハビリテーション加算（令和8年の告示 H000〜H003 注2）: inpatients, counted from the day of admission
 * (入院した日から起算して14日を限度、4日目以降は1単位25点). A transferred patient counts from the first hospital.
 */
export function earlyAddition(admittedOn: DayOffset, day: DayOffset, firstAdmission?: DayOffset): EarlyAddition {
  const from = firstAdmission ?? admittedOn;
  const dayNo = day - from + 1;
  return { from, dayNo, points: dayNo >= 1 && dayNo <= 3 ? 60 : dayNo >= 4 && dayNo <= 14 ? 25 : 0, until: from + 13 };
}

export const EARLY_NOTE =
  "早期リハビリテーション加算は、入院中の患者に1単位以上の個別療法を行った日に、入院した日から起算して14日まで（1〜3日目は1単位60点、4日目からは25点）。他の病院から転院してきた患者は転院前の最初の病院に入院した日から数えます。病棟（ベッドサイドを含む）で行っても算定できます。別表第九の五 第三・四・六・七号、別表第九の七 第三号の患者（手術・急性増悪したものを除く）は算定できないので、当たるかを医師が確かめます。";

/** 土曜日・日曜日・祝日と、1月2日・3日・12月29〜31日（留意事項通知 第7部 通則10）. */
export function isRehabHoliday(date: CalendarDate): boolean {
  const dow = new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay();
  return dow === 0 || dow === 6 || isHoliday(date.y, date.m, date.d);
}

/**
 * 休日リハビリテーション加算（注5）の期間の終わり: 脳血管・廃用・運動器は発症・手術・急性増悪から30日目まで、
 * 心大血管・呼吸器は「発症・手術・急性増悪から7日目」と「治療開始日」の早いほうから30日目まで.
 */
export function holidayUntil(o: RehabOrder, treatment: DayOffset): DayOffset {
  const c = categoryOf(o.field);
  const from = c.countFrom === "treatment" ? Math.min(o.onset + 6, treatment) : o.onset;
  return from + 29;
}

// ---------------------------------------------------------------------------
// 実施計画書の期限（通則4：開始後原則7日以内、遅くとも14日以内。3か月に1回以上説明・交付）
// ---------------------------------------------------------------------------

export interface PlanState {
  plan: RehabPlan | null;
  /** 原則の期限（開始後7日以内）と、遅くとも（14日以内）. */
  dueBy: DayOffset;
  lastBy: DayOffset;
  state: "作成済み・説明済み" | "作成済み・説明まだ" | "作成まだ（期限内）" | "作成まだ（原則の7日を過ぎた）" | "作成まだ（14日を過ぎた）" | "見直しの時期（3か月）" | "リハビリ開始前";
}

export function planState(desk: RehabDesk, orderId: string, started: DayOffset | null, today: DayOffset): PlanState {
  const plans = desk.plans.filter((p) => p.orderId === orderId).sort((a, b) => b.madeBy.day - a.madeBy.day || b.madeBy.time.localeCompare(a.madeBy.time));
  const plan = plans[0] ?? null;
  const base = started ?? today;
  const dueBy = base + 6;
  const lastBy = base + 13;
  if (plan) {
    const since = plan.explained ? today - plan.explained.day : 0;
    return { plan, dueBy, lastBy, state: !plan.explained ? "作成済み・説明まだ" : since >= 90 ? "見直しの時期（3か月）" : "作成済み・説明済み" };
  }
  if (started === null) return { plan, dueBy, lastBy, state: "リハビリ開始前" };
  return { plan, dueBy, lastBy, state: today > lastBy ? "作成まだ（14日を過ぎた）" : today > dueBy ? "作成まだ（原則の7日を過ぎた）" : "作成まだ（期限内）" };
}

export const PLAN_NOTE =
  "医師は、定期的な機能検査などをもとに効果判定を行い、別紙様式21 またはこれに準じた実施計画書を、リハビリテーション開始後原則として7日以内、遅くとも14日以内に作成します。作成時とその後3か月に1回以上、医師または医師の指示を受けた看護師・療法士が患者または家族等に説明の上交付し、写しを診療録に添付します。説明日・説明者を書きます。患者等の署名は要りません。計画書の作成前は、医師が自ら行うか医師の具体的な指示があった場合に限り算定できます（留意事項通知 第7部 通則4）。";

export function planProblems(p: Omit<RehabPlan, "id" | "madeBy">): string[] {
  return [
    !p.diagnosis.trim() && "算定病名を書いてください。",
    !p.goalMonth.trim() && "目標（今後1か月以内）を書いてください。",
    !p.policy.trim() && "治療方針（リハビリテーション実施方針）を書いてください。",
    !Object.values(p.content).some((v) => v?.trim()) && "治療内容（理学療法・作業療法・言語聴覚療法のいずれか）を書いてください。",
    !p.biNowId && "日常生活活動（BI）の評価を選んでください（BI か FIM のいずれかを必ず記載）。",
  ].filter((x): x is string => !!x);
}

// ---------------------------------------------------------------------------
// Rows: who has a リハビリ処方, and the bookings
// ---------------------------------------------------------------------------

export interface RehabRx {
  orderId: string;
  patientId: string;
  name: string;
  room: string;
  admittedOn: DayOffset;
  order: RehabOrder;
  /** 処方の開始日. */
  startDay: DayOffset;
  orderedBy: string;
  orderedAt: { day: DayOffset; time: string };
}

type Person = { patient: Pick<Patient, "id" | "name" | "admittedOn">; room: string; entries: OrderEntry[] };

/** The patients with an active リハビリ処方 (PROC-REHAB). */
export function rehabPrescriptions(people: Person[]): RehabRx[] {
  return people.flatMap((x) =>
    x.entries.flatMap((e) =>
      e.order.type === "procedure" && e.order.code === "PROC-REHAB" && e.order.rehab && e.status !== "中止"
        ? [{ orderId: e.id, patientId: x.patient.id, name: x.patient.name, room: x.room, admittedOn: x.patient.admittedOn, order: e.order.rehab, startDay: e.order.start.day, orderedBy: e.author, orderedAt: { day: e.day, time: e.time } }]
        : [],
    ),
  );
}

const overlap = (aDay: number, aStart: string, aMin: number, bDay: number, bStart: string, bMin: number) => aDay === bDay && minutesOf(aStart) < minutesOf(bStart) + bMin && minutesOf(bStart) < minutesOf(aStart) + aMin;

/** What overlaps a booking: the same therapist, the same patient, or the patient's imaging or physiological test. */
export function bookingClashes(desk: RehabDesk, b: Omit<RehabBooking, "id" | "by">, patientEntries: OrderEntry[], ignoreId?: string): string[] {
  const out: string[] = [];
  for (const x of desk.bookings) {
    if (x.id === ignoreId || x.day !== b.day) continue;
    if (x.therapist === b.therapist && overlap(x.day, x.start, x.minutes, b.day, b.start, b.minutes)) out.push(`${b.therapist}は ${x.start} から別の予約があります。`);
    else if (x.patientId === b.patientId && overlap(x.day, x.start, x.minutes, b.day, b.start, b.minutes)) out.push(`この患者は ${x.start} から ${x.therapist} の予約があります。`);
  }
  for (const e of patientEntries) {
    if ((e.order.type !== "imaging" && e.order.type !== "physio") || e.status === "中止") continue;
    const at = examAt(e.order, abs(e.day, e.time));
    const day = Math.floor(at / 1440);
    const m = at - day * 1440;
    const t = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    if (overlap(day, t, 30, b.day, b.start, b.minutes)) out.push(`この患者は ${t} に${e.order.type === "imaging" ? "画像検査" : "生理検査"}の予定があります。`);
  }
  return out;
}

export const SLOT_TIMES: string[] = Array.from({ length: 24 }, (_, i) => {
  const m = 9 * 60 + i * 20;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});

/** The patient's progress for the doctor: units by day, BI by date, the plan, and the day counts today. */
export function progressOf(desk: RehabDesk, rx: RehabRx, today: DayOffset) {
  const started = desk.sessions.some((s) => s.orderId === rx.orderId && s.recordedAt && !s.notDone) ? treatmentStart(desk, rx.orderId, rx.startDay) : null;
  const bi = biOf(desk.bi, rx.patientId).map((e) => ({ ...e, total: biTotal(e.scores) }));
  return {
    units: patientDayUnits(desk, rx.patientId),
    sessions: doneSessions(desk, rx.patientId).filter((s) => s.orderId === rx.orderId),
    bi,
    plan: planState(desk, rx.orderId, started, today),
    standard: standardDays(rx.order, desk, rx.orderId, rx.startDay, today),
    early: earlyAddition(rx.admittedOn, today),
    started,
  };
}

// ---------------------------------------------------------------------------
// Fictional orders and records of this demo
// ---------------------------------------------------------------------------

/** リハビリ処方 for two fictional ward patients (merged into their records like the other demo orders). */
export function demoRehabOrders(): Record<string, OrderEntry[]> {
  const DR = "山本（専攻医）";
  const rx = (id: string, day: DayOffset, start: DayOffset, rehab: RehabOrder): OrderEntry => ({ kind: "order", id, day, time: "16:00", author: DR, status: "有効", order: { type: "procedure", code: "PROC-REHAB", rehab, schedule: { kind: "per_day", count: 1 }, start: { day: start } } });
  return {
    // 大浦さん（86歳、誤嚥性肺炎、入院2日目）: 呼吸器リハ（PT・ST）を今日から
    "90010244": [rx("o-rehab-demo1", -1, 0, { field: "呼吸器", therapists: ["PT", "ST"], onset: -1, goal: "病棟内を見守りで歩ける・むせずに食事がとれる", cautions: "SpO2 90%未満で中止。食事は医師の指示の形態" })],
    // 北村さん（79歳、心不全、入院6日目）: 安静による廃用症候群（PT）
    "90010198": [rx("o-rehab-demo2", -4, -3, { field: "廃用症候群", therapists: ["PT"], onset: -4, goal: "自宅のトイレまで歩ける", cautions: "HR 120/分以上・SBP 90mmHg未満・息切れの増強で中止。体重増加に注意" })],
  };
}

const S = (day: DayOffset, time: string, by: string): Stamp => ({ day, time, by });

/** 北村さんは3日前から PT を受け、BI と計画書がある。今日の予約は2人分。 */
export function initialRehabDesk(): RehabDesk {
  const PT = "理学療法士 木村";
  const past = [-3, -2, -1].map<RehabSession>((d, i) => ({
    id: `rs-demo-${i + 1}`,
    orderId: "o-rehab-demo2",
    patientId: "90010198",
    therapist: PT,
    discipline: "PT",
    day: d,
    arrived: S(d, "10:55", PT),
    start: "11:00",
    end: "11:40",
    place: d === -3 ? "病棟（ベッドサイド）" : "訓練室",
    content: d === -3 ? "初回評価（BI・基本動作）。端座位の保持、立ち上がりの練習" : d === -2 ? "立ち上がり・足踏み・平行棒内歩行。息切れ Borg 13" : "歩行器で病棟内30m。下肢筋力の練習",
    recordedAt: S(d, "11:50", PT),
  }));
  const bi = (id: string, day: DayOffset, scores: Record<string, number>): BiEval => ({ id, patientId: "90010198", day, time: "11:45", by: PT, scores });
  return {
    bookings: [
      { id: "rb-demo-1", orderId: "o-rehab-demo2", patientId: "90010198", therapist: PT, discipline: "PT", day: 0, start: "11:00", minutes: 40, place: "訓練室", by: PT },
      { id: "rb-demo-2", orderId: "o-rehab-demo1", patientId: "90010244", therapist: "理学療法士 斎藤", discipline: "PT", day: 0, start: "10:00", minutes: 40, place: "病棟（ベッドサイド）", by: "理学療法士 斎藤" },
      { id: "rb-demo-3", orderId: "o-rehab-demo1", patientId: "90010244", therapist: "言語聴覚士 林", discipline: "ST", day: 0, start: "14:00", minutes: 20, place: "病棟（ベッドサイド）", by: "言語聴覚士 林" },
      { id: "rb-demo-4", orderId: "o-rehab-demo2", patientId: "90010198", therapist: PT, discipline: "PT", day: 1, start: "11:00", minutes: 40, place: "訓練室", by: PT },
    ],
    sessions: past,
    bi: [bi("bi-demo-1", -3, { eat: 10, transfer: 10, groom: 5, toilet: 5, bath: 0, walk: 5, stairs: 0, dress: 5, bowel: 10, bladder: 5 }), bi("bi-demo-2", -1, { eat: 10, transfer: 10, groom: 5, toilet: 5, bath: 0, walk: 10, stairs: 0, dress: 5, bowel: 10, bladder: 10 })],
    plans: [
      {
        id: "rp-demo-1",
        orderId: "o-rehab-demo2",
        patientId: "90010198",
        diagnosis: "廃用症候群（慢性心不全の急性増悪による安静）",
        treatment: "利尿薬による心不全の治療",
        onsetDay: -4,
        startDay: -3,
        comorbidities: "慢性心不全、慢性腎臓病",
        risks: "病棟内歩行まで。HR 120/分以上・SBP 90mmHg 未満で中止",
        contraindications: "過度の水分摂取を避ける",
        body: { 循環障害: "EF は心エコーの結果待ち", 筋力低下: "両下肢 MMT 4", 呼吸機能障害: "労作時の息切れ" },
        basic: { 寝返り: "自立", 起き上がり: "自立", 立ち上がり: "一部介助", 座位保持: "自立", 立位保持: "一部介助" },
        biStartId: "bi-demo-1",
        biNowId: "bi-demo-1",
        social: "要介護認定は未申請（申請が必要な可能性あり）",
        goalMonth: "病棟内を歩行器で自立して歩ける",
        goalEnd: "自宅のトイレまで歩ける。退院先：自宅",
        policy: "心不全の状態を見ながら、離床と下肢筋力・歩行の練習を段階的に進める",
        content: { PT: "起居・立ち上がり・歩行の練習、下肢筋力の練習（1日40分）" },
        madeBy: S(-3, "16:30", "山本（専攻医）"),
        staff: [PT],
        explained: { ...S(-2, "11:45", PT), to: "患者本人" },
      },
    ],
    nine: {},
  };
}
