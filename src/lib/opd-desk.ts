// 外来の受付 of the FICTIONAL hospital: 診察券, 受付（初診・再診・予約）, 受付番号, 予約の枠（診療科・医師ごと）,
// the order of the 診察 and the waiting-room display (番号だけ), the 再来受付機 (模擬: no machine and no card
// reader are connected), and 会計の呼出. All people, cards and rules here are fictional.

import { minutesOf } from "./dates";
import type { OpdPatient } from "./opd";
import type { DayOffset, Sex } from "./types";

// ---------------------------------------------------------------------------
// 診察室と予約の枠（架空の病院の取り決め）
// ---------------------------------------------------------------------------

export interface Clinic {
  dept: string;
  doctor: string;
  room: string;
  /** Weekdays with a clinic (0 = 日 … 6 = 土). */
  days: number[];
  /** Morning (and afternoon) hours, "HH:MM" to "HH:MM" (the last slot starts before the end). */
  sessions: [string, string][];
  /** Minutes per slot, and how many patients one slot takes. */
  minutes: number;
  capacity: number;
}

export const CLINICS: Clinic[] = [
  { dept: "総合診療科", doctor: "山本（専攻医）", room: "診察室1", days: [1, 2, 3, 4, 5], sessions: [["09:00", "12:00"], ["14:00", "16:00"]], minutes: 15, capacity: 2 },
  { dept: "総合診療科", doctor: "木下（総合診療科 B）", room: "診察室2", days: [1, 3, 5], sessions: [["09:00", "12:00"]], minutes: 15, capacity: 2 },
  { dept: "循環器内科", doctor: "循環器内科 森（架空）", room: "診察室5", days: [1, 2, 3, 4], sessions: [["09:00", "12:00"]], minutes: 15, capacity: 3 },
  { dept: "消化器内科", doctor: "消化器内科 石川（架空）", room: "診察室6", days: [2, 3, 5], sessions: [["09:00", "12:00"]], minutes: 20, capacity: 2 },
  { dept: "整形外科", doctor: "整形外科 長谷川（架空）", room: "診察室8", days: [1, 2, 3, 4, 5], sessions: [["09:00", "12:00"], ["14:00", "16:30"]], minutes: 15, capacity: 3 },
];

export const CLINIC_NOTE = "診察室・外来の曜日と時間・1枠の時間と人数は、架空の病院の取り決めです。";
export const ORDER_NOTE = "診察の順番の目安は、予約の患者は予約の時刻、予約外の患者は受付の時刻の順（架空の病院の取り決め）。呼ぶ患者を決めるのは医師・看護師です。";
export const DISPLAY_NOTE = "待合の表示には受付番号だけを出し、氏名は出しません（架空の病院の取り決め）。";

export const clinicOf = (doctor: string): Clinic | undefined => CLINICS.find((c) => c.doctor === doctor);
export const deptsOf = (): string[] => [...new Set(CLINICS.map((c) => c.dept))];

/** The slot start times of a clinic. */
export function slotTimes(c: Clinic): string[] {
  const out: string[] = [];
  for (const [a, b] of c.sessions)
    for (let m = minutesOf(a); m < minutesOf(b); m += c.minutes) out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  return out;
}

// ---------------------------------------------------------------------------
// 診察券（架空）
// ---------------------------------------------------------------------------

export interface Card {
  cardNo: string;
  name: string;
  kana: string;
  sex: Sex;
  age: number;
}

/** Registered outpatients (fictional). The first ones are today's patients on the 外来 list. */
export const CARDS: Card[] = [
  { cardNo: "1000101", name: "石田 正男", kana: "イシダ マサオ", sex: "男", age: 78 },
  { cardNo: "1000102", name: "原田 恵子", kana: "ハラダ ケイコ", sex: "女", age: 54 },
  { cardNo: "1000105", name: "森田 早苗", kana: "モリタ サナエ", sex: "女", age: 67 },
  { cardNo: "1000106", name: "中谷 修", kana: "ナカタニ オサム", sex: "男", age: 71 },
  { cardNo: "1000107", name: "大西 文雄", kana: "オオニシ フミオ", sex: "男", age: 74 },
  { cardNo: "1000108", name: "三浦 和子", kana: "ミウラ カズコ", sex: "女", age: 69 },
  { cardNo: "1000109", name: "松井 健太", kana: "マツイ ケンタ", sex: "男", age: 45 },
  { cardNo: "1000110", name: "菅野 礼子", kana: "カンノ レイコ", sex: "女", age: 81 },
  { cardNo: "1000111", name: "野田 勝也", kana: "ノダ カツヤ", sex: "男", age: 62 },
  { cardNo: "1000112", name: "宮本 芳江", kana: "ミヤモト ヨシエ", sex: "女", age: 58 },
];

/** 診察券 of today's patients (初診 patients have none until reception). */
export const CARD_OF_OPD: Record<string, string> = { "opd-1": "1000101", "opd-2": "1000102", "opd-5": "1000105", "opd-6": "1000106", "opd-7": "1000107", "opd-8": "1000108", "opd-9": "1000109", "opd-10": "1000110" };

export const cardOf = (p: OpdPatient): string | undefined => p.cardNo ?? CARD_OF_OPD[p.id];

/** A 7-digit 診察券番号. */
export const isCardNo = (s: string): boolean => /^\d{7}$/.test(s);

/** The next number for a new 診察券 (初診). */
export function newCardNo(cards: Card[]): string {
  return String(Math.max(1000100, ...cards.map((c) => Number(c.cardNo))) + 1);
}

/** Today's patients of the other departments (fictional), with 予約. */
export const OTHER_DEPT_TODAY: OpdPatient[] = [
  { id: "opd-7", name: "大西 文雄", kana: "オオニシ フミオ", sex: "男", age: 74, department: "循環器内科", doctor: "循環器内科 森（架空）", slot: "09:30", arrived: "09:10", status: "診察待ち", kind: "再診", reason: "定期受診（心房細動・抗凝固薬）", allergies: [], problems: ["心房細動"], meds: ["アピキサバン錠5mg 1回1錠 1日2回 朝夕食後"], visits: [{ day: -56, text: "脈は整。処方継続。" }] },
  { id: "opd-8", name: "三浦 和子", kana: "ミウラ カズコ", sex: "女", age: 69, department: "循環器内科", doctor: "循環器内科 森（架空）", slot: "10:15", status: "予約", kind: "再診", reason: "ホルター心電図の結果説明", allergies: [], problems: ["動悸"], meds: [], visits: [{ day: -14, text: "ホルター心電図を装着。" }] },
  { id: "opd-9", name: "松井 健太", kana: "マツイ ケンタ", sex: "男", age: 45, department: "整形外科", doctor: "整形外科 長谷川（架空）", slot: "09:15", arrived: "08:55", status: "診察中", kind: "再診", reason: "腰痛の経過", allergies: [], problems: ["腰部脊柱管狭窄症"], meds: [], visits: [{ day: -28, text: "リハビリ継続。" }] },
  { id: "opd-10", name: "菅野 礼子", kana: "カンノ レイコ", sex: "女", age: 81, department: "整形外科", doctor: "整形外科 長谷川（架空）", slot: "10:30", status: "予約", kind: "再診", reason: "骨粗鬆症の注射", allergies: [], problems: ["骨粗鬆症"], meds: [], visits: [{ day: -28, text: "骨密度 YAM 68%。" }] },
];

// ---------------------------------------------------------------------------
// 受付番号と受付
// ---------------------------------------------------------------------------

/** 受付番号 of today's patients: the one given at reception, else in the order of arrival. */
export function tickets(list: OpdPatient[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of list) if (p.ticket) m.set(p.id, p.ticket);
  const used = new Set(m.values());
  let n = 1;
  for (const p of list.filter((x) => x.arrived && !x.ticket).sort((a, b) => a.arrived!.localeCompare(b.arrived!))) {
    while (used.has(n)) n++;
    m.set(p.id, n);
    used.add(n);
  }
  return m;
}

export const nextTicket = (list: OpdPatient[]): number => Math.max(0, ...tickets(list).values()) + 1;
export const ticketLabel = (n: number | undefined): string => (n ? String(n).padStart(3, "0") : "—");

/** 受付: the time, 受付済, and the next 受付番号 (a patient already received keeps theirs). */
export function arrive(list: OpdPatient[], id: string, time: string): OpdPatient[] {
  const p = list.find((x) => x.id === id);
  if (!p || p.arrived) return list;
  const ticket = nextTicket(list);
  return list.map((x) => (x.id === id ? { ...x, arrived: time, status: "受付済", ticket } : x));
}

/** A new outpatient at the window (初診 or 予約外の再診), received now. */
export function receive(
  list: OpdPatient[],
  x: { id: string; card: Card; kind: "初診" | "再診"; dept: string; doctor: string; reason: string; referral?: { facilityId: string; facilityName: string } },
  time: string,
): OpdPatient[] {
  const p: OpdPatient = {
    id: x.id,
    name: x.card.name,
    kana: x.card.kana,
    sex: x.card.sex,
    age: x.card.age,
    department: x.dept,
    doctor: x.doctor,
    slot: null,
    arrived: time,
    status: "受付済",
    kind: x.kind,
    reason: x.reason,
    allergies: [],
    problems: [],
    meds: [],
    visits: [],
    cardNo: x.card.cardNo,
    ticket: nextTicket(list),
    ...(x.referral ? { referral: `${x.referral.facilityName}より（受付で紹介状を確認）`, referralFrom: x.referral.facilityId } : {}),
  };
  return [...list, p];
}

// ---------------------------------------------------------------------------
// 予約
// ---------------------------------------------------------------------------

export interface Booking {
  id: string;
  day: DayOffset;
  time: string;
  dept: string;
  doctor: string;
  cardNo?: string;
  name: string;
  kana: string;
  kind: "初診" | "再診";
  purpose: string;
  by: string;
  at: string;
}

export interface SlotTaken {
  name: string;
  kind: "初診" | "再診";
  from: "今日の外来" | "予約" | "再診予約（カルテ）";
}

export interface Slot {
  time: string;
  capacity: number;
  taken: SlotTaken[];
}

/** Is there a clinic of this doctor on the weekday (0 = 日)? */
export const openOn = (c: Clinic, weekday: number): boolean => c.days.includes(weekday);

/** The slots of one clinic on one day, with who is in each (today's list, bookings, 再診予約 from the charts). */
export function slotsFor(c: Clinic, day: DayOffset, today: OpdPatient[], bookings: Booking[], revisits: { day: number; time: string; name: string; doctor: string }[]): Slot[] {
  return slotTimes(c).map((time) => {
    const end = minutesOf(time) + c.minutes;
    const inSlot = (t: string) => minutesOf(t) >= minutesOf(time) && minutesOf(t) < end;
    const taken: SlotTaken[] = [
      ...(day === 0 ? today.filter((p) => p.doctor === c.doctor && p.slot && inSlot(p.slot)).map((p) => ({ name: p.name, kind: p.kind, from: "今日の外来" as const })) : []),
      ...bookings.filter((b) => b.doctor === c.doctor && b.day === day && inSlot(b.time)).map((b) => ({ name: b.name, kind: b.kind, from: "予約" as const })),
      ...revisits.filter((r) => r.doctor === c.doctor && r.day === day && inSlot(r.time)).map((r) => ({ name: r.name, kind: "再診" as const, from: "再診予約（カルテ）" as const })),
    ];
    return { time, capacity: c.capacity, taken };
  });
}

/** A booking for today goes onto today's 外来 list as 予約. */
export function bookToday(list: OpdPatient[], b: Booking, card?: Card): OpdPatient[] {
  return [
    ...list,
    { id: b.id, name: b.name, kana: b.kana, sex: card?.sex ?? "女", age: card?.age ?? 0, department: b.dept, doctor: b.doctor, slot: b.time, status: "予約", kind: b.kind, reason: b.purpose, allergies: [], problems: [], meds: [], visits: [], ...(b.cardNo ? { cardNo: b.cardNo } : {}) },
  ];
}

// ---------------------------------------------------------------------------
// 診察の順番・呼出・待合の表示
// ---------------------------------------------------------------------------

const WAITING: OpdPatient["status"][] = ["受付済", "診察待ち"];

/** The doctor's waiting patients in the order of the 診察 (予約: the slot; 予約外: the reception time). */
export function queueOf(list: OpdPatient[], doctor: string): OpdPatient[] {
  const t = tickets(list);
  const key = (p: OpdPatient) => minutesOf(p.slot ?? p.arrived ?? "23:59");
  return list.filter((p) => p.doctor === doctor && p.arrived && WAITING.includes(p.status)).sort((a, b) => key(a) - key(b) || (t.get(a.id) ?? 0) - (t.get(b.id) ?? 0));
}

export interface RoomBoard {
  room: string;
  dept: string;
  doctor: string;
  /** 診察中の受付番号. */
  now: number[];
  /** お呼びしている番号 (latest first). */
  calling: number[];
  /** Next in the order (not called yet), up to 4. */
  next: number[];
}

export interface DisplayBoard {
  rooms: RoomBoard[];
  /** 会計: called (お会計の準備ができた) and being prepared. */
  pay: { calling: number[]; preparing: number[] };
}

/** What the waiting-room display shows (numbers only), for the clinics open today. */
export function displayBoard(list: OpdPatient[], weekday: number): DisplayBoard {
  const t = tickets(list);
  const num = (p: OpdPatient) => t.get(p.id) ?? 0;
  const rooms = CLINICS.filter((c) => openOn(c, weekday) || list.some((p) => p.doctor === c.doctor)).map((c) => {
    const q = queueOf(list, c.doctor);
    return {
      room: c.room,
      dept: c.dept,
      doctor: c.doctor,
      now: list.filter((p) => p.doctor === c.doctor && p.status === "診察中").map(num),
      calling: q.filter((p) => p.called).sort((a, b) => b.called!.at.localeCompare(a.called!.at)).map(num),
      next: q.filter((p) => !p.called).slice(0, 4).map(num),
    };
  });
  const paying = list.filter((p) => p.status === "会計待ち");
  return { rooms, pay: { calling: paying.filter((p) => p.payCalled).map(num), preparing: paying.filter((p) => !p.payCalled).map(num) } };
}

/** 診察の呼出: called now (shown on the display until the patient is 診察中). */
export const call = (list: OpdPatient[], id: string, at: string, by: string): OpdPatient[] => list.map((p) => (p.id === id ? { ...p, called: { at, by }, status: p.status === "受付済" ? "診察待ち" : p.status } : p));
/** 会計の呼出. */
export const callToPay = (list: OpdPatient[], id: string, at: string, by: string): OpdPatient[] => list.map((p) => (p.id === id ? { ...p, payCalled: { at, by } } : p));

// ---------------------------------------------------------------------------
// 再来受付機（模擬）
// ---------------------------------------------------------------------------

export type KioskResult =
  | { kind: "受付しました"; patient: OpdPatient; ticket: number }
  | { kind: "受付済み"; patient: OpdPatient; ticket: number }
  | { kind: "今日の予約がありません"; card: Card }
  | { kind: "番号が違います" };

/** What the 再来受付機 does with a 診察券番号: today's 予約 → 受付 (with the next number). */
export function kiosk(list: OpdPatient[], cards: Card[], cardNo: string, time: string): { list: OpdPatient[]; result: KioskResult } {
  const mine = list.filter((p) => cardOf(p) === cardNo);
  const t = tickets(list);
  const done = mine.find((p) => p.arrived);
  if (done) return { list, result: { kind: "受付済み", patient: done, ticket: t.get(done.id) ?? 0 } };
  const booked = mine.find((p) => p.status === "予約");
  if (booked) {
    const next = arrive(list, booked.id, time);
    const p = next.find((x) => x.id === booked.id)!;
    return { list: next, result: { kind: "受付しました", patient: p, ticket: p.ticket! } };
  }
  const card = cards.find((c) => c.cardNo === cardNo);
  return { list, result: card ? { kind: "今日の予約がありません", card } : { kind: "番号が違います" } };
}
