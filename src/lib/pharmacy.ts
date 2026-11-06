// The pharmacy's work on the ward: checking new orders (処方監査), questions to the doctor
// (疑義照会), identifying drugs brought from home (持参薬鑑別) and medication counselling
// (薬剤管理指導). Checks are plain code; Claude only reads the 持参薬 list into rows.

import type { PrescriptionDraft } from "./rx";
import { ORAL_DRUGS, findDrug, findOralDrug, ingredientOf, WARD_RULES } from "./master";
import { minutesOf } from "./dates";
import type { DayOffset, DoseTiming, OrderEntry, Patient, PrescriptionOrder } from "./types";

const abs = (day: number, time: string) => day * 1440 + minutesOf(time);

// ---------------------------------------------------------------------------
// 処方監査
// ---------------------------------------------------------------------------

export interface AuditCheck {
  level: "ask" | "info";
  text: string;
}

export interface AuditItem {
  patient: Patient;
  room: string;
  entry: OrderEntry;
  checks: AuditCheck[];
}

const isRunning = (e: OrderEntry) => e.status === "有効";

/** New injection and oral orders since `since`, with what code can check. Nothing is judged for the pharmacist. */
export function auditItems(people: { patient: Patient; room: string; entries: OrderEntry[] }[], since: number, nowAbs: number): AuditItem[] {
  const out: AuditItem[] = [];
  for (const { patient: p, room, entries } of people) {
    for (const e of entries) {
      const given = abs(e.day, e.time);
      if (given < since || given > nowAbs) continue;
      if (e.order.type !== "injection" && e.order.type !== "prescription") continue;
      const checks: AuditCheck[] = [];
      if (e.order.type === "prescription") {
        const o = e.order;
        const ing = ingredientOf(o.drugCode);
        const same = entries.filter(
          (x) =>
            x.id !== e.id &&
            isRunning(x) &&
            x.order.type === "prescription" &&
            ingredientOf((x.order as PrescriptionOrder).drugCode) === ing &&
            (x.order as PrescriptionOrder).timings.length > 0 &&
            // 退院時処方 is compared only with other 退院時処方 (it repeats the ward's drugs on purpose).
            ((x.order as PrescriptionOrder).category === "退院時") === (o.category === "退院時"),
        );
        if (ing && o.timings.length > 0 && isRunning(e) && same.length) {
          checks.push({ level: "ask", text: `同じ成分（${ing}）の内服が ${same.map((x) => (x.order as PrescriptionOrder).category).join("・")} でも有効です。` });
        }
      } else {
        const code = e.order.items[0]?.drugCode;
        const same = entries.filter((x) => x.id !== e.id && isRunning(x) && x.order.type === "injection" && x.order.items[0]?.drugCode === code);
        if (isRunning(e) && same.length) checks.push({ level: "ask", text: `同じ注射（${findDrug(code)?.name ?? code}）の有効なオーダがもう1つあります。` });
      }
      if (p.allergies.length) checks.push({ level: "info", text: `アレルギー：${p.allergies.join("、")}` });
      out.push({ patient: p, room, entry: e, checks });
    }
  }
  return out.sort((a, b) => abs(b.entry.day, b.entry.time) - abs(a.entry.day, a.entry.time));
}

// ---------------------------------------------------------------------------
// 疑義照会
// ---------------------------------------------------------------------------

export interface Query {
  id: string;
  patientId: string;
  orderId: string;
  question: string;
  askedAt: string;
  by: string;
  status: "回答待ち" | "変更" | "変更なし";
  answer?: string;
  answeredAt?: string;
}

/**
 * A query answered "変更" closes only when the order it is about has been stopped: the old
 * version cannot stay running next to the corrected one.
 */
export function queryOpen(q: Query, entries: OrderEntry[]): boolean {
  if (q.status === "回答待ち") return true;
  if (q.status === "変更") return entries.find((e) => e.id === q.orderId)?.status === "有効";
  return false;
}

/**
 * Why an order cannot be dispensed yet, or null: the doctor has not answered a 疑義照会 on it, or (for orders
 * written since yesterday, the ones in 処方監査) it has not been audited. Older orders were audited before this record begins.
 */
export function dispenseBlock(orderId: string, people: { entries: OrderEntry[] }[], queries: Query[], audited: Record<string, string>): string | null {
  const x = people.find((y) => y.entries.some((e) => e.id === orderId));
  const e = x?.entries.find((y) => y.id === orderId);
  const q = queries.find((y) => y.orderId === orderId && queryOpen(y, x?.entries ?? []));
  if (q) return `疑義照会の回答待ちです（${q.question}）。回答のあとで払い出してください。`;
  if (e && abs(e.day, e.time) >= -1440 && !audited[orderId]) return "まだ監査していません。「処方監査・疑義照会」で監査してから払い出してください。";
  return null;
}

// ---------------------------------------------------------------------------
// 持参薬鑑別
// ---------------------------------------------------------------------------

/** One drug read from the お薬手帳 text (by Claude), matched to the master (by code). */
export interface BroughtRow {
  /** Original notebook usage, kept separately from normalized administration slots. */
  usage?: string;
  said: string;
  strength: string;
  amount: number | null;
  unit: string;
  timings: DoseTiming[];
  daysLeft: number | null;
  /** Condition of an as-needed drug, as written. */
  prn: string | null;
  /** The hospital master item with the same ingredient and strength, if any. */
  match: string | null;
  /** The pharmacist has checked this row against the drug itself. */
  checked: boolean;
  /** The doctor's choice. */
  decision: "持参薬で継続" | "院内の薬に切替" | "中止" | null;
  /** 実物で数えた残りの数 (the pharmacist counts the drug brought in; the お薬手帳 only says what was prescribed). */
  counted?: number | null;
  /** 薬剤師の備考 for this drug (服薬状況・識別・気をつけること). */
  note?: string;
}

export interface BroughtReport {
  id: string;
  patientId: string;
  rows: BroughtRow[];
  by: string;
  at: string;
  /** 指示の下書き: the doctor chose, the drafts wait for 確定 (back to 医師へ報告 if they are all removed). */
  status: "鑑別中" | "医師へ報告" | "指示の下書き" | "指示済";
  /** 鑑別の所見 the pharmacist writes for the whole report (服薬の状況・管理の方法など). */
  comment?: string;
}

/**
 * How many days the counted drug lasts at the written usage: 残数 ÷ (1回量 × 1日の回数), rounded down
 * (code). Null for 頓用 or when it was not counted or the 1回量 is unknown.
 */
export function daysOfCount(row: Pick<BroughtRow, "counted" | "amount" | "timings" | "unit">): { days: number; formula: string } | null {
  if (row.counted === null || row.counted === undefined || row.amount === null || !(row.amount > 0) || row.timings.length === 0) return null;
  const perDay = row.amount * row.timings.length;
  const days = Math.floor(row.counted / perDay + 1e-9);
  return { days, formula: `${row.counted}${row.unit} ÷（1回${row.amount}${row.unit} × ${row.timings.length}回）＝ ${days}日分` };
}

const norm = (s: string) => s.normalize("NFKC").replace(/\s/g, "").toLowerCase();

/** Master item with this name (or alias) and strength. Brand names map through aliases. */
export function matchOral(said: string, strength: string): string | null {
  const n = norm(said);
  // Strength by its number ("500" = "500mg"); a name with no strength matches no item.
  const num = (s: string) => norm(s).replace(/mg$/, "");
  const st = num(strength);
  const hit = ORAL_DRUGS.find((d) => [d.name, ...d.aliases].some((a) => n.includes(norm(a))) && (st ? num(d.strength) === st : n.includes(num(d.strength))));
  return hit?.code ?? null;
}

/** Running oral orders of the same ingredient (already registered). */
export function alreadyOrdered(code: string, entries: OrderEntry[]): OrderEntry[] {
  const ing = ingredientOf(code);
  return entries.filter((e) => isRunning(e) && e.order.type === "prescription" && ingredientOf(e.order.drugCode) === ing);
}

/** First ward dose time of these timings after now (today or tomorrow). */
export function nextTiming(timings: DoseTiming[], nowTime: string): { day: DayOffset; timing: DoseTiming } | null {
  if (!timings.length) return null;
  const order: DoseTiming[] = ["朝", "昼", "夕", "眠前"];
  const sorted = [...timings].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const now = minutesOf(nowTime);
  const today = sorted.find((t) => minutesOf(WARD_RULES.medTimes[t]) > now);
  return today ? { day: 0, timing: today } : { day: 1, timing: sorted[0] };
}

/**
 * The doctor's choices as prescription drafts, one Rp per row, so that they go through the same checks
 * (allergy, duplicate, daily maximum) and the same 確定 as any other prescription.
 */
export function draftsFromReport(r: BroughtReport, nowTime: string, newId: () => string): PrescriptionDraft[] {
  return ordersFromReport(r, nowTime).map((o) => ({
    id: newId(),
    origin: "manual",
    sourceText: "（持参薬鑑別の報告から）",
    comment: o.comment ?? null,
    kind: "prescription",
    category: o.category === "退院時" ? null : o.category,
    items: [{ drugCode: o.drugCode, said: findOralDrug(o.drugCode)?.name ?? o.drugCode, daily: null, perDose: o.amount }],
    dayPattern: o.dayPattern,
    timings: o.timings,
    prn: o.prn ?? null,
    maxPerDay: o.maxPerDay ?? null,
    days: o.days ?? null,
    start: { day: o.start.day, timing: o.start.timing ?? null },
    acks: [],
    reportId: r.id,
  }));
}

/** The orders the doctor's choices make. 中止 makes none. */
export function ordersFromReport(r: BroughtReport, nowTime: string): PrescriptionOrder[] {
  const out: PrescriptionOrder[] = [];
  for (const row of r.rows) {
    if (!row.match || !row.decision || row.decision === "中止" || row.amount === null) continue;
    const prn = row.timings.length === 0;
    const start = prn ? { day: 0 } : nextTiming(row.timings, nowTime);
    if (!start) continue;
    const d = findOralDrug(row.match)!;
    out.push({
      type: "prescription",
      category: row.decision === "持参薬で継続" ? "持参薬" : prn ? "臨時" : "定期",
      drugCode: row.match,
      amount: row.amount,
      unit: d.unit,
      timings: row.timings,
      ...(prn ? { prn: row.prn ?? "必要時" } : {}),
      start,
      days: row.decision === "持参薬で継続" && row.daysLeft ? row.daysLeft : undefined,
      comment: row.decision === "持参薬で継続" ? "持参薬鑑別より" : `持参薬（${row.said}）から院内の薬に切替`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 薬剤管理指導料（B008）: 週1回かつ月4回まで（週は日曜〜土曜）
// ---------------------------------------------------------------------------

export function b008Check(days: DayOffset[], day: DayOffset, dow: (d: DayOffset) => number, month: (d: DayOffset) => string): string | null {
  const week = (d: DayOffset) => d - dow(d);
  if (days.some((d) => week(d) === week(day))) return "この週（日曜〜土曜）はもう算定しています（週1回まで）。";
  if (days.filter((d) => month(d) === month(day)).length >= 4) return "この月はもう4回算定しています（月4回まで）。";
  return null;
}
