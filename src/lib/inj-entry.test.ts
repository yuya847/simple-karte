import { describe, expect, it } from "vitest";
import { automaticInjectionEnd, defaultDoseTimes, injectionFieldIndex, parseDuration, validateInjectionEnd } from "./inj-entry";
import { doseTimes } from "./flowsheet";
import type { OrderEntry } from "./types";
describe("注射の罫線入力", () => {
  it("架空の既定時刻と6・8時間ごとの時刻", () => {
    expect(defaultDoseTimes({ kind: "per_day", count: 2 })).toEqual(["10:00", "22:00"]);
    expect(defaultDoseTimes({ kind: "every_hours", hours: 8 })).toEqual(["06:00", "14:00", "22:00"]);
    expect(defaultDoseTimes({ kind: "every_hours", hours: 6 })).toEqual(["06:00", "12:00", "18:00", "24:00"]);
    expect(defaultDoseTimes({ kind: "once" })).toEqual([]);
  });
  it("分と時間を解釈し不正な時間を拒否", () => {
    expect(parseDuration("1時間30分")).toBe(90);
    expect(parseDuration("15")).toBe(15);
    expect(automaticInjectionEnd(0, "23:30", 1, [], 90)).toEqual({ day: 1, time: "01:00" });
    expect(parseDuration("24時間")).toBe(1440);
    expect(parseDuration("0")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
  });
  it("終了前後・日数・時刻重複を検証", () => {
    expect(validateInjectionEnd(0, "10:00", 1, 0, "09:00")).not.toEqual([]);
    expect(validateInjectionEnd(0, "10:00", 3, 0, "11:00")).toContain("終了日と日数が一致していません。");
    expect(validateInjectionEnd(0, "10:00", 1, 0, "12:00", 30, ["10:00"])).toEqual([]);
    expect(validateInjectionEnd(0, "10:00", 0, undefined, undefined, 0, ["25:00"])).not.toEqual([]);
    expect(injectionFieldIndex(0, "ArrowLeft", 3)).toBe(0);
    expect(injectionFieldIndex(0, "Enter", 3)).toBe(1);
  });
  it("24時を翌日0時の同じMARキーにし、指定終了で打ち切る", () => {
    const e = { kind: "order", day: 0, author: "山本", id: "inj", status: "有効", time: "05:00", order: { type: "injection", items: [], route: "静注", schedule: { kind: "per_day", count: 4 }, start: { day: 0, time: "05:00" }, doseTimes: ["06:00", "12:00", "18:00", "24:00"], end: { day: 1, time: "01:00" } } } as OrderEntry;
    expect(doseTimes(e, 0, 0, 2880)).toEqual([360, 720, 1080, 1440]);
  });
});
