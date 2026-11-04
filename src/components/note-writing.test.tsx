// The note editor and the record list render (on the server) with the new tools, forms and times.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseNote, reviseNote } from "@/lib/notes";
import { PATIENTS } from "@/lib/patients";
import { STAFF, type Role } from "@/lib/roles";
import type { CheckContext } from "@/lib/drafts";
import type { NoteEntry } from "@/lib/types";
import { HistoryPane } from "./HistoryPane";
import { MeProvider, RoleProvider } from "./RoleContext";
import { TodayPane } from "./TodayPane";

const sakura = PATIENTS.find((p) => p.id === "90010231")!;
const today = { y: 2026, m: 11, d: 4 };
const as = (role: Role, el: React.ReactElement) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{el}</MeProvider>
    </RoleProvider>,
  );
const ctx: CheckContext = { activeOrders: [], labOrders: [], drafts: [], nowTime: "10:00", fmtDay: () => "", describe: () => "" };
const pane = (note: string, noteAt: { day: number; time: string } | null) => (
  <TodayPane
    patient={sakura}
    today={today}
    nowTime="10:00"
    note={note}
    onNoteChange={() => {}}
    instruction=""
    onInstructionChange={() => {}}
    onAppendInstruction={() => {}}
    drafts={[]}
    issues={{}}
    ctx={ctx}
    drafting={false}
    error={null}
    meta={null}
    flash={null}
    onDraft={() => {}}
    onApply={() => {}}
    onRemove={() => {}}
    onRedo={() => {}}
    onConfirm={() => {}}
    orderMode="doctor"
    onConfirmNote={() => {}}
    noteAt={noteAt}
    onNoteAt={() => {}}
  />
);

describe("記事作成", () => {
  it("has テンプレート and 定型文; the record time is the confirm time unless set", () => {
    const html = as("医師", pane("S)\nO)\nA)\nP)\n", null));
    expect(html).toContain("テンプレート");
    expect(html).toContain("定型文");
    expect(html).toContain("記録時刻を変更する");
    expect(html).not.toContain("記録時刻の根拠");
    // The record forms are for nurses.
    expect(html).not.toContain("フォーカス（DAR）");
  });

  it("a nurse chooses the form; a late time in the future stops the confirm", () => {
    const html = as("看護師", pane("【経時記録】\n09:30 訪室\n", { day: 0, time: "11:00" }));
    expect(html).toMatch(/aria-pressed="true"[^>]*>経時記録</);
    expect(html).toContain("＋今の時刻（10:00）");
    expect(html).toContain("これから先の時刻にはできません。");
    expect(html).toContain("保存の時刻にもどす");
  });
});

describe("左の経過", () => {
  const late: NoteEntry = { kind: "note", id: "n1", day: -1, time: "22:00", writtenAt: { day: 0, time: "08:10" }, author: "看護師 佐藤", role: "看護師", ...parseNote("# 転倒\nD) ベッドの横に座り込んでいた\nAct) 当直医へ報告\nR) 痛みの訴えなし") };
  const revised = reviseNote(late, "# 転倒\nD) ベッドの横に座り込んでいた\nAct) 当直医へ報告\nR) 痛みの訴えなし。朝まで良眠", "看護師 佐藤", { day: 0, time: "09:00" }, "追記");
  const html = as(
    "看護師",
    <HistoryPane patient={sakura} entries={[...sakura.history, revised]} today={today} selectedDay={null} showStopped={false} onToggleStopped={() => {}} />,
  );

  it("shows the focus with D・Act・R, and the part buttons", () => {
    expect(html).toContain("# 転倒");
    expect(html).toContain("Act)");
    // The filter and the search are folded behind two icons (opened by a click, not in this SSR).
    expect(html).toContain('aria-label="絞り込み"');
    expect(html).toContain('aria-label="記録の中を探す"');
    expect(html).not.toContain('aria-label="記載を書いた職種"');
  });

  it("shows 記録時刻, when it was written late, and when it was updated", () => {
    expect(html).toContain("記録 11/3（火） 22:00");
    expect(html).toContain("記載 11/4（水） 08:10（遅れて記載）");
    expect(html).toContain("09:00 看護師 佐藤（第2版）");
  });
});
