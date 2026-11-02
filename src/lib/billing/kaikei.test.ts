import { describe, expect, it } from "vitest";
import { INSURANCE, type Insurance } from "./insurance";
import { calculateBill, limitFor, limitTableFor } from "./kaikei";
import type { ClaimResult } from "./model";

const claim = (points: number, month = "2026-11", futanYen = 0): ClaimResult => ({
  month,
  from: 1,
  to: 10,
  days: 10,
  acts: [],
  totalPoints: points,
  meals: { ryoyoYen: 0, futanYen },
  issues: [],
  sources: [],
});
const ins = (patch: Partial<Insurance>): Insurance => ({ ...INSURANCE["90010260"], ...patch });

describe("自己負担限度額（健保令42条）", () => {
  it("the table changed on 2026-08-01 (令和8年政令第240号)", () => {
    expect(limitTableFor("2026-07").table.ウ.base).toBe(80_100);
    expect(limitTableFor("2026-08").table.ウ.base).toBe(85_800);
    expect(limitTableFor("2026-11").table.一般70.base).toBe(61_500);
  });

  it("区分ウ, 医療費100万円 → 85,800 + 7,140 = 92,940円 (the 厚労省 example)", () => {
    expect(limitFor(ins({ incomeClass: "ウ" }), 1_000_000, "2026-11", false)?.yen).toBe(92_940);
  });

  it("the 1% part rounds 50銭 up and less down", () => {
    // (286,050 − 286,000) × 1% = 0.5円 → 1円; 286,040 → 0.4円 → 0円
    expect(limitFor(ins({ incomeClass: "ウ" }), 286_050, "2026-11", false)?.yen).toBe(85_801);
    expect(limitFor(ins({ incomeClass: "ウ" }), 286_040, "2026-11", false)?.yen).toBe(85_800);
  });

  it("70歳以上: 現役並みⅢ uses ア, 一般 61,500, 低所得Ⅱ 25,700, 低所得Ⅰ 15,700", () => {
    expect(limitFor(ins({ incomeClass: "現役並みⅢ" }), 901_000, "2026-11", false)?.yen).toBe(270_300);
    expect(limitFor(ins({ incomeClass: "一般Ⅱ" }), 500_000, "2026-11", false)?.yen).toBe(61_500);
    expect(limitFor(ins({ incomeClass: "低所得Ⅱ" }), 500_000, "2026-11", false)?.yen).toBe(25_700);
    expect(limitFor(ins({ incomeClass: "低所得Ⅰ" }), 500_000, "2026-11", false)?.yen).toBe(15_700);
  });

  it("多数回該当", () => {
    expect(limitFor(ins({ incomeClass: "ウ" }), 1_000_000, "2026-11", true)?.yen).toBe(44_400);
    expect(limitFor(ins({ incomeClass: "低所得Ⅰ" }), 1_000_000, "2026-11", true)?.yen).toBe(15_700);
  });
});

describe("窓口で払う額", () => {
  it("3割, 区分ウ, 10万点: 一部負担金 300,000円 → 限度額 92,940円（円単位のまま）＋食事", () => {
    const b = calculateBill(claim(100_000, "2026-11", 550 * 30), ins({ incomeClass: "ウ" }));
    expect(b.ichibuYen).toBe(300_000);
    expect(b.kogaku).toBe(true);
    expect(b.medicalYen).toBe(92_940);
    expect(b.kogakuYen).toBe(300_000 - 92_940);
    expect(b.totalYen).toBe(92_940 + 16_500);
  });

  it("under the limit: the 一部負担金, rounded to 10円 (4,281点 × 3割 = 12,843 → 12,840円)", () => {
    const b = calculateBill(claim(4_281), ins({ incomeClass: "ウ" }));
    expect(b.ichibuYen).toBe(12_840);
    expect(b.kogaku).toBe(false);
    expect(b.medicalYen).toBe(12_840);
  });

  it("5円 rounds up (1,235点 × 1割 = 1,235円 → 1,240円)", () => {
    expect(calculateBill(claim(1_235), ins({ rate: 10, incomeClass: "一般Ⅰ" })).ichibuYen).toBe(1_240);
  });

  it("without the 適用区分 at the window, no limit and a note", () => {
    const b = calculateBill(claim(100_000), ins({ incomeClass: "ウ", limitKnown: false }));
    expect(b.medicalYen).toBe(300_000);
    expect(b.notes.join("")).toContain("適用区分");
  });

  it("the month before the change uses the old table (2026-07: 80,100 + 7,330 = 87,430円)", () => {
    expect(calculateBill(claim(100_000, "2026-07"), ins({ incomeClass: "ウ" })).medicalYen).toBe(87_430);
  });

  it("領収証の区分 (入院料等・検査…) come from the 診療識別", () => {
    const c = claim(0);
    c.acts = [
      { shikibetsu: "90", parts: [{ lines: [], points: 2047 }], count: 2, days: {}, basis: "" },
      { shikibetsu: "60", parts: [{ lines: [], points: 103 }], count: 1, days: {}, basis: "" },
      { shikibetsu: "97", parts: [{ lines: [], points: 2190, yen: true }], count: 1, days: {}, basis: "" },
    ];
    expect(calculateBill(c, ins({})).sections).toEqual([
      { name: "入院料等", points: 4094 },
      { name: "検査", points: 103 },
    ]);
  });
});
