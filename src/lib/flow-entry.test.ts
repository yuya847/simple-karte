import { describe, expect, it } from "vitest";
import { ENTRY_ACTION, cellWindow, dayTime, ioTimeFor, timeAtX, untakenOf } from "./flow-entry";
import { can } from "./roles";

const at = (day: number, h: number, m = 0) => day * 1440 + h * 60 + m;

describe("経過表のセルから入力", () => {
  it("the time under the pointer, rounded to 5 minutes and not later than now", () => {
    expect(timeAtX(50, 100, at(0, 0), at(1, 0), at(0, 20))).toBe(at(0, 12));
    expect(timeAtX(51, 100, at(0, 0), at(1, 0), at(0, 20))).toBe(at(0, 12, 15));
    expect(timeAtX(99, 100, at(0, 0), at(1, 0), at(0, 10))).toBe(at(0, 10));
    expect(dayTime(at(-1, 14, 20))).toEqual({ day: -1, time: "14:20" });
  });

  it("a day cell covers the day; a time covers its shift", () => {
    expect(cellWindow(-1, null)).toEqual({ lo: at(-1, 0), hi: at(0, 0) });
    expect(cellWindow(0, at(0, 10))).toEqual({ lo: at(0, 8, 30), hi: at(0, 17) });
  });

  it("IN/OUT starts with the time only within the last 24 hours", () => {
    expect(ioTimeFor(at(0, 9, 5), at(0, 10))).toBe("09:05");
    expect(ioTimeFor(at(-2, 9), at(0, 10))).toBeUndefined();
    expect(ioTimeFor(at(0, 11), at(0, 10))).toBeUndefined();
  });

  it("who may: nurses (and doctors, since 2026-11-04) record care and doses; the pharmacist reads them", () => {
    expect(can("看護師", ENTRY_ACTION.mar)).toBe(true);
    expect(can("医師", ENTRY_ACTION.mar)).toBe(true);
    expect(can("薬剤師", ENTRY_ACTION.mar)).toBe(false);
    expect(can("医師", ENTRY_ACTION.vitals)).toBe(true);
    expect(can("薬剤師", ENTRY_ACTION.io)).toBe(false);
    expect(untakenOf(["a|新規", "a|中止", "b|延長"])).toEqual(["a", "b"]);
  });
});
