import { describe, expect, it } from "vitest";
import { noteMarks, noteTimes, nursingNotesByTime } from "./flow-notes";
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

describe("看護記録の要点", () => {
  it("看護師と日を選び、時刻順・同時刻の記事・全文を保つ", () => {
    const entries: HistoryEntry[] = [
      { kind: "note", day: 0, time: "10:00", author: "a", role: "看護師", soap: { s: "あ".repeat(45) + "\n次の行", o: "所見" } },
      { kind: "note", day: 0, time: "08:00", author: "a", role: "看護師", soap: { s: "", o: "観察\n続き" } },
      { kind: "note", day: 0, time: "08:00", author: "b", role: "看護師", text: "経過\n続き" },
      note(0, "07:00", "医師"), note(-1, "06:00", "看護師"),
    ];
    const result = nursingNotesByTime(entries, 0);
    expect(result.map((n) => n.summary)).toEqual(["観察", "経過", "あ".repeat(40)]);
    expect(result[2].full).toContain("次の行");
    expect(new Set(result.map((n) => n.key)).size).toBe(3);
    expect(entries[0].time).toBe("10:00");
    expect(nursingNotesByTime(entries, -2)).toEqual([]);
  });
  it("フォーカス・経時記録も本文を残す", () => {
    const result = nursingNotesByTime([
      { kind: "note", day: 0, time: "09:00", author: "a", role: "看護師", focus: [{ title: "疼痛", d: "痛みあり" }] },
      { kind: "note", day: 0, time: "10:00", author: "a", role: "看護師", timeline: [{ time: "09:50", text: "訪室" }] },
    ], 0);
    expect(result[0].full).toContain("痛みあり");
    expect(result[1].full).toContain("訪室");
  });
});
