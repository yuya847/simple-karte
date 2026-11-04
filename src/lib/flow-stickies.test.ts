import { describe, expect, it } from "vitest";
import { GRAPH_NOTE_MAX, canRemoveNote, cleanNote, clusterNotes, notesIn, type GraphNote } from "./flow-stickies";

const note = (id: string, at: number, by = "看護師 佐藤"): GraphNote => ({ id, patientId: "p", at, text: id, by, role: "看護師", written: { day: 0, time: "10:00" } });

describe("経過表のグラフの付箋", () => {
  it("text is trimmed and kept short", () => {
    expect(cleanNote("  解熱剤のあと  再検  ")).toBe("解熱剤のあと 再検");
    expect(cleanNote("あ".repeat(200))).toHaveLength(GRAPH_NOTE_MAX);
    expect(cleanNote("   ")).toBe("");
  });

  it("only the author takes it off", () => {
    expect(canRemoveNote(note("a", 0), "看護師 佐藤")).toBe(true);
    expect(canRemoveNote(note("a", 0), "山本（専攻医）")).toBe(false);
  });

  it("inside the period, in time order; close ones share a marker", () => {
    const ns = [note("c", 900), note("a", 100), note("b", 110), note("z", 5000)];
    expect(notesIn(ns, 0, 1440).map((n) => n.id)).toEqual(["a", "b", "c"]);
    const groups = clusterNotes(notesIn(ns, 0, 1440), (t) => t / 2);
    expect(groups.map((g) => g.notes.map((n) => n.id))).toEqual([["a", "b"], ["c"]]);
  });
});
