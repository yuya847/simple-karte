import { injEntryStep, nextInjectionStart, type InjStep } from "./inj-entry";
import { candidateIndex } from "./rx-entry";
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

describe("処方と同じ注射の状態遷移", () => {
  it("Enter / Tab で量から経路、回数、時刻、時間、開始、日数、確定へ進む", () => {
    const steps: InjStep[] = ["dose", "route", "schedule", "times", "duration", "start", "days", "done"];
    for (let i = 0; i < steps.length - 1; i++) {
      expect(injEntryStep(steps[i], "Enter", true)).toBe(steps[i + 1]);
      expect(injEntryStep(steps[i], "Tab", true)).toBe(steps[i + 1]);
      expect(injEntryStep(steps[i + 1], "Escape", true)).toBe(steps[i]);
    }
  });
  it("点滴以外は時間を飛ばし、不正な量では進まない", () => {
    expect(injEntryStep("times", "Enter", false)).toBe("start");
    expect(injEntryStep("start", "Escape", false)).toBe("times");
    expect(injEntryStep("dose", "Enter", true, false)).toBe("dose");
    expect(injEntryStep("drug", "Escape", true)).toBe("drug");
  });
  it("候補1つなら選択位置にかかわらず確定できる", () => {
    expect(candidateIndex(1, 4)).toBe(0);
    expect(candidateIndex(0, 0)).toBeNull();
  });
  it("回数の既定から次の開始時刻を決める", () => {
    const times = defaultDoseTimes({ kind: "per_day", count: 2 });
    expect(nextInjectionStart(times, "11:00")).toEqual({ day: 0, time: "22:00" });
    expect(nextInjectionStart(times, "23:00")).toEqual({ day: 1, time: "10:00" });
  });
});
