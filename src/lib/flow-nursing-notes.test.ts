import { describe, expect, it } from "vitest";
import { nursingNoteLayout, nursingPreview } from "./flow-nursing-notes";
import type { NoteEntry } from "./types";
const note = (time: string, role: NoteEntry["role"] = "看護師"): NoteEntry => ({ kind: "note", day: 0, time, role, author: time + role, text: "本文\n続き" });
describe("経過表の看護記事", () => {
  it("DARの見出しと各欄の冒頭を保ち、SOAP・経時記録も表示する", () => {
    expect(nursingPreview({ ...note("09:00"), focus: [{ title: "疼痛", d: "痛み\n詳細", act: "体位調整", r: "再訪室" }] })).toEqual(["＃疼痛", "D) 痛み / Act) 体位調整 / R) 再訪室"]);
    expect(nursingPreview({ ...note("09:00"), soap: { s: "訴え", o: "観察" } })).toEqual(["＃SOAP", "S) 訴え / O) 観察"]);
    expect(nursingPreview({ ...note("09:00"), timeline: [{ time: "08:50", text: "訪室" }] })).toEqual(["＃経時記録", "08:50 訪室"]);
  });
  it("看護師だけ・全職種を選び、期間の末尾を含めず全文を残す", () => {
    const entries = [note("09:00"), note("09:00", "医師"), note("10:00")];
    const layout = (filter: "nurse" | "all") => nursingNoteLayout(entries, filter, 540, 600, at => at - 540, 300);
    expect(layout("nurse")).toHaveLength(1);
    expect(layout("all")).toHaveLength(2);
    expect(layout("nurse")[0].full).toBe("本文\n続き");
  });
  it("同時刻・隣接する記事を別段に置き、空いた段を再利用して右端を切る", () => {
    const result = nursingNoteLayout([note("09:00"), { ...note("09:00"), author: "別の人" }, note("09:01"), note("09:05")], "nurse", 540, 546, at => (at - 540) * 60, 330);
    expect(result.map(n => n.lane)).toEqual([0, 1, 2, 0]);
    expect(result.map(n => n.left)).toEqual([0, 0, 60, 300]);
    expect(result[3].width).toBe(30);
    expect(new Set(result.map(n => n.key)).size).toBe(4);
  });
});
