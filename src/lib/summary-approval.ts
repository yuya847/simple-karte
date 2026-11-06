// 退院時サマリーの承認と未作成の一覧. The writer confirms (確定); the team's 指導医 (or, for a 研修医's
// summary, the 上級医) reads and approves it (承認) or sends it back with a comment (差し戻し). Code works
// out each patient's state and the deadline, and counts last month's on-time rate the way the 施設基準
// counts it. Who approves, and that approval is what counts as 提出, are this fictional hospital's rules.

import { addDays, type CalendarDate } from "./dates";
import { SUMMARY_DEADLINE_DAYS, SUMMARY_DEADLINE_URL, type DischargeDraft } from "./discharge";
import { doctorOf, onTeamOf } from "./doctors";
import type { DayOffset } from "./types";

export const SUMMARY_SOURCES = {
  deadline: {
    label: "厚生労働省保険局医療課長通知「基本診療料の施設基準等及びその届出に関する手続きの取扱いについて」（令和8年3月5日 保医発0305第7号）別添3 第4 診療録管理体制加算 1(8)：前月に退院した患者のうち、退院日の翌日から起算して14日以内に退院時要約が作成されて中央病歴管理室に提出された者の割合が毎月9割以上であること。なお、全患者について退院後30日以内に作成されていることが望ましい",
    url: SUMMARY_DEADLINE_URL,
  },
  spec: {
    label: "電子カルテ標準仕様研究会「電子カルテシステム標準仕様書 v1.0」1.03 診療記録 3 サマリー 4「サマリー管理」（作成中・承認待ち・承認済等の進捗管理）・5（未作成サマリの管理）",
    url: "http://hci-bc.com/pdf/StandardSpec_v1body_c.pdf",
  },
};

/** What the sources do not say; this fictional hospital's choices. */
export const SUMMARY_RULES = {
  who: "退院時サマリーは書いた医師が確定し、同じチームの指導医が承認します。研修医が書いたものは、同じチームの上級医（専攻医）か指導医が承認します。指導医が書いたものは確定で承認済になります。書いた本人は承認できません。",
  submit: "承認したときを、中央病歴管理室に提出したときとして数えます。",
};

export type SummaryState = "未作成" | "作成中" | "差し戻し" | "承認待ち" | "承認済";
export const SUMMARY_STATES: SummaryState[] = ["未作成", "作成中", "差し戻し", "承認待ち", "承認済"];

/** The parts of a summary the list needs (a full draft, or a fictional past record). */
export type SummaryRecord = Pick<DischargeDraft, "status" | "confirmedBy" | "confirmedAt" | "approval" | "returned">;

export function summaryState(d: SummaryRecord | undefined): SummaryState {
  if (!d) return "未作成";
  if (d.status === "作成中") return d.returned ? "差し戻し" : "作成中";
  return d.approval ? "承認済" : "承認待ち";
}

/** A 指導医's own summary needs no one else's approval. */
export const approvesOwn = (writer: string) => doctorOf(writer)?.rank === "指導医";

/** The writer confirms: a 指導医's is approved at once (承認不要), anyone else's waits for approval. */
export function confirmSummary<T extends SummaryRecord>(d: T, by: string, at: { day: DayOffset; time: string }): T {
  return { ...d, status: "確定", confirmedBy: by, confirmedAt: at, returned: undefined, approval: approvesOwn(by) ? { by, at, comment: "指導医が作成（承認不要）" } : undefined };
}

/** Why this doctor cannot approve the summary, or null when they can. */
export function approveDeny(name: string, d: SummaryRecord | undefined, attending: string): string | null {
  if (!d || d.status !== "確定") return "まだ確定されていません。";
  if (d.approval) return "承認済みです。";
  if (d.confirmedBy === name) return "自分が書いたサマリーは承認できません。";
  const me = doctorOf(name);
  if (!me || !onTeamOf(name, attending)) return "承認するのは主治医のチームの指導医です。";
  const writerIsResident = doctorOf(d.confirmedBy ?? "")?.rank === "研修医";
  if (me.rank === "指導医") return null;
  if (writerIsResident && me.rank === "専攻医") return null;
  return writerIsResident ? "研修医のサマリーを承認するのは、同じチームの上級医（専攻医）か指導医です。" : "承認するのは同じチームの指導医です。";
}

export const approve = <T extends SummaryRecord>(d: T, by: string, at: { day: DayOffset; time: string }, comment?: string): T => ({ ...d, approval: { by, at, ...(comment ? { comment } : {}) } });

/** 差し戻し: back to the writer as 作成中, with the approver's comment. */
export const sendBack = <T extends SummaryRecord>(d: T, by: string, at: { day: DayOffset; time: string }, comment: string): T => ({ ...d, status: "作成中", approval: undefined, returned: { by, at, comment } });

/** The last day it counts as on time: the day after discharge is day 1 (施設基準：退院日の翌日から起算して14日以内). */
export const dueDay = (dischargeDay: DayOffset) => dischargeDay + SUMMARY_DEADLINE_DAYS;

/** The day it counts as submitted (承認), or null. */
export const submittedDay = (d: SummaryRecord | undefined): DayOffset | null => d?.approval?.at.day ?? null;

export interface SummaryRow {
  /** The patient's id (with a chart), or the fictional past record's. */
  id: string;
  name: string;
  department: string;
  attending: string;
  dischargeDay: DayOffset;
  state: SummaryState;
  due: DayOffset;
  /** Days left until the due day (negative: past it). Null once submitted. */
  left: number | null;
  /** Submitted after the due day, or not submitted and the due day has passed. */
  late: boolean;
  record?: SummaryRecord;
  /** Opens in the chart (false: a fictional past record without a chart in this prototype). */
  chart: boolean;
}

export interface PastSummary {
  id: string;
  name: string;
  department: string;
  attending: string;
  dischargeDay: DayOffset;
  record?: SummaryRecord;
}

/** One row per discharge: the patients with charts (discharged, or with a confirmed summary) and the past record. */
export function summaryRows(patients: { id: string; name: string; department: string; attending: string; dischargedAt?: { day: DayOffset } }[], drafts: Record<string, DischargeDraft>, past: PastSummary[], today: DayOffset = 0): SummaryRow[] {
  const row = (id: string, name: string, department: string, attending: string, dischargeDay: DayOffset, record: SummaryRecord | undefined, chart: boolean): SummaryRow => {
    const due = dueDay(dischargeDay);
    const sub = submittedDay(record);
    return { id, name, department, attending, dischargeDay, state: summaryState(record), due, left: sub === null ? due - today : null, late: sub === null ? today > due : sub > due, record, chart };
  };
  const live = patients.flatMap((p) => {
    const d = drafts[p.id];
    if (!p.dischargedAt && !(d && d.status === "確定")) return [];
    return [row(p.id, p.name, p.department, p.attending, p.dischargedAt?.day ?? d!.dischargeDay, d, true)];
  });
  return [...live, ...past.map((x) => row(x.id, x.name, x.department, x.attending, x.dischargeDay, x.record, false))].sort((a, b) => Number(b.late) - Number(a.late) || (a.left ?? 999) - (b.left ?? 999) || b.dischargeDay - a.dischargeDay);
}

export interface MonthRate {
  /** "2026年10月" */
  label: string;
  discharges: number;
  onTime: number;
  late: number;
  /** Not submitted yet and still before the due day. */
  open: number;
  /** onTime ÷ discharges × 100, one decimal; null with no discharges. */
  percent: number | null;
}

/** The previous calendar month's discharges, counted as the 施設基準 counts them (submitted within 14 days). */
export function lastMonthRate(rows: SummaryRow[], today: CalendarDate): MonthRate {
  const prev = today.m === 1 ? { y: today.y - 1, m: 12 } : { y: today.y, m: today.m - 1 };
  const mine = rows.filter((r) => {
    const d = addDays(today, r.dischargeDay);
    return d.y === prev.y && d.m === prev.m;
  });
  const onTime = mine.filter((r) => submittedDay(r.record) !== null && !r.late).length;
  const late = mine.filter((r) => r.late).length;
  return { label: `${prev.y}年${prev.m}月`, discharges: mine.length, onTime, late, open: mine.length - onTime - late, percent: mine.length ? Math.round((onTime / mine.length) * 1000) / 10 : null };
}

/**
 * FICTIONAL past discharges of this hospital (no charts in this prototype), so that the list and the rate
 * have something to show. Offsets from today.
 */
export const PAST_SUMMARIES: PastSummary[] = (() => {
  const yam = "山本（専攻医）";
  const res = "研修医 田中";
  const sup = "指導医 高橋";
  const kino = "木下（総合診療科 B）";
  const at = (day: number, time = "17:00") => ({ day, time });
  const ok = (writer: string, conf: number, approver: string, appr: number): SummaryRecord => ({ status: "確定", confirmedBy: writer, confirmedAt: at(conf), approval: { by: approver, at: at(appr, "18:00") } });
  const gen = "総合診療科";
  return [
    { id: "past-1", name: "前川 宗一", department: gen, attending: yam, dischargeDay: -3, record: { status: "作成中" } },
    { id: "past-2", name: "小野 美代子", department: gen, attending: yam, dischargeDay: -6, record: { status: "確定", confirmedBy: yam, confirmedAt: at(-2) } },
    { id: "past-3", name: "林 和子", department: gen, attending: yam, dischargeDay: -12, record: { status: "確定", confirmedBy: res, confirmedAt: at(-4) } },
    { id: "past-4", name: "竹内 茂", department: gen, attending: yam, dischargeDay: -16 },
    { id: "past-5", name: "石田 フミ", department: gen, attending: yam, dischargeDay: -19, record: { status: "作成中", returned: { by: sup, at: at(-8), comment: "退院時処方と退院後の方針を書き足してください" } } },
    { id: "past-6", name: "村上 進", department: gen, attending: kino, dischargeDay: -20, record: ok(kino, -12, "指導医 斎藤（架空）", -11) },
    { id: "past-7", name: "藤井 春江", department: gen, attending: yam, dischargeDay: -24, record: ok(res, -16, yam, -15) },
    { id: "past-8", name: "松本 良雄", department: gen, attending: yam, dischargeDay: -27, record: ok(yam, -20, sup, -19) },
    { id: "past-9", name: "井上 キヨ", department: gen, attending: kino, dischargeDay: -31, record: ok(kino, -14, "指導医 斎藤（架空）", -12) },
    { id: "past-10", name: "木村 達也", department: gen, attending: yam, dischargeDay: -34, record: ok(yam, -27, sup, -26) },
    { id: "past-11", name: "清水 冬子", department: gen, attending: yam, dischargeDay: -38, record: ok(res, -30, sup, -29) },
  ];
})();
