import { describe, expect, it } from "vitest";
import { noteMarks, noteTimes } from "./flow-notes";
import type { HistoryEntry } from "./types";

const note = (day: number, time: string, role: "医師" | "看護師" | "薬剤師" | "検査室", author = "x"): HistoryEntry => ({ kind: "note", day, time, role, author, text: "…" });

describe("経過表の記録の印", () => {
  const entries = [note(0, "10:00", "看護師", "佐藤"), note(0, "08:30", "医師", "山本"), note(0, "06:00", "看護師", "田中"), note(0, "13:00", "薬剤師"), note(-1, "09:00", "検査室")];

  it("counts the day's notes by who wrote them, in time order", () => {
    const m = noteMarks(entries, 0);
    expect(m.map((x) => [x.mark, x.count])).toEqual([
      ["医", 1],
      ["看", 2],
      ["他", 1],
    ]);
    expect(m[1].lines).toEqual(["06:00 看護師 田中", "10:00 看護師 佐藤"]);
    expect(noteMarks(entries, -1).map((x) => x.key)).toEqual(["staff"]);
    expect(noteMarks(entries, -2)).toEqual([]);
  });

  it("each note at its time", () => {
    expect(noteTimes(entries).find((n) => n.group === "doctor")?.at).toBe(510);
  });
});
