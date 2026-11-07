import { expect, it } from "vitest";
import { INITIAL_BOOK, type NarcoticBook } from "./narcotic-book";
import { repairPharmacyFixtures } from "./pharmacy-fixtures";
const returned = (patientId: string) => ({ id: `${patientId}-pharmacy-return`, patientId, code: "ORAL-OXC5", at: { day: -1, time: "16:00" }, kind: "返納" as const, paren: 2, qty: 0, note: "前回調剤分の残薬2錠を病棟から返納", by: "小林（薬剤師）" });
it("旧試験例だけを1件にし、同じ内容でも人の記録と処理済み記録を残す", () => {
  const processed = { ...returned("C"), disposal: { amount: "2錠", by: "薬剤師", witness: "看護師", at: { day: 0, time: "10:00" }, method: "粉砕" } };
  const manual = { ...returned("D"), id: "human-return" };
  const book: NarcoticBook = { ...INITIAL_BOOK, ledger: [returned("B"), returned("A"), processed, manual] };
  const repaired = repairPharmacyFixtures(book);
  expect(repaired.ledger.map(e => e.id)).toEqual(["A-pharmacy-return", "C-pharmacy-return", "human-return"]);
  expect(repaired.ledger).toContain(processed);
  expect(repairPharmacyFixtures(repaired)).toBe(repaired);
});
it("古い未受領の試験施用票だけを補修する", () => {
  const slip = { id: "A-pharmacy-morphine-slip", orderId: "A-pharmacy-morphine", patientId: "A", code: "INJ-MOR10", marKey: "dose", usedAt: { day: 0, time: "09:00" }, issuedA: 1, usedMl: 0.5, leftMl: 0.5, unusedA: 0, prescriber: "試験用主治医", by: "看護師", returnedAt: { day: 0, time: "09:30" } };
  const received = { ...slip, received: { by: "薬剤師", at: { day: 0, time: "10:00" } } };
  const human = { ...slip, id: "human-slip" };
  const repaired = repairPharmacyFixtures({ ...INITIAL_BOOK, slips: [slip, received, human] });
  expect(repaired.slips[0].prescriber).not.toBe(slip.prescriber);
  expect(repaired.slips[1]).toBe(received);
  expect(repaired.slips[2]).toBe(human);
});
