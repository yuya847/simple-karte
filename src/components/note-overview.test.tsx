import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompletedNote, NoteOverviewContext, SummaryCell, TodoCell } from "./NoteOverview";
import { noteTodos } from "@/lib/note-overview";
import type { NoteEntry } from "@/lib/types";
const n: NoteEntry = { kind: "note", id: "n", day: 0, time: "10:00", role: "医師", author: "医師", text: "📋 肺炎\nP)\n☐ CRP再検" };
describe("一覧と記事の完了表示", () => {
  it("一覧の未完了数と記事のチェックを同じ患者の完了記録から描画する", () => {
    const key = noteTodos(n)[0].key;
    const render = (done: boolean) => renderToStaticMarkup(<NoteOverviewContext.Provider value={{ patientId: "p", role: "医師", entriesOf: () => [n], done: done ? { [`p:${key}`]: { by: "山本", at: "2026-11-07T10:30:00+09:00" } } : {}, complete: () => {} }}><SummaryCell id="p" onOpen={() => {}} /><TodoCell id="p" /><CompletedNote note={n} /></NoteOverviewContext.Provider>);
    expect(render(false)).toContain("ToDo 1");
    expect(render(true)).toContain("ToDo 0");
    expect(render(true)).toContain('aria-label="チェック済み"');
    expect(render(true)).toContain("山本");
    expect(render(true)).toContain("bg-ai-soft");
    expect(n.text).toContain("☐ CRP再検");
  });
});
