// The record draws **太字**, *斜体* and ＃ headings; the note box edits one line at a time, each with a grip.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseNote, reviseNote } from "@/lib/notes";
import { PATIENTS } from "@/lib/patients";
import { STAFF, type Role } from "@/lib/roles";
import type { CheckContext } from "@/lib/drafts";
import type { NoteEntry } from "@/lib/types";
import { HistoryPane } from "./HistoryPane";
import { NoteBlocks } from "./NoteBlocks";
import { NoteText } from "./NoteText";
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

  it("the note box is one line per block, with a grip on each line and the keys in the hint", () => {
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
    const html = as("医師", pane("A)\n＃1 尿路感染症\n  CRP 改善\n＃2 高血圧\n"));
    expect(html).toContain('aria-label="記事"');
    expect(html).not.toContain('aria-label="プロブレムの順番"');
    // Five lines (the trailing line break is an empty fifth line), each a one-row box with a grip.
    expect(html.match(/<textarea /g)?.length).toBe(5);
    expect(html).toContain("＃1 尿路感染症 のブロック（見出しと本文）を動かす（ドラッグか Alt+↑↓）");
    expect(html).toContain("3行目を動かす（ドラッグか Alt+↑↓）");
    expect(html).toContain("⌘B / Ctrl+B");
    expect(html).toContain("半角 # は冠動脈などの番号にそのまま使えます");
    expect(html).toContain("つまみ（⋮⋮）をドラッグ");
    // A locked note (a role that cannot write) has no grips.
    const locked = as("医事課", pane("A)\n＃1 尿路感染症\n"));
    expect(locked).not.toContain("を動かす（ドラッグか");
    expect(locked).toContain('readOnly=""');
  });

  it("NoteBlocks draws the heading lines bolder (＃, SOAP marks, hh:mm) and an empty note as one line", () => {
    const html = renderToStaticMarkup(<NoteBlocks value={"S) 痛みなし\nA)\n＃1 尿路感染症\n  CRP **改善**\n09:30 訪室"} onChange={() => {}} />);
    const boxes = [...html.matchAll(/<textarea ([^>]*)>([^<]*)<\/textarea>/g)].map((m) => ({ attrs: m[1], text: m[2] }));
    expect(boxes.map((b) => b.text)).toEqual(["S) 痛みなし", "A)", "＃1 尿路感染症", "  CRP **改善**", "09:30 訪室"]);
    expect(boxes.map((b) => b.attrs.includes("font-bold"))).toEqual([true, true, true, false, true]);
    expect(boxes.map((b) => b.attrs.includes('data-heading="true"'))).toEqual([true, true, true, false, true]);
    // The marks stay in the text as typed (drawn in the record).
    expect(boxes[3].text).toContain("**");
    expect(boxes[3].attrs).toContain("pointer-coarse:text-[16px]");
    const empty = renderToStaticMarkup(<NoteBlocks value="" onChange={() => {}} />);
    expect(empty.match(/<textarea /g)?.length).toBe(1);
    const frame = renderToStaticMarkup(<NoteBlocks value={"# \nD) \nAct) \nR) \n"} onChange={() => {}} />);
    expect(frame.match(/<textarea /g)?.length).toBe(5);
    expect(frame.match(/data-heading="true"/g)?.length).toBe(4);
  });
});

it("draws a nested problem with its parent number and keeps the written path", () => {
  const html = renderToStaticMarkup(<NoteText text={"＃1 肺炎\n  ＃1-1 喀痰培養\n    ＃1-1-1 結果"} />);
  expect(html).toContain('data-problem-parent="1">  ＃1-1 喀痰培養');
  expect(html).toContain('data-problem-parent="1-1">    ＃1-1-1 結果');
});


it("draws rules only above section labels after the first, retaining editable divider rows", () => {
  const html = renderToStaticMarkup(<NoteBlocks value={"前文\nS)\n＃1 肺炎\n09:30 訪室\nO)\n---\nA)\nP)\nD)\nAct)\nR)\n【経時記録】"} onChange={() => {}} />);
  expect(html.match(/relative grid border-t border-rule/g)?.length).toBe(7);
  expect(html.match(/role="separator"/g)?.length).toBe(1);
  expect(html).toContain('data-divider="true"');
  expect(html).toContain("text-transparent caret-transparent");
  expect(html).toContain("6行目を動かす");
  const first = renderToStaticMarkup(<NoteBlocks value="前文\n【経時記録】\n09:30 訪室" onChange={() => {}} />);
  expect(first).not.toContain("relative grid border-t");
});

it("keeps dividers through confirmation into a history card", () => {
  const text = "S) 痛みなし\n---\n続き\nO) 安定\n―――\n続き";
  const parsed = parseNote(text);
  expect(parsed.soap?.s).toContain("---");
  const entry: NoteEntry = { kind: "note", id: "divider-note", day: 0, time: "09:00", author: "山本", role: "医師", ...parsed };
  const html = as("医師", <HistoryPane patient={sakura} entries={[entry]} today={today} selectedDay={null} showStopped={false} onToggleStopped={() => {}} />);
  expect(html.match(/role="separator"/g)?.length).toBe(2);
  const body = renderToStaticMarkup(<NoteText text={"本文\n---\n―――\n--- 続き"} />);
  expect(body.match(/role="separator"/g)?.length).toBe(2);
  expect(body).toContain("--- 続き");
  expect(body).not.toContain("―――");
});
