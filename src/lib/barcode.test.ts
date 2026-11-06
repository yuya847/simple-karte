import { describe, expect, it } from "vitest";
import { CODE128_PATTERNS, code128Values, code128Widths } from "./barcode";

describe("Code 128", () => {
  it("has every pattern of 11 modules (the stop of 13), 3 bars and 3 spaces", () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    CODE128_PATTERNS.slice(0, 106).forEach((p, i) => expect([...p].reduce((s, c) => s + Number(c), 0), `${i}`).toBe(11));
    expect([...CODE128_PATTERNS[106]].reduce((s, c) => s + Number(c), 0)).toBe(13);
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
  });
  it("adds the start, the mod-103 check and the stop", () => {
    // 'A' = 33: (104 + 33×1) mod 103 = 34
    expect(code128Values("A")).toEqual([104, 33, 34, 106]);
    expect(code128Values("90010231")).toHaveLength(8 + 3);
  });
  it("is as wide as the symbols say", () => {
    expect(code128Widths("ABC").reduce((s, w) => s + w, 0)).toBe(11 * 5 + 13);
  });
  it("refuses characters it cannot carry", () => {
    expect(() => code128Values("佐倉")).toThrow();
  });
});

it("数字20桁の検体ラベルを50mm幅に収めるCode 128Cで符号化する", () => {
  const code = "01234567890123456789";
  const values = code128Values(code);
  expect(values[0]).toBe(105);
  expect(values.slice(1, -2).map((n) => String(n).padStart(2, "0")).join("")).toBe(code);
  expect(code128Widths(code).reduce((sum, width) => sum + width, 20) * 0.9).toBeLessThan(175);
});
