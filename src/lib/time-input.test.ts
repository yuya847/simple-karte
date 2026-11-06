import { describe, expect, it } from "vitest";
import { HALF_HOUR_TIMES, normalizeTime } from "./time-input";

describe("normalizeTime", () => {
  it.each([
    ["11:00", "11:00"], ["11：00", "11:00"], ["1100", "11:00"],
    ["１１００", "11:00"], ["930", "09:30"], ["9", "09:00"],
    ["11時", "11:00"], ["11時30分", "11:30"], ["11時半", "11:30"],
    ["9:5", "09:05"], ["９時５分", "09:05"], [" 0000 ", "00:00"],
    ["0", "00:00"], ["2359", "23:59"], ["０９：３０", "09:30"],
  ])("%s → %s", (text, expected) => expect(normalizeTime(text)).toBe(expected));
  it.each(["", " ", "24:00", "2400", "24時", "24:01", "25:00", "1260", "9:60", "-1", "11時60分", "abc", "1.5", "9:", "12345", "11時半分", "9:05:00"])("読めない値 %s", (text) => expect(normalizeTime(text)).toBeNull());
  it.each(["24:00", "2400", "２４００", "24時"])("終端の欄だけ %s を許可", (text) => expect(normalizeTime(text, { allow24: true })).toBe("24:00"));
  it.each(["24:01", "24時半", "25:00", "2401"])("allow24 でも %s は不可", (text) => expect(normalizeTime(text, { allow24: true })).toBeNull());
  it("30分ごとの候補は一日48枠", () => {
    expect(HALF_HOUR_TIMES).toHaveLength(48);
    expect(HALF_HOUR_TIMES[0]).toBe("00:00");
    expect(HALF_HOUR_TIMES.at(-1)).toBe("23:30");
  });
});
