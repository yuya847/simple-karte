// The record draws **太字**, *斜体* and ＃ headings; the note box lists the problems to reorder.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseNote, reviseNote } from "@/lib/notes";
import { PATIENTS } from "@/lib/patients";
import { STAFF, type Role } from "@/lib/roles";
import type { CheckContext } from "@/lib/drafts";
import type { NoteEntry } from "@/lib/types";
import { HistoryPane } from "./HistoryPane";
import { NoteText } from "./NoteText";
import { ProblemOrder } from "./ProblemOrder";
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

describe("記事の太字・見出しの表示", () => {
  it("NoteText draws the marks and keeps a plain line as it is", () => {
    const html = renderToStaticMarkup(<NoteText text={"A)\n＃1 尿路感染症\n  CRP **改善**、*軽度*\nLAD #7 90%狭窄"} />);
    expect(html).toContain('<b class="text-ink">＃1 尿路感染症</b>');
    expect(html).toContain("<b>改善</b>");
    expect(html).toContain("<i>軽度</i>");
    expect(html).toContain("LAD #7 90%狭窄");
    expect(html).not.toContain("**");
  });

  it("the record shows a doctor's SOAP with the problem heading bold, in the note and in a correction's diff", () => {
    const note: NoteEntry = { kind: "note", id: "n9", day: 0, time: "09:00", author: "山本（専攻医）", role: "医師", ...parseNote("S) 痛みなし\nA)\n＃1 尿路感染症\n  CRP **改善**\nP) CTRX 継続") };
    const revised = reviseNote(note, "S) 痛みなし\nA)\n＃1 尿路感染症\n  CRP **改善**\n＃2 高血圧\nP) CTRX 継続", "山本（専攻医）", { day: 0, time: "09:30" }, "追記");
    const html = as(
      "医師",
      <HistoryPane patient={sakura} entries={[...sakura.history, revised]} today={today} selectedDay={null} showStopped={false} onToggleStopped={() => {}} />,
    );
    expect(html).toContain('<b class="text-ink">＃1 尿路感染症</b>');
    expect(html).toContain("<b>改善</b>");
  });

  it("the note box lists two or more problems to reorder, with the keys in the hint", () => {
    const pane = (note: string) => (
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
        noteAt={null}
        onNoteAt={() => {}}
      />
    );
    const two = as("医師", pane("A)\n＃1 尿路感染症\n＃2 高血圧\n"));
    expect(two).toContain('aria-label="プロブレムの順番"');
    expect(two).toContain("＃2 高血圧 の順番を変える");
    expect(two).toContain("⌘B / Ctrl+B");
    expect(two).toContain("半角 # は冠動脈などの番号にそのまま使えます");
    const one = as("医師", pane("A)\n＃1 尿路感染症\n"));
    expect(one).not.toContain('aria-label="プロブレムの順番"');
  });

  it("ProblemOrder names each problem with its number", () => {
    const html = renderToStaticMarkup(
      <ProblemOrder
        problems={[
          { number: 1, title: "尿路感染症", from: 1, to: 2, segment: 1 },
          { number: 2, title: "", from: 3, to: 3, segment: 1 },
        ]}
        onMove={() => {}}
      />,
    );
    expect(html).toContain("＃1");
    expect(html).toContain("（名前なし）");
  });
});
