import { describe, expect, it } from "vitest";
import { eventDays, eventTimeProblem, normalMoment, noteTimes, reviseNote, versionsOf } from "./notes";
import type { NoteEntry } from "./types";

// A nurse writes at 08:10 today what happened at 22:00 yesterday.
const late: NoteEntry = { kind: "note", id: "n1", day: -1, time: "22:00", writtenAt: { day: 0, time: "08:10" }, author: "看護師 佐藤", role: "看護師", text: "22:00 ベッドの横に座り込んでいた。外傷なし。" };

describe("記録時刻と記載時刻", () => {
  it("a late note keeps when it was written; the first version is dated then", () => {
    expect(noteTimes(late)).toEqual({ event: { day: -1, time: "22:00" }, written: { day: 0, time: "08:10" }, updated: null, late: true });
    expect(versionsOf(late)[0]).toMatchObject({ day: 0, time: "08:10" });
  });

  it("a correction adds the update time; 記録時刻 and 記載時刻 do not change", () => {
    const v2 = reviseNote(late, "22:00 ベッドの横に座り込んでいた。外傷なし。当直医へ報告。", "看護師 佐藤", { day: 0, time: "09:00" }, "追記");
    const t = noteTimes(v2);
    expect(t.event).toEqual({ day: -1, time: "22:00" });
    expect(t.written).toEqual({ day: 0, time: "08:10" });
    expect(t.updated).toEqual({ day: 0, time: "09:00" });
    expect(v2.writtenAt).toEqual({ day: 0, time: "08:10" });
  });

  it("a note of the stored record (no 記載時刻) or written at the time is not late", () => {
    const old: NoteEntry = { kind: "note", day: -2, time: "09:00", author: "山本（専攻医）", role: "医師", text: "x" };
    expect(noteTimes(old).late).toBe(false);
    expect(noteTimes({ ...old, writtenAt: { day: -2, time: "09:00" } }).late).toBe(false);
  });

  it("an event time must be a time, not later than now, and not before the admission day", () => {
    const now = { day: 0, time: "10:00" };
    expect(eventTimeProblem({ day: -1, time: "22:00" }, now, -3)).toBeNull();
    expect(eventTimeProblem({ day: 0, time: "10:30" }, now, -3)).toBe("これから先の時刻にはできません。");
    expect(eventTimeProblem({ day: -4, time: "10:00" }, now, -3)).toBe("入院の日より前にはできません。");
    expect(eventTimeProblem({ day: 0, time: "" }, now, -3)).toBe("時刻を「時:分」で入れてください。");
    // After midnight the page's clock runs on (24:30 of day 0 = 00:30 of day 1).
    expect(eventTimeProblem({ day: 1, time: "00:20" }, { day: 0, time: "24:30" }, -3)).toBeNull();
    expect(normalMoment({ day: 0, time: "24:30" })).toEqual({ day: 1, time: "00:30" });
  });

  it("the days offered go back to the admission day, at most a week", () => {
    expect(eventDays({ day: 0, time: "10:00" }, -2)).toEqual([0, -1, -2]);
    expect(eventDays({ day: 0, time: "24:30" }, -20)).toEqual([1, 0, -1, -2, -3, -4, -5, -6]);
  });
});
