// 検査室の受付: the blood and urine samples the ward draws today and tomorrow morning, and which
// of them the laboratory has received. Which draw a label belongs to, whether the ward recorded the
// draw and whether a sample may be taken in are all worked out by code. A person reads the label.

import { abs } from "./flowsheet";
import { labelFor, marState, type AdminRecord } from "./mar";
import { findSet, labInfo, WARD_RULES } from "./master";
import type { DayOffset, LabOrder } from "./types";
import { SHIFTS, buildWorksheet, type WorkPatient } from "./worksheet";

/** A sample taken in at the laboratory (the label was read). */
export interface Reception {
  code: string;
  orderId: string;
  patientId: string;
  /** Scheduled draw time (minutes from today 00:00). */
  at: number;
  by: string;
  day: DayOffset;
  time: string;
  /** Whether the ward had recorded the draw when the sample came in. */
  collected: boolean;
}

/** A result the laboratory confirmed (values by analyte code). */
export interface LabReport {
  code: string;
  orderId: string;
  patientId: string;
  /** Scheduled draw time; the result is filed under it, like the printed label. */
  at: number;
  values: Record<string, number>;
  by: string;
  reported: { day: DayOffset; time: string };
}

/** One try at reaching a doctor about a panic value. */
export interface ContactAttempt {
  at: { day: DayOffset; time: string };
  by: string;
  to: string;
  means: "電話" | "対面";
  result: "伝えた" | "つながらない（不在・話し中）" | "伝言・折り返しを頼んだ";
}

/** What the laboratory did in this session (kept in this browser only). */
export interface LabDesk {
  received: Record<string, Reception>;
  reports: Record<string, LabReport>;
  /** Tries that did not reach anyone yet, by result key (moved into the call once reported). */
  tries: Record<string, ContactAttempt[]>;
}

export const EMPTY_DESK: LabDesk = { received: {}, reports: {}, tries: {} };

export type DrawStatus = "未採取" | "採取しなかった" | "採取済み" | "受付済み" | "報告済み";

export interface DrawRow {
  code: string;
  orderId: string;
  patientId: string;
  room: string;
  name: string;
  at: number;
  tests: string;
  codes: string[];
  container: string;
  urgent: boolean;
  status: DrawStatus;
  /** "HH:MM" the ward recorded the draw, or "前の勤務" for draws before this session. */
  collectedAt?: string;
  collectedBy?: string;
  notDoneReason?: string;
  reception?: Reception;
  report?: LabReport;
  /** The result is already in the fictional record (before this session). */
  fromRecord?: boolean;
}

const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** "06:00" today, "明日 06:00", "昨日 06:00", else "3日後 06:00" / "2日前 06:00". */
export function whenText(at: number): string {
  const d = Math.floor(at / 1440);
  const t = hhmm(at);
  if (d === 0) return t;
  if (d === 1) return `明日 ${t}`;
  if (d === -1) return `昨日 ${t}`;
  return d > 0 ? `${d}日後 ${t}` : `${-d}日前 ${t}`;
}

/** The draws the laboratory looks at: today and tomorrow morning, to the end of the night shift. */
export const deskWindow = () => ({ lo: 0, hi: abs(1, SHIFTS.night.to) });

/** Lab test codes of an order, with sets opened up. */
export function testCodes(codes: string[]): string[] {
  return codes.flatMap((c) => {
    const set = findSet(c);
    return set ? testCodes(set.labCodes) : [c];
  });
}

/** Containers of an order (SRL の容器記号), each once. */
export const containersOf = (codes: string[]) => [...new Set(testCodes(codes).map((c) => labInfo(c).container))].join("・");

/** Normalise what a barcode reader (or a person) typed: full-width to half-width, upper case. */
export const normalizeCode = (s: string) => s.normalize("NFKC").trim().toUpperCase();

export function drawRows(people: WorkPatient[], records: Record<string, AdminRecord>, desk: LabDesk, sessionStart: number, nowAbs: number, win = deskWindow()): DrawRow[] {
  const items = buildWorksheet(people, win.lo, win.hi, nowAbs).timed.filter((i) => i.kind === "採血" && i.at !== null);
  return items.map((i) => {
    const at = i.at!;
    const code = labelFor(i.orderId, at);
    const person = people.find((x) => x.patient.id === i.patientId);
    const order = person?.entries.find((e) => e.id === i.orderId)?.order as LabOrder | undefined;
    const codes = order?.codes ?? [];
    const base = { code, orderId: i.orderId, patientId: i.patientId, room: i.room, name: i.name, at, tests: i.main, codes, container: containersOf(codes), urgent: !!i.urgent };
    const report = desk.reports[code];
    if (report) return { ...base, status: "報告済み" as const, report, reception: desk.received[code] };
    if (person?.patient.labs.some((l) => !l.id && abs(l.day, l.time) === at)) return { ...base, status: "報告済み" as const, fromRecord: true };
    const reception = desk.received[code];
    if (reception) return { ...base, status: "受付済み" as const, reception };
    const rec = records[`${i.orderId}|${at}`];
    const st = marState({ orderId: i.orderId, at }, records, sessionStart, nowAbs);
    if (st === "実施") return { ...base, status: "採取済み" as const, collectedAt: rec?.doneAt, collectedBy: rec?.by };
    if (st === "記録済み") return { ...base, status: "採取済み" as const, collectedAt: "前の勤務" };
    if (st === "未実施") return { ...base, status: "採取しなかった" as const, notDoneReason: rec?.reason };
    return { ...base, status: "未採取" as const };
  });
}

export type ScanTone = "ok" | "warn" | "stop";

export interface SpecimenScan {
  /** Can be taken in now. */
  ok: boolean;
  tone: ScanTone;
  message: string;
  row?: DrawRow;
}

/**
 * What the label that was read is, and whether the sample may be taken in. A sample the ward has
 * not recorded yet is taken in once its time has come (with a note); before that it is stopped.
 */
export function scanSpecimen(input: string, rows: DrawRow[], people: WorkPatient[], nowAbs: number): SpecimenScan | null {
  const code = normalizeCode(input);
  if (!code) return null;
  const row = rows.find((r) => r.code === code);
  if (!row) {
    for (const { patient: p, entries } of people)
      for (const e of entries) {
        if (e.order.type !== "lab") continue;
        const at = abs(e.order.collect.day, e.order.collect.time);
        if (labelFor(e.id, at) !== code) continue;
        if (e.status === "中止") return { ok: false, tone: "stop", message: `中止になった検査のラベルです（${p.name}さん ${whenText(at)}）。受け付けません。病棟に確かめてください。` };
        return { ok: false, tone: "stop", message: `受付の範囲（今日と明日の朝 ${SHIFTS.night.to} まで）の外の採血です（${p.name}さん ${whenText(at)}）。` };
      }
    return { ok: false, tone: "stop", message: `このラベルは受付の一覧にありません（${code}）。検体のラベルか、番号を確かめてください。` };
  }
  const who = `${row.room} ${row.name}さん ${whenText(row.at)} ${row.tests}`;
  if (row.status === "報告済み") return { ok: false, tone: "warn", row, message: `結果を報告済みの検体です（${who}${row.report ? `　${row.report.reported.time} ${row.report.by}` : "　前の記録"}）。` };
  if (row.status === "受付済み") return { ok: false, tone: "warn", row, message: `受付済みの検体です（${who}　${row.reception!.time} ${row.reception!.by}）。` };
  if (row.status === "採取しなかった") return { ok: false, tone: "stop", row, message: `病棟が「未実施${row.notDoneReason ? `（${row.notDoneReason}）` : ""}」と記録した採血です（${who}）。受け付けません。病棟に確かめてください。` };
  if (row.status === "未採取") {
    if (row.at - nowAbs > WARD_RULES.marWindowMin)
      return { ok: false, tone: "stop", row, message: `採血の予定（${whenText(row.at)}）より前で、病棟の採取の記録もありません。受け付けません。` };
    return { ok: true, tone: "warn", row, message: `受け付けました：${who}。病棟の採取の記録がまだです。病棟にワークシートの「照合」で記録を頼んでください。` };
  }
  return { ok: true, tone: "ok", row, message: `受け付けました：${who}。` };
}

export function receive(desk: LabDesk, row: DrawRow, by: string, nowAbs: number): LabDesk {
  const r: Reception = { code: row.code, orderId: row.orderId, patientId: row.patientId, at: row.at, by, day: Math.floor(nowAbs / 1440), time: hhmm(nowAbs), collected: row.status === "採取済み" };
  return { ...desk, received: { ...desk.received, [row.code]: r } };
}

/** How many draws are in each state. */
export function statusCounts(rows: DrawRow[]): Record<DrawStatus, number> {
  const out: Record<DrawStatus, number> = { 未採取: 0, 採取しなかった: 0, 採取済み: 0, 受付済み: 0, 報告済み: 0 };
  for (const r of rows) out[r.status]++;
  return out;
}
