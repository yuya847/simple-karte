import { describe, expect, it } from "vitest";
import { callHits, callText, checkPrn, initialStanding, prnText, type PrnRule } from "./standing";

const apap = (over: Partial<PrnRule> = {}): PrnRule => ({ id: "x", when: "発熱時", detail: "38.5℃以上", drug: { code: "ORAL-APAP500", amount: 1, unit: "錠" }, intervalH: 6, maxPerDay: 3, ...over });

describe("指示簿", () => {
  it("writes call criteria and as-needed rules in words", () => {
    expect(callText({ key: "spo2", value: 92 })).toBe("SpO2 92%未満");
    expect(callText({ key: "sbpLow", value: 90 })).toBe("収縮期血圧 90mmHg以下");
    expect(prnText(apap())).toBe("発熱時（38.5℃以上）：アセトアミノフェン錠500mg 1錠　6時間あけて1日3回まで");
  });

  it("finds the call criteria the latest vitals meet", () => {
    const s = initialStanding()["90010231"][0];
    expect(callHits(s, { day: 0, time: "10:00", bt: 39.2, sbp: 100, hr: 110, spo2: 91 })).toEqual(["体温 39.2℃（基準 ≥39）", "SpO2 91%（基準 <92）"]);
    expect(callHits(s, { day: 0, time: "10:00", bt: 37, sbp: 120, hr: 80, spo2: 97 })).toEqual([]);
  });

  it("works out the day's maximum against the package insert", () => {
    expect(checkPrn(apap(), [])).toEqual([{ level: "info", message: "1日の最大 1,500mg（上限 4,000mg、添付文書（成人の鎮痛：1日総量4,000mgを限度））", formula: "1錠 × 500mg × 3回 = 1,500mg" }]);
    const over = checkPrn(apap({ drug: { code: "ORAL-APAP500", amount: 2, unit: "錠" }, maxPerDay: 5, intervalH: 4 }), []);
    expect(over.find((i) => i.level === "ask" && i.message.includes("上限"))!.formula).toBe("2錠 × 500mg × 5回 = 5,000mg");
  });

  it("asks when the interval does not fit in a day", () => {
    expect(checkPrn(apap({ intervalH: 8, maxPerDay: 4 }), [])[0]).toMatchObject({ level: "ask", formula: "8時間 × (4 − 1) = 24時間" });
  });

  it("stops on an allergy to the drug's class", () => {
    const loxo = apap({ drug: { code: "ORAL-LOX60", amount: 1, unit: "錠" } });
    expect(checkPrn(loxo, ["NSAIDs（喘息発作）"]).find((i) => i.level === "stop")!.message).toBe("アレルギー「NSAIDs（喘息発作）」に当たります。");
  });
});
