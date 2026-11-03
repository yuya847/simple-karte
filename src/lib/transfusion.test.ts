import { describe, expect, it } from "vitest";
import { checkDraft, isReady, newProcedureDraft, toOrder, type CheckContext, type ProcedureDraft } from "./drafts";
import { txEffect, txMinutes } from "./procedures";
import type { Patient, TxOrder } from "./types";

const ctx = (blood: Patient["blood"] | undefined, extra: Partial<CheckContext> = {}): CheckContext => ({
  activeOrders: [],
  labOrders: [],
  drafts: [],
  nowTime: "08:30",
  fmtDay: (d) => `D${d}`,
  describe: (o) => o.id,
  patientFacts: { sex: "女", age: 86, allergies: [], cre: null, heightCm: 145, weightKg: 41 },
  txFacts: { blood, latest: { Hb: { value: 6.8, day: 0 } } },
  ...extra,
});
const rbc: TxOrder = { product: "RBC", units: 2, abo: "A", rh: "+", reason: "Hb 6.8" };
const draft = (tx: TxOrder, over: Partial<ProcedureDraft> = {}): ProcedureDraft => ({ ...newProcedureDraft("PROC-TX", "t1"), tx, schedule: { kind: "once" }, start: { day: 0, time: null }, ...over });
const typed = { abo: "A" as const, rh: "+" as const, checks: 2, antibody: "陰性" as const };

describe("輸血", () => {
  it("works out the expected effect with the guideline's formulas", () => {
    expect(txEffect({ product: "RBC", units: 2 }, 50)).toEqual({ text: "予測上昇 Hb 約 +1.7g/dL", formula: "2単位 × 約29g = 約58g ÷ 循環血液量 50kg × 70mL/kg = 35.0dL = +1.7g/dL" });
    // 指針の例：5単位（1.0×10¹¹個）を循環血液量 5,000mL に → 13,333/µL
    expect(txEffect({ product: "PC", units: 10 }, 41).formula).toBe("2.0×10¹¹個 ÷ (2,870mL × 10³) × 2/3 = 46,458/µL");
    expect(txEffect({ product: "FFP", units: 4 }, 41).formula).toBe("41kg × 8〜12mL/kg = 328〜492mL");
  });

  it("paces it at about 1mL/分 for 15 minutes, then 5mL/分", () => {
    expect(txMinutes(280)).toEqual({ minutes: 68, formula: "最初の15分 15mL ＋ 残り 265mL ÷ 5mL/分 = 68分" });
  });

  it("stops without the blood type confirmed twice", () => {
    expect(checkDraft(draft(rbc), ctx(undefined)).find((i) => i.key === "tx-abo")!.level).toBe("stop");
    expect(checkDraft(draft(rbc), ctx({ ...typed, checks: 1 })).find((i) => i.key === "tx-abo")!.message).toContain("確認が1回です");
    expect(checkDraft(draft({ ...rbc, abo: "O" }), ctx(typed)).find((i) => i.key === "tx-abo")!.message).toContain("型が違います");
  });

  it("asks for the antibody screen before red cells, not before plasma", () => {
    expect(checkDraft(draft(rbc), ctx({ abo: "A", rh: "+", checks: 2 })).find((i) => i.key === "tx-ab")!.level).toBe("stop");
    expect(checkDraft(draft({ ...rbc, product: "FFP", units: 4 }), ctx({ abo: "A", rh: "+", checks: 2 })).find((i) => i.key === "tx-ab")).toBeUndefined();
  });

  it("is ready once typed, screened and the consent is prepared, and the order keeps the product", () => {
    const issues = checkDraft(draft(rbc), ctx(typed));
    expect(issues.find((i) => i.key === "tx-lab")!.message).toContain("Hb 6.8（D0）");
    expect(isReady(issues)).toBe(false); // 同意書
    const withConsent = draft(rbc, { consentPlanned: true });
    expect(isReady(checkDraft(withConsent, ctx(typed)))).toBe(true);
    const r = toOrder(withConsent, ctx(typed));
    expect(r.order).toMatchObject({ code: "PROC-TX", tx: rbc });
    expect(r.consents).toEqual(["CONSENT-TRANSFUSION"]);
  });
});
