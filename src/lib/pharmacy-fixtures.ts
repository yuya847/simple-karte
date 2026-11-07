import { DEFAULT_DOCTOR } from "./doctors";
import type { NarcoticBook } from "./narcotic-book";

/** 古い試験用workspaceだけを補修する。人が処理した返納・施用票は変えない。 */
export function repairPharmacyFixtures(book: NarcoticBook): NarcoticBook {
  const isReturn = (e: NarcoticBook["ledger"][number]) => e.id === `${e.patientId}-pharmacy-return` && e.kind === "返納" && e.code === "ORAL-OXC5" && e.at.day === -1 && e.at.time === "16:00" && e.paren === 2 && e.qty === 0 && e.note === "前回調剤分の残薬2錠を病棟から返納" && !e.disposal && !e.notice;
  const fixtureReturns = book.ledger.filter(isReturn);
  const keep = fixtureReturns.map(e => e.id).sort()[0];
  const ledger = book.ledger.filter(e => !isReturn(e) || e.id === keep);
  const slips = book.slips.map(s => s.id === `${s.patientId}-pharmacy-morphine-slip` && !s.received && s.prescriber !== DEFAULT_DOCTOR ? { ...s, prescriber: DEFAULT_DOCTOR } : s);
  return ledger.length === book.ledger.length && slips.every((s, i) => s === book.slips[i]) ? book : { ...book, ledger, slips };
}
