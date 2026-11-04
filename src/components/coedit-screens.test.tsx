// 記事の同時編集 renders (on the server, without a browser): another person's live text with their caret in the
// record list, the 「一緒に直す」 button for someone who may correct notes, and the strip that names them.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseNote } from "@/lib/notes";
import { PATIENTS } from "@/lib/patients";
import type { NoteEditor } from "@/lib/presence";
import { STAFF, type Role } from "@/lib/roles";
import type { NoteEntry } from "@/lib/types";
import type { Coedit } from "@/lib/use-presence";
import { HistoryPane } from "./HistoryPane";
import { LiveNote } from "./LiveNote";
import { MeProvider, RoleProvider } from "./RoleContext";

const sakura = PATIENTS.find((p) => p.id === "90010231")!;
const today = { y: 2026, m: 11, d: 4 };
const as = (role: Role, el: React.ReactElement) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{el}</MeProvider>
    </RoleProvider>,
  );
const note: NoteEntry = { kind: "note", id: "n1", day: 0, time: "08:10", author: "看護師 佐藤", role: "看護師", ...parseNote("S) 熱はない\nO) 体温 36.8\nA) 肺炎 改善\nP) 抗菌薬 続行") };
const editor: NoteEditor = { tab: "tab-b", who: "看護師 佐藤", role: "看護師", patient: sakura.id, note: "n1", label: "08:10 の記事", text: "S) 熱はない。咳が少し\nO) 体温 36.8\nA) 肺炎 改善\nP) 抗菌薬 続行", cursor: 12, seen: 0 };
const coedit = (editors: NoteEditor[]): Coedit => ({ myTab: "tab-a", editors: (k) => editors.filter((e) => e.note === k), typing: () => {}, done: () => {} });

describe("記事の同時編集の画面", () => {
  it("shows the other person's text as they type it, with their caret, in place of the note", () => {
    const html = as("医師", <HistoryPane patient={sakura} coedit={coedit([editor])} onReviseNote={() => {}} entries={[...sakura.history, note]} today={today} nowTime="10:00" selectedDay={null} onSelectDay={() => {}} showStopped={false} onToggleStopped={() => {}} view="record" onView={() => {}} onStopDraft={() => {}} draftedStops={[]} />);
    expect(html).toContain("さんが編集中");
    expect(html).toContain("S) 熱はない。咳が少し");
    expect(html).toContain('aria-label="看護師 佐藤のカーソル"');
    expect(html).toContain("bg-wakatake");
    // A doctor did not write it, but may join while the nurse is correcting it.
    expect(html).toContain("一緒に直す");
  });

  it("without someone correcting, the note is shown as before; a reader who may not correct sees no 一緒に直す", () => {
    const plain = as("医師", <HistoryPane patient={sakura} coedit={coedit([])} entries={[...sakura.history, note]} today={today} nowTime="10:00" selectedDay={null} onSelectDay={() => {}} showStopped={false} onToggleStopped={() => {}} view="record" onView={() => {}} onStopDraft={() => {}} draftedStops={[]} />);
    expect(plain).not.toContain("さんが編集中");
    expect(plain).toContain("熱はない");
    const reader = as("医事課", <HistoryPane patient={sakura} coedit={coedit([editor])} entries={[...sakura.history, note]} today={today} nowTime="10:00" selectedDay={null} onSelectDay={() => {}} showStopped={false} onToggleStopped={() => {}} view="record" onView={() => {}} onStopDraft={() => {}} draftedStops={[]} />);
    expect(reader).toContain("さんが編集中");
    expect(reader).not.toContain("一緒に直す");
  });

  it("merges two people's live texts and places both carets", () => {
    const other: NoteEditor = { ...editor, tab: "tab-c", who: "医師 山本", role: "医師", text: "S) 熱はない\nO) 体温 36.8\nA) 肺炎 改善\nP) 抗菌薬 続行、明日採血", cursor: 36 };
    const html = renderToStaticMarkup(<LiveNote editors={[editor, other]} base="S) 熱はない\nO) 体温 36.8\nA) 肺炎 改善\nP) 抗菌薬 続行" chipOf={(r) => (r === "医師" ? "bg-ai" : "bg-wakatake")} />);
    expect(html).toContain("熱はない。咳が少し");
    expect(html).toContain("明日採血");
    expect(html).toContain('aria-label="看護師 佐藤のカーソル"');
    expect(html).toContain('aria-label="医師 山本のカーソル"');
    expect(html).not.toContain("一緒に直す");
  });
});
