import { describe, expect, it } from "vitest";
import { ageOn, checkDigit, futanKubun, INSURANCE, receiptType, tokkiCode, validInsurerNumber } from "./insurance";

describe("保険者番号の検証番号", () => {
  it("weights 2,1,2,1… from the right and sums the digits", () => {
    // 0114099 from the right: 9×2=18→1+8, 9×1, 0×2, 4×1, 1×2, 1×1, 0×2 → 9+9+0+4+2+1+0 = 25 → 10−5 = 5
    expect(checkDigit("0114099")).toBe("5");
  });
  it("every demo insurer number is well-formed", () => {
    for (const ins of Object.values(INSURANCE)) expect(validInsurerNumber(ins.insurerNumber), ins.insurerNumber).toBe(true);
  });
});

describe("レセプト種別・特記事項・負担金区分", () => {
  const nov = { y: 2026, m: 11, d: 1 };
  it("72歳 国保 2割 → 高齢受給者 一般 入院 1117、区エ", () => {
    const ins = INSURANCE["90010231"];
    expect(ageOn(ins.birthDate, nov)).toBe(72);
    expect(receiptType(ins, 72, false)).toBe("1117");
    expect(tokkiCode(ins, 72)).toBe("29");
  });
  it("86歳 後期 1割 低所得Ⅱ → 1317、区オ、標準負担額減額 区分1", () => {
    const ins = INSURANCE["90010244"];
    expect(receiptType(ins, 86, false)).toBe("1317");
    expect(tokkiCode(ins, 86)).toBe("30");
    expect(futanKubun(ins, 86)).toBe("1");
  });
  it("79歳 後期 2割 → 1317、区カ", () => {
    const ins = INSURANCE["90010198"];
    expect(receiptType(ins, 79, false)).toBe("1317");
    expect(tokkiCode(ins, 79)).toBe("41");
  });
  it("64歳 協会けんぽ 家族 3割 区分ウ → 1115、区ウ", () => {
    const ins = INSURANCE["90010260"];
    expect(receiptType(ins, 64, false)).toBe("1115");
    expect(tokkiCode(ins, 64)).toBe("28");
    expect(futanKubun(ins, 64)).toBeNull();
  });
});
