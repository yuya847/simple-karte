import { describe, expect, it } from "vitest";
import { OPD_PATIENTS } from "../opd";
import { nextReceiptNo, takings, unpaidVisits, type OpdSettleBook, type OpdSettlement } from "./opd-settle";

const today = { y: 2026, m: 11, d: 4 };
const paid = (visitId: string, yen: number, method: OpdSettlement["method"] = "現金"): OpdSettlement => ({ visitId, receiptNo: nextReceiptNo({}, today), points: 128, yen, coverage: "医保", rateLabel: "2割", method, by: "医事課 渡辺", at: { day: 0, time: "10:40" } });

describe("外来の会計の記録", () => {
  it("中谷さん（会計待ち）が未収に出て、入金すると消える", () => {
    const open = unpaidVisits(OPD_PATIENTS, {});
    expect(open.map((r) => r.visit.name)).toEqual(["中谷 修"]);
    expect(open[0].key).toBe("opd:opd-6");
    const book: OpdSettleBook = { "opd:opd-6": paid("opd:opd-6", 260) };
    expect(unpaidVisits(OPD_PATIENTS, book)).toEqual([]);
  });
  it("診察が終わった人（終了）も、入金がなければ未収。会計待ちが先", () => {
    const list = OPD_PATIENTS.map((p) => (p.id === "opd-1" ? { ...p, status: "終了" as const } : p));
    expect(unpaidVisits(list, {}).map((r) => r.visit.name)).toEqual(["中谷 修", "石田 正男"]);
  });
  it("領収書の番号は日付と通し番号", () => {
    expect(nextReceiptNo({}, today)).toBe("R-20261104-001");
    const book: OpdSettleBook = { a: { ...paid("a", 100), receiptNo: "R-20261104-001" }, b: { ...paid("b", 200), receiptNo: "R-20261103-004" } };
    expect(nextReceiptNo(book, today)).toBe("R-20261104-002");
  });
  it("その日の入金を方法ごとに数える", () => {
    const t = takings({ a: paid("a", 260), b: paid("b", 1_230, "カード") });
    expect(t).toEqual({ count: 2, yen: 1_490, byMethod: { 現金: 260, カード: 1_230 } });
  });
});
