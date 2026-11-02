import { describe, expect, it } from "vitest";
import { encodeSjis, sjisLength, unencodable } from "./sjis";

describe("Shift_JIS for the receipt file", () => {
  it("encodes ASCII as one byte and 全角 as two", () => {
    expect([...encodeSjis("IR,1")]).toEqual([0x49, 0x52, 0x2c, 0x31]);
    expect([...encodeSjis("あ")]).toEqual([0x82, 0xa0]);
    expect([...encodeSjis("　")]).toEqual([0x81, 0x40]);
    expect(sjisLength("佐倉　修")).toBe(8);
  });
  it("writes the long vowel mark as 815B", () => expect([...encodeSjis("ー")]).toEqual([0x81, 0x5b]));
  it("keeps CR LF as is", () => expect([...encodeSjis("A\r\n")]).toEqual([0x41, 0x0d, 0x0a]));
  it("refuses vendor extensions such as ① (NEC 特殊文字) and emoji", () => {
    expect(unencodable("①😀あ")).toEqual(["①", "😀"]);
  });
  it("a master name round-trips (ＴＰ・ナトリウム及びクロール)", () => {
    expect(unencodable("ＴＰ　ナトリウム及びクロール　点滴注射")).toEqual([]);
  });
});
