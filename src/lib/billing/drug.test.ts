import { describe, expect, it } from "vitest";
import { drugPoints, masterQuantity } from "./drug";

describe("薬剤料 (告示 F200/G100: 15円以下は1点、超えると10円ごとに1点)", () => {
  it.each([
    [6.1, 1],
    [15, 1],
    [15.01, 2],
    [25, 2],
    [25.01, 3],
    [681, 68], // バンコマイシン 0.5g 1瓶: ceil(666/10)+1 = 68
  ])("%s円 → %s点", (yen, pts) => {
    expect(drugPoints(yen)).toBe(pts);
  });

  it("one day of VCM 1g q12h with 生食100mL: 2 doses × (2瓶 × 681 + 1袋 × 144) = 3,012円 → 301点", () => {
    expect(drugPoints(2 * (2 * 681 + 144))).toBe(301);
  });
});

describe("quantities in the master's unit", () => {
  it("1g of a 0.5g vial is 2 vials", () => expect(masterQuantity("INJ-VCM05", 1, "g")).toBe(2));
  it("500mL of a 500mL bag is 1 bag", () => expect(masterQuantity("INJ-NS500", 500, "mL")).toBe(1));
  it("20mg of a 20mg ampoule is 1", () => expect(masterQuantity("INJ-FRS20", 20, "mg")).toBe(1));
  it("tablets stay tablets", () => expect(masterQuantity("ORAL-MGO330", 1, "錠")).toBe(1));
  it("an unknown unit is reported", () => expect(masterQuantity("INJ-VCM05", 1, "mL")).toBeNull());
});
