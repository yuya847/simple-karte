import { describe, expect, it } from "vitest";
import { canRevise, diffLines, isBlankNote, noteText, parseNote, reviseNote, versionsOf } from "./notes";
import type { NoteEntry } from "./types";

const note: NoteEntry = { kind: "note", day: -1, time: "09:10", author: "山本（専攻医）", role: "医師", soap: { s: "痛みは軽い", a: "蜂窩織炎 改善", p: "CEZ 継続" } };

describe("notes", () => {
  it("reads SOAP from the written text and gives it back", () => {
    const p = parseNote("S) 熱はない\nO) BT 36.8\nA)\nP) 経過観察\n");
    expect(p.soap).toEqual({ s: "熱はない", o: "BT 36.8", p: "経過観察" });
    expect(noteText(p)).toBe("S) 熱はない\nO) BT 36.8\nP) 経過観察");
    expect(parseNote("夜間 良眠。").text).toBe("夜間 良眠。");
  });

  it("treats the bare template as blank", () => {
    expect(isBlankNote("S)\nO)\nA)\nP)\n")).toBe(true);
    expect(isBlankNote("")).toBe(true);
    expect(isBlankNote("S) 痛い")).toBe(false);
  });

  it("a correction keeps every earlier version, with who, when and why", () => {
    const v2 = reviseNote(note, "S) 痛みは軽い\nA) 蜂窩織炎 改善\nP) CEZ 継続、明日 CRP", "山本（専攻医）", { day: 0, time: "08:00" }, "追記");
    expect(v2.day).toBe(-1);
    expect(v2.time).toBe("09:10");
    expect(v2.soap?.p).toBe("CEZ 継続、明日 CRP");
    const vs = versionsOf(v2);
    expect(vs).toHaveLength(2);
    expect(vs[0].soap?.p).toBe("CEZ 継続");
    expect(vs[1]).toMatchObject({ day: 0, time: "08:00", reason: "追記" });
    const v3 = reviseNote(v2, "S) 痛みはない", "山本（専攻医）", { day: 0, time: "09:00" }, "誤記");
    expect(versionsOf(v3)).toHaveLength(3);
  });

  it("only the author corrects a note", () => {
    expect(canRevise(note, "山本（専攻医）")).toBe(true);
    expect(canRevise(note, "看護師 佐藤")).toBe(false);
  });

  it("shows removed and added lines", () => {
    expect(diffLines("a\nb\nc", "a\nB\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "removed", text: "b" },
      { kind: "added", text: "B" },
      { kind: "same", text: "c" },
    ]);
  });
});
