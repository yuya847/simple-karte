import { describe, expect, it } from "vitest";
import { carryNote, completedNote, refreshCarriedTodos, noteChanged, noteOverview, noteTodos, summaryText } from "./note-overview";
import { noteText, parseNote } from "./notes";
import type { NoteEntry } from "./types";
const note = (id: string, day: number, role: NoteEntry["role"], text: string): NoteEntry => ({ kind: "note", id, day, time: "10:00", role, author: role, ...parseNote(text) });
const old = note("old", -1, "医師", "📋 肺炎\n📋 酸素投与中\nS) 咳\nP)\n☐ CRP再検\n☑ 説明済み");
describe("記事のサマリとToDo", () => {
  it("SOAPの前のサマリを保存・再表示しても先頭に保つ", () => {
    expect(noteText(old)).toMatch(/^📋 肺炎/);
    expect(summaryText(old)).toBe("肺炎\n酸素投与中");
    expect(summaryText(note("late", 0, "医師", "本文\n📋 途中"))).toBe("");
  });
  it("職種別の最新の確定サマリを選ぶ（未来の記事を含めない）", () => {
    const entries = [old, note("new", 0, "医師", "📋 改善"), note("nurse", 0, "看護師", "📋 歩行介助"), note("future", 1, "医師", "📋 未来")];
    expect(noteOverview(entries).summary).toBe("改善");
    expect(noteOverview(entries, "看護師").summary).toBe("歩行介助");
  });
  it("空の記事にだけサマリと未完了をPの下へ引き継ぐ", () => {
    expect(carryNote("S)\nO)\nA)\nP)\n", [old], "医師")).toBe("📋 肺炎\n📋 酸素投与中\nS)\nO)\nA)\nP)\n☐ CRP再検\n");
    expect(carryNote("書きかけ", [old], "医師")).toBe("書きかけ");
    expect(carryNote("", [old], "看護師")).toBe("");
  });
  it("本文を変えず完了記録から件数・引き継ぎ・記事のチェックを反映する", () => {
    const before = JSON.stringify(old);
    const t = noteTodos(old)[0];
    const done = { [t.key]: { by: "山本", at: "2026-11-07T10:30:00+09:00" } };
    expect(noteOverview([old], "医師", done).todos).toHaveLength(0);
    expect(completedNote(old, done)).toContain("☑ CRP再検");
    expect(carryNote("", [old], "医師", done)).not.toContain("☐");
    expect(JSON.stringify(old)).toBe(before);
    expect(noteTodos(note("other", 0, "医師", noteText(old)), done)[0].done).toBe(false);
  });
  it("引き継いだ新しい記事のToDoを重複計上しない", () => {
    const next = note("next", 0, "医師", carryNote("", [old], "医師"));
    expect(noteOverview([old, next]).todos).toHaveLength(1);
    expect(noteTodos(note("dup", 0, "医師", "☐ 同じ\n☐ 同じ")).map(t => t.key)[0]).not.toBe(noteTodos(note("dup", 0, "医師", "☐ 同じ\n☐ 同じ"))[1].key);
  });
});

it("引き継いだ初期文では記事を増やさず、本文の追記とToDo変更は保存する", () => {
  const initial = carryNote("S)\nO)\nA)\nP)\n", [old], "医師");
  expect(noteChanged(initial, initial)).toBe(false);
  expect(noteChanged(initial + "\n", initial)).toBe(false);
  expect(noteChanged(initial + "呼吸苦なし", initial)).toBe(true);
  expect(noteChanged(initial.replace("☐", "☑"), initial)).toBe(true);
  expect(noteChanged("S)\nO)\nA)\nP)\n")).toBe(false);
});

it("初期文に引き継いだ完了済みToDoを除き、再度作られた未完了ToDoは残す", () => {
  const initial = carryNote("", [old], "医師");
  const task = noteTodos(old)[0];
  const done = { [task.key]: { by: "山本", at: "10:30" } };
  expect(refreshCarriedTodos(initial, [old], "医師", done)).not.toContain("☐ CRP再検");
  const reopened = note("reopened", 0, "医師", "📋 再評価\nP)\n☐ CRP再検");
  expect(refreshCarriedTodos(initial, [old, reopened], "医師", done)).toContain("☐ CRP再検");
});
