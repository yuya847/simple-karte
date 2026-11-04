import { describe, expect, it } from "vitest";
import { checkDraft, isReady, newProcedureDraft, toOrder, type CheckContext, type ProcedureDraft } from "./drafts";
import { TX_GUIDE, TX_NOTICE, TX_PACE, txEffect, txMinutes } from "./procedures";
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
  it("works out the expected effect with the formulas of 輸血療法実践ガイド, and labels what the guide does not give", () => {
    // 赤血球：予測上昇 Hb 値＝投与 Hb 量÷循環血液量（Ⅲ-1-4)）. 29g/単位 and 70mL/kg are the abolished guideline's example.
    const rbc = txEffect({ product: "RBC", units: 2 }, 50)!;
    expect(rbc).toMatchObject({ text: "予測上昇 Hb 約 +1.7g/dL", formula: "2単位 × 約29g = 約58g ÷ 循環血液量 50kg × 70mL/kg = 35.0dL = +1.7g/dL" });
    expect(rbc.basis).toContain("輸血療法実践ガイド Ⅲ-1-4)");
    expect(rbc.basis).toContain("廃止された旧指針（平成17年の「血液製剤の使用指針」）の例の値で、実践ガイドにはこの値がない");
    // 血小板：the guide gives 10単位・50kg で約4万/µL and CCI, not the old ×2/3 formula, so nothing is worked out.
    const pc = txEffect({ product: "PC", units: 10 }, 41)!;
    expect(pc.formula).toBeUndefined();
    expect(pc.text).toContain("体重50kgなら血小板数が約4万/µL上がる");
    expect(pc.text).not.toContain("2/3");
    expect(pc.basis).toContain("Ⅲ-2-4)");
    expect(pc.basis).toContain("CCI（補正血小板増加数）");
    expect(txEffect({ product: "PC", units: 10 })).not.toBeNull(); // needs no weight
    // 新鮮凍結血漿：予測上昇凝固因子活性値＝投与量×血中回収率÷循環血漿量（体重×40mL）（Ⅲ-3-5)）
    const ffp = txEffect({ product: "FFP", units: 4 }, 41)!;
    expect(ffp.formula).toBe("480mL × 50% ÷ 循環血漿量（41kg × 40mL = 1,640mL）= +14.6%");
    expect(ffp.text).toBe("480mL（11.7mL/kg）。予測上昇凝固因子活性値 約 +14.6%（血中回収率 50% のとき）");
    expect(ffp.basis).toContain("Ⅲ-3-5)");
    // Without a weight there is nothing to work out for red cells or plasma.
    expect(txEffect({ product: "RBC", units: 2 })).toBeNull();
    expect(txEffect({ product: "FFP", units: 4 })).toBeNull();
  });

  it("paces it at about 1mL/分 for 15 minutes, then 5mL/分 (実践ガイド Ⅱ-3-3)b)", () => {
    expect(txMinutes(280)).toEqual({ minutes: 68, formula: "最初の15分 15mL ＋ 残り 265mL ÷ 5mL/分 = 68分" });
    expect(TX_PACE).toContain("輸血療法実践ガイド Ⅱ-3-3)b");
    expect(TX_PACE).toContain("開始10〜15分で副反応の症状がなければ1分間に5mLほど");
  });

  it("cites the guide's sections, never the abolished guidelines as current, and links the abolition notice", () => {
    const all = (product: TxOrder["product"], units: number) => checkDraft(draft({ ...rbc, product, units }, { consentPlanned: true }), ctx({ abo: "A", rh: "+", checks: 1 }));
    for (const [product, units] of [["RBC", 2], ["PC", 10], ["FFP", 4]] as const) {
      const issues = all(product, units);
      const text = issues.map((i) => i.message).join("\n");
      expect(text).not.toMatch(/「輸血療法の実施に関する指針」（令和2年|厚生労働省「血液製剤の使用指針」の式/);
      expect(issues.find((i) => i.key === "tx")!.sources!.map((s) => s.url)).toEqual([TX_GUIDE.url, TX_NOTICE.url]);
      expect(issues.find((i) => i.key === "tx-abo")!.message).toContain("輸血療法実践ガイド Ⅰ-3-5)・Ⅱ-2-3)a");
      expect(issues.find((i) => i.key === "tx-rate")!.message).toContain("Ⅱ-3-3)b");
      expect(issues.find((i) => i.key === "tx-lab")!.message).toContain("輸血療法実践ガイド Ⅲ-");
    }
    expect(TX_NOTICE.url).toBe("https://www.mhlw.go.jp/content/11120000/001680857.pdf");
    expect(TX_NOTICE.label).toContain("医薬発0324第2号");
    // FFP: the guide gives no PT/APTT trigger (the old PT-INR 2.0 is gone).
    expect(all("FFP", 4).find((i) => i.key === "tx-lab")!.message).toContain("PT・APTT に明確なトリガー値はない");
    expect(all("FFP", 4).find((i) => i.key === "tx-lab")!.message).not.toContain("2.0 以上");
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
