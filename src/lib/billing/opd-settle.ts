// 外来の会計の記録 (入金): per visit, what was paid, how, by whom and when; and the list of visits whose
// bill is still open (未収). Kept with the other records of the day (useWorkspace). All fictional.

import type { OpdPatient } from "../opd";
import type { DayOffset } from "../types";
import type { Coverage } from "./insurance";

export type PayMethod = "現金" | "カード";
export const PAY_METHODS: PayMethod[] = ["現金", "カード"];

export interface OpdSettlement {
  visitKind?: "初診" | "再診";
  /** The visit's chart id ("opd:" + id). */
  visitId: string;
  /** 領収書の番号 (fictional, per day and order). */
  receiptNo: string;
  points: number;
  /** What the patient paid (円). */
  yen: number;
  coverage: Coverage;
  /** 「3割」「全額（自費）」… as shown on the receipt. */
  rateLabel: string;
  method: PayMethod;
  by: string;
  at: { day: DayOffset; time: string };
}

/** The settlements of the day by visit id. */
export type OpdSettleBook = Record<string, OpdSettlement>;

export const visitKey = (opdId: string) => (opdId.startsWith("opd:") ? opdId : `opd:${opdId}`);

/** The next 領収書 number: R-YYYYMMDD-001, 002… over the settlements of the day. */
export function nextReceiptNo(book: OpdSettleBook, today: { y: number; m: number; d: number }): string {
  const prefix = `R-${today.y}${String(today.m).padStart(2, "0")}${String(today.d).padStart(2, "0")}-`;
  const n = Object.values(book).filter((s) => s.receiptNo.startsWith(prefix)).length + 1;
  return `${prefix}${String(n).padStart(3, "0")}`;
}

/** A visit whose 診察 is over counts as 未収 until the window records the payment. */
export const awaitingPayment = (p: Pick<OpdPatient, "status">) => p.status === "会計待ち" || p.status === "終了";

export interface UnpaidRow {
  visit: OpdPatient;
  key: string;
}

/** Today's visits with the bill still open, in the order they finished (会計待ち first, then 終了). */
export function unpaidVisits(opd: OpdPatient[], book: OpdSettleBook): UnpaidRow[] {
  return opd
    .filter((p) => awaitingPayment(p) && !book[visitKey(p.id)])
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "会計待ち" ? -1 : 1))
    .map((visit) => ({ visit, key: visitKey(visit.id) }));
}

/** Today's takings by method (for the window's close of day). */
export function takings(book: OpdSettleBook): { count: number; yen: number; byMethod: Record<PayMethod, number> } {
  const byMethod: Record<PayMethod, number> = { 現金: 0, カード: 0 };
  let yen = 0;
  for (const s of Object.values(book)) {
    yen += s.yen;
    byMethod[s.method] += s.yen;
  }
  return { count: Object.keys(book).length, yen, byMethod };
}
