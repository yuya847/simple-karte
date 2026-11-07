// 患者さんのページに出すもの: from the day's records (the workspace, read by the server) or the fictional
// records of the code, only what belongs to one patient — the call at the 外来, the signed consents, the papers
// handed over, and the lab results the patient agreed to see. Code chooses all of it; nothing is explained or
// judged here (values, units, reference ranges, H/L and dates only).

import { INITIAL_DESK, withInitialInsurance, type IjiDesk } from "../billing/worklist";
import { insuranceRecords, type InsuranceBook } from "../billing/registration";
import { consentDone, findConsent, type ConsentRecord } from "../consent";
import { addDays, formatShort, isoDate, type CalendarDate } from "../dates";
import { bagsOf, amountText } from "../discharge-rx";
import { DOC_DEFS, type DocRecord, type DocKind } from "../documents";
import type { GuidanceRecord } from "../guidance";
import { deskLabs, EMPTY_DESK, type LabDesk } from "../lab-desk";
import { visitPatientId } from "../lab-visits";
import { ANALYTES, rangeFor } from "../master";
import { OPD_PATIENTS, type OpdPatient } from "../opd";
import { CARDS, cardOf, clinicOf, OTHER_DEPT_TODAY, ticketLabel, tickets, type Card } from "../opd-desk";
import { birthDateOf } from "../patient-contacts";
import { PATIENTS } from "../patients";
import { currentEntries } from "../record";
import { labKey, PANIC_LIMITS, panicOf, type Ack, type PanicCall, type ReportedLabResult } from "../results";
import type { DayOffset, OrderEntry, Patient, Sex } from "../types";
import { WARD_CHART_PATIENTS } from "../ward-charts";
import { intakesOf, labsAgreed, readInbox } from "./inbox";

type Obj = Record<string, unknown>;

export interface PortalCall {
  /** 受付番号 ("004"). */
  ticket: string;
  to: "診察室" | "会計";
  room: string | null;
  /** Changes with each call (the page vibrates once per call). */
  key: string;
}

export interface PortalVisit {
  ticket: string | null;
  dept: string;
  room: string | null;
  /** Where the visit is, in the patient's words. */
  state: string;
}

export interface PortalSection {
  heading: string;
  lines: string[];
}

export interface PortalPaper {
  id: string;
  title: string;
  date: string;
  by: string;
  /** 同意 ・同意しない・撤回 (consents only). */
  status?: string;
  sections: PortalSection[];
}

export interface PortalLabRow {
  name: string;
  value: string;
  unit: string;
  range: string;
  flag: "H" | "L" | "";
}

export interface PortalLabSet {
  key: string;
  date: string;
  time: string;
  rows: PortalLabRow[];
}

export interface PortalView {
  name: string;
  place: "入院" | "外来";
  visits: PortalVisit[];
  call: PortalCall | null;
  consents: PortalPaper[];
  papers: PortalPaper[];
  labs: { agreed: boolean; sets: PortalLabSet[] };
  /** The admission questions (inpatients): the answers sent, and whether a nurse confirmed each. */
  intake: { sent: { at: string; done: boolean }[] } | null;
}

/** Who the token names, found in the records. */
export interface PortalPerson {
  kind: "入院" | "外来";
  /** The chart's id (an inpatient's id, or the first visit's "opd:◯"): the birth date and the insurance go by it. */
  id: string;
  name: string;
  sex: Sex;
  age: number;
  patient?: Patient;
  card?: Card;
  visits: OpdPatient[];
}

const list = <T>(v: unknown, fallback: T[]): T[] => (Array.isArray(v) ? (v as T[]) : fallback);
const rec = <T>(v: unknown): Record<string, T> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, T>) : {});

/** The 外来 of today (the saved list, or the code's). */
const opdOf = (data: Obj) => list<OpdPatient>(data.opd, [...OPD_PATIENTS, ...OTHER_DEPT_TODAY]);

export function findPerson(subject: string, data: Obj): PortalPerson | null {
  const card = /^card:(\d{7})$/.exec(subject)?.[1];
  if (card) {
    const c = [...CARDS, ...list<Card>(rec(data.opdDesk).cards, [])].find((x) => x.cardNo === card);
    if (!c) return null;
    const visits = opdOf(data).filter((v) => cardOf(v) === card);
    return { kind: "外来", id: visits[0] ? visitPatientId("opd", visits[0].id) : subject, name: c.name, sex: c.sex, age: c.age, card: c, visits };
  }
  const p = [...list<Patient>(data.admitted, []), ...PATIENTS, ...WARD_CHART_PATIENTS].find((x) => x.id === subject);
  return p ? { kind: "入院", id: p.id, name: p.name, sex: p.sex, age: p.age, patient: p, visits: [] } : null;
}

/** The birth date the chart shows (患者基本情報): the one registered with the insurance, else the fictional one made from the age. */
export function birthOf(id: string, age: number, book: InsuranceBook, today: CalendarDate): CalendarDate {
  return birthDateOf({ id, age }, today, insuranceRecords(book, id).at(-1)?.insurance.birthDate || undefined);
}

export const bookOf = (data: Obj): InsuranceBook => (data.iji ? withInitialInsurance(data.iji as Partial<IjiDesk>) : INITIAL_DESK).insurance;

export const personBirth = (p: PortalPerson, data: Obj, today: CalendarDate) => isoDate(birthOf(p.id, p.age, bookOf(data), today));

// ---------------------------------------------------------------------------
// 検査の結果: numbers only, those the doctor has seen, and no panic value whose call is not done yet.
// ---------------------------------------------------------------------------

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

function rangeText(low?: number, high?: number): string {
  if (low !== undefined && high !== undefined) return `${fmt(low)}〜${fmt(high)}`;
  if (low !== undefined) return `${fmt(low)} 以上`;
  if (high !== undefined) return `${fmt(high)} 以下`;
  return "";
}

/**
 * Whether the patient may see a result: the doctor has seen it (a result from before today counts as seen by the
 * attending, as on the chart: results.ts `unseen`), and a panic value in it has been phoned to the doctor.
 */
export function labShown(pid: string, l: ReportedLabResult, acks: Record<string, Ack>, calls: Record<string, PanicCall>): boolean {
  const key = labKey(pid, l);
  if (l.day >= 0 && !acks[key]) return false;
  return panicOf(l.values, PANIC_LIMITS).length === 0 || !!calls[key];
}

export function labSets(pid: string, labs: ReportedLabResult[], sex: Sex, acks: Record<string, Ack>, calls: Record<string, PanicCall>, fmtDay: (d: DayOffset) => string): PortalLabSet[] {
  return labs
    .filter((l) => labShown(pid, l, acks, calls))
    .sort((a, b) => b.day - a.day || b.time.localeCompare(a.time))
    .map((l) => ({
      key: labKey(pid, l),
      date: fmtDay(l.day),
      time: l.time,
      rows: Object.entries(l.values).flatMap(([code, v]) => {
        const a = ANALYTES.find((x) => x.code === code);
        if (!a || !Number.isFinite(v)) return [];
        const r = rangeFor(a, sex);
        const flag = r.low !== undefined && v < r.low ? "L" : r.high !== undefined && v > r.high ? "H" : "";
        return [{ name: a.name, value: fmt(v), unit: a.unit, range: rangeText(r.low, r.high), flag } as PortalLabRow];
      }),
    }))
    .filter((s) => s.rows.length > 0);
}

// ---------------------------------------------------------------------------
// 同意書の控え・渡した書類
// ---------------------------------------------------------------------------

/** The papers of the 書類作成 the hospital hands to the patient. */
export const HANDED_DOCS: DocKind[] = ["入院診療計画書", "退院療養計画書", "退院支援計画書"];

/** The admission consent the demo's charts start with (as WardApp makes them). */
const admissionConsents = (): ConsentRecord[] =>
  [...PATIENTS, ...WARD_CHART_PATIENTS].map((p) => {
    const at = PATIENTS.includes(p) ? ["15:00", "15:30"] : [p.history[0]?.time ?? "15:00", p.history[0]?.time ?? "15:30"];
    return { id: `consent-adm-${p.id}`, patientId: p.id, code: "CONSENT-ADMISSION", status: "同意", createdAt: { day: p.admittedOn, time: at[0] }, explainedAt: { day: p.admittedOn, time: at[1] }, explainedBy: p.attending, witness: "看護師", answers: {} };
  });

const consentsOf = (data: Obj): ConsentRecord[] => {
  const saved = list<ConsentRecord>(data.consents, []);
  return Array.isArray(data.consents) ? [...saved, ...admissionConsents().filter((c) => !saved.some((x) => x.id === c.id))] : admissionConsents();
};

const STATUS_WORD: Record<string, string> = { 同意: "同意", 拒否: "同意しない", 撤回: "撤回" };

export function consentPaper(c: ConsentRecord, fmtDay: (d: DayOffset) => string): PortalPaper | null {
  const done = consentDone(c);
  if (!done && c.status !== "拒否" && c.status !== "撤回") return null;
  const t = findConsent(c.code);
  const at = c.explainedAt ?? c.createdAt;
  const people = [c.explainedBy && `説明：${c.explainedBy}`, c.witness && `同席：${c.witness}`, c.proxy && `代諾者：${c.proxy.name}（${c.proxy.relation}）`].filter((x): x is string => !!x);
  const signed = (c.signatures ?? []).map((s) => `${s.role} ${s.name}（${fmtDay(s.at.day)} ${s.at.time}）`);
  return {
    id: c.id,
    title: t.title,
    date: `${fmtDay(at.day)} ${at.time}`,
    by: c.explainedBy ?? "",
    status: done ? "同意" : STATUS_WORD[c.status],
    sections: [
      ...t.sections.map((s) => ({ heading: s.heading, lines: [...s.lines, ...(s.facts ?? []).map((f) => `${f.text}（${f.source}）`)] })),
      ...(c.details && Object.values(c.details).some((v) => v?.trim()) ? [{ heading: "この説明の内容", lines: Object.entries(c.details).filter(([, v]) => v?.trim()).map(([k, v]) => `${k}：${v}`) }] : []),
      ...(c.extra?.trim() ? [{ heading: "医師から", lines: [c.extra.trim()] }] : []),
      { heading: "署名", lines: [...people, ...(signed.length ? signed : ["紙の同意書に署名"])] },
    ],
  };
}

interface HomeRx {
  handed?: { by: string; at: string; note: string };
  care?: Record<string, string[]>;
}

/** The patient's orders as the chart has them now (the code's history with today's confirmed changes). */
function ordersOf(p: Patient, data: Obj): OrderEntry[] {
  const c = rec<Partial<{ added: OrderEntry[]; stopped: string[]; stopTimes: Record<string, string>; stopDays: Record<string, number>; extended: Record<string, number> }>>(data.charts)[p.id];
  const changes = c ? { added: c.added ?? [], stopped: c.stopped ?? [], stopTimes: c.stopTimes, stopDays: c.stopDays, extended: c.extended } : undefined;
  return currentEntries(p, changes).filter((e): e is OrderEntry => e.kind === "order");
}

function inpatientPapers(p: Patient, data: Obj, fmtDay: (d: DayOffset) => string): PortalPaper[] {
  const out: PortalPaper[] = [];
  for (const d of list<DocRecord>(data.documents, []).filter((x) => x.patientId === p.id && HANDED_DOCS.includes(x.kind))) {
    const def = DOC_DEFS[d.kind];
    out.push({
      id: d.id,
      title: d.kind,
      date: `${fmtDay(d.at.day)} ${d.at.time}`,
      by: d.by,
      sections: [{ heading: "", lines: def.fields.filter((f) => d.values[f.key]?.trim()).map((f) => `${f.label}：${d.values[f.key].trim()}`) }],
    });
  }
  const home = rec<HomeRx>(data.homeRx)[p.id];
  if (home?.handed) {
    const bags = bagsOf(ordersOf(p, data));
    if (bags.length)
      out.push({
        id: `homerx-${p.id}`,
        title: "お薬の説明書（薬剤情報提供文書）",
        date: home.handed.at,
        by: home.handed.by,
        sections: bags.flatMap((b) =>
          b.drugs.map((d) => ({
            heading: `${d.name}${d.name.includes(d.strength) ? "" : ` ${d.strength}`}`,
            lines: [`${b.how}　${["外用", "材料", "自己注射"].includes(b.kind) ? "総量" : "1回"} ${d.per}${d.unit}${amountText(b) ? `　${amountText(b)}` : ""}`, d.info.what, ...(home.care?.[d.code] ?? d.info.care)].filter(Boolean),
          })),
        ),
      });
  }
  for (const g of list<GuidanceRecord>(data.guidance, []).filter((x) => x.patientId === p.id && x.kind === "退院時の生活指導"))
    out.push({ id: g.id, title: "退院時の生活指導", date: `${fmtDay(g.at.day)} ${g.at.time}`, by: g.by, sections: [{ heading: "", lines: g.text.split("\n").filter((l) => l.trim()) }] });
  return out;
}

interface OpdRxLite {
  lines: string[];
  by: string;
  at: string;
}

function visitPapers(v: OpdPatient, data: Obj, fmtDay: (d: DayOffset) => string): PortalPaper[] {
  const out: PortalPaper[] = [];
  const next = rec<{ day: number; time: string; purpose: string; by: string }>(data.revisits)[v.id];
  if (next) out.push({ id: `revisit-${v.id}`, title: "次の受診", date: fmtDay(0), by: next.by, sections: [{ heading: "", lines: [`${fmtDay(next.day)} ${next.time}　${v.department}`, next.purpose].filter(Boolean) }] });
  rec<OpdRxLite[]>(data.opdRx)[v.id]?.forEach((r, i) => out.push({ id: `opdrx-${v.id}-${i}`, title: "院外処方せん", date: `${fmtDay(0)} ${r.at}`, by: r.by, sections: [{ heading: "", lines: r.lines }] }));
  return out;
}

// ---------------------------------------------------------------------------
// 外来の呼出
// ---------------------------------------------------------------------------

const VISIT_STATE: Record<OpdPatient["status"], string> = { 予約: "予約", 受付済: "お待ちください", 診察待ち: "お待ちください", 診察中: "診察中", 会計待ち: "お会計の準備をしています", 終了: "お会計が済みました" };

export function callOf(visits: OpdPatient[], all: OpdPatient[]): { visits: PortalVisit[]; call: PortalCall | null } {
  const t = tickets(all);
  const label = (v: OpdPatient) => (t.get(v.id) ? ticketLabel(t.get(v.id)) : null);
  const shown = visits.map((v) => ({ ticket: label(v), dept: v.department, room: clinicOf(v.doctor)?.room ?? null, state: v.status === "予約" && v.slot ? `予約 ${v.slot}` : VISIT_STATE[v.status] }));
  const pay = visits.find((v) => v.status === "会計待ち" && v.payCalled && label(v));
  if (pay) return { visits: shown, call: { ticket: label(pay)!, to: "会計", room: null, key: `pay|${pay.id}|${pay.payCalled!.at}` } };
  const room = visits.find((v) => (v.status === "受付済" || v.status === "診察待ち") && v.called && label(v));
  if (room) return { visits: shown, call: { ticket: label(room)!, to: "診察室", room: clinicOf(room.doctor)?.room ?? null, key: `room|${room.id}|${room.called!.at}` } };
  return { visits: shown, call: null };
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

/** Everything the patient's page shows, for this patient only (null: not in the records). */
export function portalView(subject: string, data: Obj, today: CalendarDate): PortalView | null {
  const person = findPerson(subject, data);
  if (!person) return null;
  const fmtDay = (d: DayOffset) => formatShort(addDays(today, d));
  const inbox = readInbox(data.portalInbox);
  const agreed = labsAgreed(inbox, subject).agree;
  const acks = rec<Ack>(data.acks);
  const calls = rec<PanicCall>(data.calls);
  const desk = data.labDesk && typeof data.labDesk === "object" ? (data.labDesk as LabDesk) : EMPTY_DESK;
  const consents = consentsOf(data);
  if (person.kind === "入院" && person.patient) {
    const p = person.patient;
    const labs = [...p.labs, ...deskLabs(desk, p.id)];
    return {
      name: p.name,
      place: "入院",
      visits: [],
      call: null,
      consents: consents.filter((c) => c.patientId === p.id).flatMap((c) => consentPaper(c, fmtDay) ?? []),
      papers: inpatientPapers(p, data, fmtDay),
      labs: { agreed, sets: agreed ? labSets(p.id, labs, p.sex, acks, calls, fmtDay) : [] },
      intake: { sent: intakesOf(inbox, subject).map((e) => ({ at: `${fmtDay(e.at.day)} ${e.at.time}`, done: !!e.done })) },
    };
  }
  const { visits, call } = callOf(person.visits, opdOf(data));
  const ids = person.visits.map((v) => visitPatientId("opd", v.id));
  return {
    name: person.name,
    place: "外来",
    visits,
    call,
    consents: consents.filter((c) => ids.includes(c.patientId)).flatMap((c) => consentPaper(c, fmtDay) ?? []),
    papers: person.visits.flatMap((v) => visitPapers(v, data, fmtDay)),
    labs: { agreed, sets: agreed ? ids.flatMap((id) => labSets(id, deskLabs(desk, id), person.sex, acks, calls, fmtDay)) : [] },
    intake: null,
  };
}

/** Only the call (asked every few seconds). */
export function portalCall(subject: string, data: Obj): { visits: PortalVisit[]; call: PortalCall | null } | null {
  const person = findPerson(subject, data);
  if (!person) return null;
  return person.kind === "外来" ? callOf(person.visits, opdOf(data)) : { visits: [], call: null };
}
