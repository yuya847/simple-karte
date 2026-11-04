// 検査室: the blood and urine samples the ward draws today and tomorrow morning, which of them the
// laboratory has received, and the results it enters. Which draw a label belongs to, whether the ward
// recorded the draw, whether a sample may be taken in, H/L against the reference range and panic
// values are all worked out by code. A person reads the label, measures, types and confirms.

import { abs } from "./flowsheet";
import { startCultures, worksOfCode, type CultureWork } from "./lab-culture";
import { labelFor, marState, type AdminRecord } from "./mar";
import { ANALYTES, findLab, findSet, labInfo, rangeFor, WARD_RULES, type Analyte } from "./master";
import { panicOf, placeOf, type ContactAttempt, type PanicHit, type PanicLimit, type Place } from "./results";
import type { DayOffset, LabOrder, LabResult, OrderEntry, Patient, Sex } from "./types";
import { SHIFTS, buildWorksheet, changeKey, type WorkPatient } from "./worksheet";

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

/** One version of a confirmed result: the values, who confirmed them and when. */
export interface ReportVersion {
  values: Record<string, number>;
  by: string;
  reported: { day: DayOffset; time: string };
  /** Why this version replaced the one before it (訂正の理由). The first version has none. */
  reason?: string;
}

/** A result the laboratory confirmed (values by analyte code). The fields of ReportVersion are the version in force. */
export interface LabReport extends ReportVersion {
  code: string;
  orderId: string;
  patientId: string;
  /** Scheduled draw time; the result is filed under it, like the printed label. */
  at: number;
  /** Earlier versions, oldest first: a correction never overwrites what it replaced. */
  earlier?: ReportVersion[];
}

export const REJECT_REASONS = ["溶血", "量不足", "凝固", "ラベル不一致", "その他"] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

/** A received sample the laboratory cannot measure: the draw goes back to the ward as 再採血. */
export interface Rejection {
  code: string;
  orderId: string;
  patientId: string;
  /** Scheduled time of the draw that was rejected. */
  at: number;
  reason: RejectReason;
  note?: string;
  by: string;
  day: DayOffset;
  time: string;
  /** The new draw sent back to the ward: an id of its own, so its label carries a new code. */
  redrawId: string;
}

/** What the laboratory did in this session (kept in this browser only). */
export interface LabDesk {
  received: Record<string, Reception>;
  reports: Record<string, LabReport>;
  /** Tries that did not reach anyone yet, by result key (moved into the call once reported). */
  tries: Record<string, ContactAttempt[]>;
  /** Samples sent back for a new draw (再採血), by the label code that is no longer taken in. */
  rejected: Record<string, Rejection>;
  /** Cultures reported step by step (細菌検査), by culture key. */
  cultures: Record<string, CultureWork>;
}

export const EMPTY_DESK: LabDesk = { received: {}, reports: {}, tries: {}, rejected: {}, cultures: {} };

export type DrawStatus = "未採取" | "採取しなかった" | "採取済み" | "受付済み" | "再採血" | "報告済み";

export interface DrawRow {
  code: string;
  orderId: string;
  patientId: string;
  /** 病棟, or a visit of 救急外来 / 外来 (shown with its mark). */
  place: Place;
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
  /** This sample was sent back (再採血): why, who, when, and the new draw. */
  rejection?: Rejection;
  /** This draw is the new draw for a sample that was sent back. */
  redrawOf?: Rejection;
  /** The order's comment (血液培養 2セット …). */
  comment?: string;
  /** The items 至急 on their own (names), when only some of the order is 至急. */
  urgentItems?: string[];
  /** Where the sample is drawn (病棟採血 …), when the order says. */
  site?: string;
  /** What the test is for, when the order says. */
  purpose?: string;
  /** A culture of this sample has a step reported (it can no longer be sent back). */
  cultureStarted?: boolean;
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
    const redrawOf = Object.values(desk.rejected).find((r) => r.redrawId === i.orderId);
    const started = worksOfCode(desk.cultures, i.patientId, code).some((w) => w.steps.length > 0);
    const urgentItems = (order?.urgentCodes ?? []).map((c) => findLab(c)?.abbr ?? findLab(c)?.name ?? c);
    const base = {
      code,
      orderId: i.orderId,
      patientId: i.patientId,
      place: placeOf(i.patientId),
      room: i.room,
      name: i.name,
      at,
      tests: i.main,
      codes,
      container: containersOf(codes),
      // A sample with any 至急 item is taken in first, like a whole 至急 order.
      urgent: !!i.urgent || urgentItems.length > 0,
      ...(urgentItems.length ? { urgentItems } : {}),
      ...(order?.site ? { site: order.site } : {}),
      ...(order?.purpose ? { purpose: order.purpose } : {}),
      ...(redrawOf ? { redrawOf } : {}),
      // The 至急 items, the place and the purpose are shown with the comment, so the desk reads them in one line.
      ...(order?.comment || urgentItems.length || order?.site || order?.purpose
        ? { comment: [urgentItems.length ? `至急：${urgentItems.join("・")}` : null, order?.site ?? null, order?.purpose ? `目的：${order.purpose}` : null, order?.comment ?? null].filter(Boolean).join("　") }
        : {}),
      ...(started ? { cultureStarted: true } : {}),
    };
    const report = desk.reports[code];
    if (report) return { ...base, status: "報告済み" as const, report, reception: desk.received[code] };
    const rejection = desk.rejected[code];
    if (rejection) return { ...base, status: "再採血" as const, rejection, reception: desk.received[code] };
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

/** The name of the place on the screen and in messages. */
export const PLACE_NAME: Record<Place, string> = { 病棟: "病棟", 救急: "救急外来", 外来: "外来" };

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
  if (row.status === "再採血" && row.rejection) {
    const r = row.rejection;
    return { ok: false, tone: "stop", row, message: `再採血を頼んだ検体のラベルです（${who}　${rejectText(r)} ${r.time} ${r.by}）。このラベルでは受け付けません。採り直した検体の新しいラベル（${redrawCode(r)}）を読んでください。` };
  }
  if (row.status === "受付済み") return { ok: false, tone: "warn", row, message: `受付済みの検体です（${who}　${row.reception!.time} ${row.reception!.by}）。` };
  if (row.status === "採取しなかった") return { ok: false, tone: "stop", row, message: `病棟が「未実施${row.notDoneReason ? `（${row.notDoneReason}）` : ""}」と記録した採血です（${who}）。受け付けません。病棟に確かめてください。` };
  if (row.status === "未採取") {
    if (row.at - nowAbs > WARD_RULES.marWindowMin)
      return { ok: false, tone: "stop", row, message: `採血の予定（${whenText(row.at)}）より前で、${row.place === "病棟" ? "病棟" : PLACE_NAME[row.place]}の採取の記録もありません。受け付けません。` };
    if (row.place !== "病棟")
      return { ok: true, tone: "warn", row, message: `受け付けました：${who}。${PLACE_NAME[row.place]}の採取の記録はこの試作にありません。採った人と時刻を${PLACE_NAME[row.place]}に確かめてください。` };
    return { ok: true, tone: "warn", row, message: `受け付けました：${who}。病棟の採取の記録がまだです。病棟にワークシートの「照合」で記録を頼んでください。` };
  }
  return { ok: true, tone: "ok", row, message: `受け付けました：${who}${row.redrawOf ? "（再採血）" : ""}。` };
}

/** 受付: who and when; a culture in the sample starts (培養中). */
export function receive(desk: LabDesk, row: DrawRow, by: string, nowAbs: number): LabDesk {
  const r: Reception = { code: row.code, orderId: row.orderId, patientId: row.patientId, at: row.at, by, day: Math.floor(nowAbs / 1440), time: hhmm(nowAbs), collected: row.status === "採取済み" };
  return { ...desk, received: { ...desk.received, [row.code]: r }, cultures: startCultures(desk.cultures, row) };
}

/** How many draws are in each state. */
export function statusCounts(rows: DrawRow[]): Record<DrawStatus, number> {
  const out: Record<DrawStatus, number> = { 未採取: 0, 採取しなかった: 0, 採取済み: 0, 受付済み: 0, 再採血: 0, 報告済み: 0 };
  for (const r of rows) out[r.status]++;
  return out;
}

// ---------------------------------------------------------------------------
// 再採血: a received sample that cannot be measured goes back to the ward as a new draw.
// ---------------------------------------------------------------------------

/** The reason in words (その他 is the words written). */
export const rejectText = (r: Pick<Rejection, "reason" | "note">) => (r.reason === "その他" ? (r.note ?? "その他") : `${r.reason}${r.note ? `（${r.note}）` : ""}`);

/** The order id the first draw had (a new draw of a new draw still belongs to it). */
export const rootOrderId = (orderId: string) => orderId.replace(/(-re\d+)+$/, "");

/** The code printed on the label of the new draw. */
export const redrawCode = (r: Pick<Rejection, "redrawId" | "day" | "time">) => labelFor(r.redrawId, abs(r.day, r.time));

/** Why a sample cannot be sent back now (null when it can): only a sample taken in and not reported. */
export function rejectBlock(row: DrawRow): string | null {
  if (row.status === "報告済み") return "結果を報告した検体は、再採血ではなく「訂正」で直します。";
  if (row.status === "再採血") return "再採血を依頼済みです。";
  if (row.status !== "受付済み") return "受け付けた検体だけ再採血にできます。";
  if (row.cultureStarted) return "培養の報告を始めた検体は再採血にできません。";
  return null;
}

/**
 * 再採血: the sample is not taken in again (its code is kept as rejected, with who, when and why),
 * and a new draw of the same order goes back to the ward from now, under a new label code.
 */
export function rejectSpecimen(desk: LabDesk, row: DrawRow, reason: RejectReason | null, note: string, by: string, nowAbs: number): LabDesk {
  const n = note.trim();
  if (!reason || (reason === "その他" && !n) || rejectBlock(row)) return desk;
  const root = rootOrderId(row.orderId);
  const count = Object.values(desk.rejected).filter((r) => rootOrderId(r.orderId) === root).length;
  const r: Rejection = { code: row.code, orderId: row.orderId, patientId: row.patientId, at: row.at, reason, ...(n ? { note: n } : {}), by, day: Math.floor(nowAbs / 1440), time: hhmm(nowAbs), redrawId: `${root}-re${count + 1}` };
  // A culture of the sample sent back did not start; the new draw starts its own.
  const drop = new Set(worksOfCode(desk.cultures, row.patientId, row.code).map((w) => w.key));
  return { ...desk, rejected: { ...desk.rejected, [row.code]: r }, cultures: Object.fromEntries(Object.entries(desk.cultures).filter(([k]) => !drop.has(k))) };
}

/**
 * The orders with their new draws (再採血) added: each is the first order drawn again from the time the
 * laboratory sent the sample back, with the reason in its comment. It stops when the order stops.
 * They go to the ward's list (worksheet, labels, 照合) and to the laboratory, not into the chart.
 */
export function withRedraws(entries: OrderEntry[], desk: LabDesk, patientId: string): OrderEntry[] {
  const mine = Object.values(desk.rejected)
    .filter((r) => r.patientId === patientId)
    .sort((a, b) => abs(a.day, a.time) - abs(b.day, b.time) || a.redrawId.localeCompare(b.redrawId));
  if (!mine.length) return entries;
  const out = [...entries];
  for (const r of mine) {
    const root = out.find((e) => e.id === rootOrderId(r.orderId));
    if (!root || root.order.type !== "lab" || out.some((e) => e.id === r.redrawId)) continue;
    const comment = [`再採血：${rejectText(r)}（${r.by} ${r.time}）`, root.order.comment].filter(Boolean).join("　");
    out.push({
      kind: "order",
      id: r.redrawId,
      day: r.day,
      time: r.time,
      author: `${r.by}（再採血の依頼）`,
      status: root.status,
      ...(root.stoppedOn !== undefined ? { stoppedOn: root.stoppedOn } : {}),
      ...(root.stoppedTime ? { stoppedTime: root.stoppedTime } : {}),
      order: { ...root.order, collect: { day: r.day, time: r.time }, comment },
    });
  }
  return out;
}

/** The new draws wait for a nurse's 指示受け like a new order (keys of the worksheet). */
export const redrawChangeKeys = (desk: LabDesk) => Object.values(desk.rejected).map((r) => changeKey(r.redrawId, "新規"));

/**
 * The fictional events of this demo (like the blood culture in results.ts), so the laboratory has
 * samples to take in: 山本医師 ordered urgent electrolytes for 北村さん a little before the session
 * began and the ward drew them just before (so they count as recorded by the earlier shift), and
 * 森さん has tomorrow's routine draw (ordered yesterday).
 */
export function demoLabOrders(nowAbs: number): Record<string, OrderEntry[]> {
  const drawn = Math.max(0, nowAbs - 25);
  const ordered = Math.max(0, nowAbs - 50);
  const entry = (id: string, day: DayOffset, time: string, order: LabOrder): OrderEntry => ({ kind: "order", id, day, time, author: "山本（専攻医）", status: "有効", order });
  return {
    "90010198": [entry("o-lab-demo1", 0, hhmm(ordered), { type: "lab", codes: ["SET-LYTES", "LAB-BUN", "LAB-CRE"], collect: { day: 0, time: hhmm(drawn) }, priority: "至急" })],
    "90010260": [entry("o-lab-demo2", -1, "17:30", { type: "lab", codes: ["SET-ROUTINE"], collect: { day: 1, time: WARD_RULES.routineDrawTime }, priority: "定時" })],
  };
}

// ---------------------------------------------------------------------------
// 結果の入力: the analytes of the order, H/L and panic values by code, then 確定.
// ---------------------------------------------------------------------------

export interface EntryPlan {
  /** Values to type, in the order of the lab order. */
  analytes: Analyte[];
  /** Parts of the order not entered on this screen, and why. */
  other: { name: string; why: string }[];
}

export function entryPlan(codes: string[]): EntryPlan {
  const analytes: Analyte[] = [];
  const other: { name: string; why: string }[] = [];
  const addOther = (name: string, why: string) => {
    if (!other.some((o) => o.name === name)) other.push({ name, why });
  };
  for (const c of testCodes(codes)) {
    const t = findLab(c);
    if (!t) {
      addOther(c, "マスターにない");
      continue;
    }
    if (!t.contains) {
      addOther(t.abbr ?? t.name, t.group === "微生物" ? "細菌検査で報告" : "この試作では入れない");
      continue;
    }
    for (const a of t.contains) {
      const an = ANALYTES.find((x) => x.code === a);
      if (!an) addOther(a, "結果の表に欄がない");
      else if (!analytes.some((x) => x.code === a)) analytes.push(an);
    }
  }
  return { analytes, other };
}

export type Flag = "H" | "L" | "";

/** H/L against the reference range for this sex (the same rule as the result table). */
export function flagOf(a: Analyte, sex: Sex, v: number): Flag {
  const r = rangeFor(a, sex);
  if (r.high !== undefined && v > r.high) return "H";
  if (r.low !== undefined && v < r.low) return "L";
  return "";
}

export function rangeText(a: Analyte, sex: Sex): string {
  const r = rangeFor(a, sex);
  if (r.low !== undefined && r.high !== undefined) return `${r.low}〜${r.high}`;
  if (r.high !== undefined) return `${r.high}以下`;
  if (r.low !== undefined) return `${r.low}以上`;
  return "—";
}

/** A typed value: full-width digits and thousands commas are fine; anything else is an error. */
export function parseValue(raw: string): { value: number | null; error?: string } {
  const s = raw.normalize("NFKC").replace(/,/g, "").trim();
  if (!s) return { value: null };
  if (!/^\d+(\.\d+)?$/.test(s)) return { value: null, error: "数で入れてください" };
  return { value: Number(s) };
}

export interface ValueRow {
  analyte: Analyte;
  raw: string;
  value: number | null;
  error?: string;
  flag: Flag;
  panic?: PanicHit;
  /** The last value before this draw, for reference (display only). */
  prev?: { value: number; when: string };
}

export interface EntryCheck {
  rows: ValueRow[];
  values: Record<string, number>;
  missing: number;
  errors: number;
  panic: PanicHit[];
  /** Every value typed and valid. */
  ready: boolean;
}

export function checkEntry(plan: EntryPlan, raw: Record<string, string>, patient: Patient, limits: PanicLimit[], at: number): EntryCheck {
  const values: Record<string, number> = {};
  const parsed = plan.analytes.map((a) => {
    const p = parseValue(raw[a.code] ?? "");
    if (p.value !== null) values[a.code] = p.value;
    return { a, ...p };
  });
  const panic = panicOf(values, limits);
  const earlier = [...patient.labs].filter((l) => abs(l.day, l.time) < at).sort((x, y) => abs(y.day, y.time) - abs(x.day, x.time));
  const rows: ValueRow[] = parsed.map(({ a, value, error }) => {
    const last = earlier.find((l) => a.code in l.values);
    return {
      analyte: a,
      raw: raw[a.code] ?? "",
      value,
      error,
      flag: value === null ? "" : flagOf(a, patient.sex, value),
      panic: panic.find((h) => h.code === a.code),
      prev: last ? { value: last.values[a.code], when: whenText(abs(last.day, last.time)) } : undefined,
    };
  });
  const missing = rows.filter((r) => r.value === null && !r.error).length;
  const errors = rows.filter((r) => r.error).length;
  return { rows, values, missing, errors, panic, ready: plan.analytes.length > 0 && missing === 0 && errors === 0 };
}

/** Samples received and waiting for their result (those with values to type). */
export const toEnter = (rows: DrawRow[]) => rows.filter((r) => r.status === "受付済み");

/** 確定: who and when are kept; a sample is reported once. */
export function confirmReport(desk: LabDesk, row: DrawRow, values: Record<string, number>, by: string, nowAbs: number): LabDesk {
  if (desk.reports[row.code] || !desk.received[row.code]) return desk;
  const r: LabReport = { code: row.code, orderId: row.orderId, patientId: row.patientId, at: row.at, values, by, reported: { day: Math.floor(nowAbs / 1440), time: hhmm(nowAbs) } };
  return { ...desk, reports: { ...desk.reports, [row.code]: r } };
}

/** The confirmed results of a patient, as rows of the result table (filed at the draw time). */
export function deskLabs(desk: LabDesk, patientId: string): LabResult[] {
  return Object.values(desk.reports)
    .filter((r) => r.patientId === patientId)
    .sort((a, b) => a.at - b.at)
    .map((r) => {
      const prev = r.earlier?.at(-1);
      return {
        day: Math.floor(r.at / 1440),
        time: hhmm(r.at),
        values: r.values,
        id: r.code,
        reportedBy: r.by,
        reportedAt: r.reported,
        ...(prev ? { corrected: { version: versionOf(r), reason: r.reason ?? "", by: r.by, at: r.reported, before: prev.values } } : {}),
      };
    });
}

// ---------------------------------------------------------------------------
// 結果の訂正: a confirmed value is changed with a reason; the version it replaced is kept.
// ---------------------------------------------------------------------------

/** 第◯版 of a result (1 until it is corrected). */
export const versionOf = (r: Pick<LabReport, "earlier">) => (r.earlier?.length ?? 0) + 1;

export const CORRECTION_REASONS = ["入力の誤り", "再測定の結果", "機器・試薬の不具合", "その他"] as const;
export type CorrectionReason = (typeof CORRECTION_REASONS)[number];

/** The reason as it is kept: the kind, with the words written (その他 is the words alone). */
export function correctionReason(kind: CorrectionReason | null, note: string): string {
  const n = note.trim();
  if (!kind) return "";
  if (kind === "その他") return n;
  return n ? `${kind}（${n}）` : kind;
}

export interface ValueChange {
  code: string;
  name: string;
  unit: string;
  from: number;
  to: number;
}

/** The values that differ between two versions (in the order of the analyte master). */
export function changesOf(before: Record<string, number>, after: Record<string, number>): ValueChange[] {
  const codes = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((c) => before[c] !== after[c] && before[c] !== undefined && after[c] !== undefined);
  return ANALYTES.filter((a) => codes.includes(a.code)).map((a) => ({ code: a.code, name: a.name, unit: a.unit, from: before[a.code], to: after[a.code] }));
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));
export const changeLine = (c: ValueChange[]) => c.map((x) => `${x.name} ${num(x.from)}→${num(x.to)}`).join("、");

export interface CorrectionCheck {
  changes: ValueChange[];
  /** Why 訂正 cannot be confirmed yet (empty when it can). */
  missing: string[];
  /** Panic values before and after (the panic flow follows the version in force). */
  panicBefore: PanicHit[];
  panicAfter: PanicHit[];
  ready: boolean;
}

/** 訂正 needs every value valid, at least one value changed, and a reason. */
export function checkCorrection(report: LabReport, entry: EntryCheck, reason: string, limits: PanicLimit[]): CorrectionCheck {
  const changes = entry.errors || entry.missing ? [] : changesOf(report.values, entry.values);
  const missing = [
    entry.errors ? "数でない値" : "",
    entry.missing ? `空の項目 ${entry.missing}` : "",
    !entry.errors && !entry.missing && changes.length === 0 ? "変えた値" : "",
    !reason.trim() ? "訂正の理由" : "",
  ].filter(Boolean);
  return { changes, missing, panicBefore: panicOf(report.values, limits), panicAfter: entry.panic, ready: missing.length === 0 };
}

/**
 * 訂正: the new values become the version in force (who, when, why); the version before is kept in
 * `earlier`. A report is corrected only with a reason and a changed value.
 */
export function correctReport(desk: LabDesk, code: string, values: Record<string, number>, reason: string, by: string, nowAbs: number): LabDesk {
  const r = desk.reports[code];
  if (!r || !reason.trim() || changesOf(r.values, values).length === 0) return desk;
  const before: ReportVersion = { values: r.values, by: r.by, reported: r.reported, ...(r.reason ? { reason: r.reason } : {}) };
  const next: LabReport = { ...r, values, by, reported: { day: Math.floor(nowAbs / 1440), time: hhmm(nowAbs) }, reason: reason.trim(), earlier: [...(r.earlier ?? []), before] };
  return { ...desk, reports: { ...desk.reports, [code]: next } };
}

/** Every version of a report, oldest first (the last is in force). */
export const versionsOf = (r: LabReport): ReportVersion[] => [...(r.earlier ?? []), { values: r.values, by: r.by, reported: r.reported, ...(r.reason ? { reason: r.reason } : {}) }];

/** A try that did not reach anyone (不在・話し中・伝言), kept until the value is reported. */
export function addTry(desk: LabDesk, key: string, t: ContactAttempt): LabDesk {
  return { ...desk, tries: { ...desk.tries, [key]: [...(desk.tries[key] ?? []), t] } };
}
