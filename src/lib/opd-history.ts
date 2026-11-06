// 外来の受診歴 in the left record: an inpatient's visits to the outpatient clinic before this admission (FICTIONAL,
// a few per patient), an outpatient's past visits (from the outpatient list), and what is planned on each day
// (schedule-days.ts), laid out as the day sections of the record — newest first, like the record itself: the days
// ahead with something planned, today … the admission day, then the visits before it, each marked with the clinic
// and the doctor.

import { entryDayFor, type OrderDayMode } from "./history-days";
import { addDays, formatShort, type CalendarDate } from "./dates";
import { planKindsLabel, plannedDaysAhead, plansOn, type PlanItem } from "./schedule-days";
import type { OpdPatient } from "./opd";
import type { DayOffset, HistoryEntry } from "./types";

/** One visit to the outpatient clinic: when, where, who saw the patient, and what was written and ordered. */
export interface OpdVisit {
  id: string;
  patientId: string;
  day: DayOffset;
  dept: string;
  doctor: string;
  entries: HistoryEntry[];
}

const DR_GEN = "山本（専攻医）";
const DR_CARD = "循環器内科 森";

/** FICTIONAL visits before the admission, for the ward patients that have charts. */
export const OPD_VISITS: OpdVisit[] = [
  // 佐倉 修（右下腿蜂窩織炎、入院 -3）: the regular visit, then the leg two days before the admission.
  {
    id: "v-sakura-1",
    patientId: "90010231",
    day: -45,
    dept: "総合診療科",
    doctor: DR_GEN,
    entries: [
      { kind: "note", day: -45, time: "10:20", author: DR_GEN, role: "医師", soap: { s: "変わりなし。家庭血圧 130 台。", o: "BP 134/78、HR 72。足趾間に白癬あり、下腿の皮膚は乾燥。", a: "高血圧症、足白癬。", p: "アムロジピン継続。足白癬は外用で様子を見る。次回 3 か月後。" } },
      { kind: "order", id: "v-sakura-1-rx", day: -45, time: "10:25", author: DR_GEN, status: "終了", order: { type: "prescription", category: "定期", drugCode: "ORAL-AMLO5", amount: 1, unit: "錠", timings: ["朝"], start: { day: -45, timing: "朝" }, days: 56 } },
      { kind: "order", id: "v-sakura-1-lab", day: -45, time: "10:25", author: DR_GEN, status: "実施済", order: { type: "lab", codes: ["SET-ROUTINE"], collect: { day: -45, time: "10:40" }, priority: "定時" } },
    ],
  },
  {
    id: "v-sakura-2",
    patientId: "90010231",
    day: -5,
    dept: "総合診療科",
    doctor: DR_GEN,
    entries: [
      { kind: "note", day: -5, time: "11:05", author: DR_GEN, role: "医師", soap: { s: "一昨日から右下腿が痛い。熱はない。", o: "BT 36.9℃。右下腿前面に 8×6cm の発赤・熱感、圧痛あり。水疱なし。", a: "右下腿蜂窩織炎（軽症）。", p: "採血。内服の抗菌薬で外来治療とし、発赤の縁をマーキング。悪化や発熱があればすぐ受診するよう説明。" } },
      { kind: "order", id: "v-sakura-2-lab", day: -5, time: "11:10", author: DR_GEN, status: "実施済", order: { type: "lab", codes: ["LAB-CBC", "LAB-CRP"], collect: { day: -5, time: "11:20" }, priority: "至急" } },
    ],
  },
  // 大浦 トメ（誤嚥性肺炎、入院 -1）: the regular visit a month before, where the family mentioned choking.
  {
    id: "v-oura-1",
    patientId: "90010244",
    day: -32,
    dept: "総合診療科",
    doctor: DR_GEN,
    entries: [
      { kind: "note", day: -32, time: "09:40", author: DR_GEN, role: "医師", soap: { s: "長女：食事中にむせることが増えた。食べる量はやや減った。", o: "BP 128/70、SpO2 96%（室内気）。体重 41.5kg（前回 42.3kg）。肺音 清。", a: "高血圧症、認知症。嚥下機能の低下が疑われる。", p: "食事の形態を家族と相談（とろみ・一口量）。むせが続くなら嚥下の評価を予定。処方継続。" } },
      { kind: "order", id: "v-oura-1-lab", day: -32, time: "09:45", author: DR_GEN, status: "実施済", order: { type: "lab", codes: ["SET-ROUTINE"], collect: { day: -32, time: "10:00" }, priority: "定時" } },
    ],
  },
  // 北村 博（慢性心不全の急性増悪、入院 -5）: two visits to 循環器内科.
  {
    id: "v-kitamura-1",
    patientId: "90010198",
    day: -95,
    dept: "循環器内科",
    doctor: DR_CARD,
    entries: [{ kind: "note", day: -95, time: "14:10", author: DR_CARD, role: "医師", soap: { s: "息切れは階段で少し。浮腫なし。", o: "体重 61.8kg。BP 122/70、HR 68（整）。", a: "慢性心不全（EF 35%）、安定。", p: "処方継続。次回 BNP と心電図。" } }],
  },
  {
    id: "v-kitamura-2",
    patientId: "90010198",
    day: -35,
    dept: "循環器内科",
    doctor: DR_CARD,
    entries: [
      { kind: "note", day: -35, time: "14:30", author: DR_CARD, role: "医師", soap: { s: "平地でも息切れが出てきた。夜は 2 回トイレに起きる。", o: "体重 63.0kg（+1.2kg）。BP 138/82、HR 84。下腿に軽い浮腫。", a: "慢性心不全。体液貯留の始まりか。", p: "利尿薬を調節。塩分 6g、毎朝の体重測定を指導。BNP と心電図。2 週間後に再診。" } },
      { kind: "order", id: "v-kitamura-2-lab", day: -35, time: "14:35", author: DR_CARD, status: "実施済", order: { type: "lab", codes: ["LAB-BNP", "SET-LYTES"], collect: { day: -35, time: "14:45" }, priority: "定時" } },
      { kind: "order", id: "v-kitamura-2-ecg", day: -35, time: "14:35", author: DR_CARD, status: "実施済", order: { type: "physio", test: "PHY-ECG", purpose: "心不全の経過", when: { day: -35, time: "15:00", priority: "予約" }, place: "検査室" } },
    ],
  },
  // 森 久美子（急性腎盂腎炎、入院 -2）: the visit three days before, with a urine test.
  {
    id: "v-mori-1",
    patientId: "90010260",
    day: -3,
    dept: "総合診療科",
    doctor: DR_GEN,
    entries: [
      { kind: "note", day: -3, time: "16:20", author: DR_GEN, role: "医師", soap: { s: "昨日から排尿時の痛みと頻尿。熱はない。", o: "BT 37.1℃。CVA 叩打痛なし。", a: "急性膀胱炎。", p: "尿検査・尿培養。内服の抗菌薬で外来治療。発熱や腰の痛みが出たら受診するよう説明。" } },
      { kind: "order", id: "v-mori-1-lab", day: -3, time: "16:25", author: DR_GEN, status: "実施済", order: { type: "lab", codes: ["LAB-UA", "LAB-UCX"], collect: { day: -3, time: "16:30" }, priority: "定時" } },
    ],
  },
];

/** The visits of a ward patient before this admission, newest first. */
export function visitsOf(patientId: string, admittedOn: DayOffset): OpdVisit[] {
  return OPD_VISITS.filter((v) => v.patientId === patientId && v.day < admittedOn).sort((a, b) => b.day - a.day);
}

/** An outpatient's past visits (the short lines of the outpatient list), as visits of the clinic, newest first. */
export function visitsFromOpd(op: OpdPatient): OpdVisit[] {
  return op.visits
    .filter((v) => v.day < 0)
    .map((v, i): OpdVisit => ({ id: `${op.id}-v${i}`, patientId: `opd:${op.id}`, day: v.day, dept: op.department, doctor: op.doctor, entries: [{ kind: "note", day: v.day, time: op.slot ?? "09:00", author: op.doctor, role: "医師", text: v.text }] }))
    .sort((a, b) => b.day - a.day);
}

/** One day of the record: a day of this stay (place null), or a visit to the clinic before it. */
export interface DaySection {
  day: DayOffset;
  /** The clinic and doctor of a visit; null for a day of this admission (or of today's visit). */
  place: { dept: string; doctor: string } | null;
  entries: HistoryEntry[];
  /** What is planned on this day by orders written on another day (採取・撮影・開始・終了・受診 …). */
  plans: PlanItem[];
  /** 今日より先の日。表示日に応じたオーダ本体と終了・帰院などの予定。 */
  future?: true;
}

const byTime = (a: HistoryEntry, b: HistoryEntry) => a.time.localeCompare(b.time);

/**
 * The day sections of the record, newest first: the days ahead that have something planned (farthest first),
 * today down to the admission day (empty days left out, today kept), then the visits before the admission with
 * their clinic. Each day of the stay also carries what is planned on it by orders written on another day. The
 * entries are placed by `mode` (the record passes 予定日 by default). The entries and the visits' entries
 * are given already filtered (the record's filters apply to both), and `keepPlan`
 * applies the same filters to the plans; a visit left with nothing is left out, except when nothing is filtered
 * (`narrowed` false), so the visit still shows where it was.
 */
export function daySections(admittedOn: DayOffset, entries: HistoryEntry[], visits: OpdVisit[], planned: PlanItem[] = [], narrowed = false, keepPlan: (p: PlanItem) => boolean = () => true, mode: OrderDayMode = "依頼日"): DaySection[] {
  const out: DaySection[] = [];
  for (const { day, items } of plannedDaysAhead(planned, keepPlan).reverse()) out.push({ day, place: null, entries: entries.filter((e) => entryDayFor(e, mode) === day).sort(byTime), plans: items, future: true });
  for (const day of new Set(entries.map((e) => entryDayFor(e, mode)).filter((d) => d > 0))) {
    if (!out.some((s) => s.day === day)) out.push({ day, place: null, entries: entries.filter((e) => entryDayFor(e, mode) === day).sort(byTime), plans: [], future: true });
  }
  out.sort((a, b) => b.day - a.day);
  for (let d = 0; d >= admittedOn; d--) {
    const items = entries.filter((e) => entryDayFor(e, mode) === d).sort(byTime);
    if (items.length === 0 && d !== 0) continue;
    out.push({ day: d, place: null, entries: items, plans: plansOn(planned, d, keepPlan) });
  }
  for (const v of [...visits].sort((a, b) => b.day - a.day)) {
    if (v.day >= admittedOn) continue;
    const items = [...v.entries].sort(byTime);
    if (items.length === 0 && narrowed) continue;
    out.push({ day: v.day, place: { dept: v.dept, doctor: v.doctor }, entries: items, plans: [] });
  }
  return out;
}

/**
 * The days ahead of the record folded into one line: the sections after today (farthest first, as the record lists
 * them), the nearest of them, and the heading 「予定 3日 — 次は 11/5（木） 検体検査」. The record shows this line
 * folded by default, so today's section is always the first one seen.
 */
export function aheadSummary(sections: DaySection[], today: CalendarDate): { days: DaySection[]; next: DaySection | null; heading: string } {
  const days = sections.filter((s) => s.future);
  const next = days.at(-1) ?? null;
  const heading = next ? `予定 ${days.length}日 — 次は ${formatShort(addDays(today, next.day))} ${planKindsLabel(next.plans)}` : "";
  return { days, next, heading };
}

/** "外来・循環器内科 森" — the heading mark of a visit. */
export const placeLabel = (p: { dept: string; doctor: string }) => `外来・${p.dept} ${p.doctor}`;
