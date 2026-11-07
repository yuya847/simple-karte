// 経過と下書きの欄で「囲んで選ぶ」(server render): each card says which record it is (data-pick), nothing is
// chosen at first, and the list the box is drawn in is positioned for it.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PATIENTS } from "@/lib/patients";
import { STAFF, type Role } from "@/lib/roles";
import type { CheckContext, Draft } from "@/lib/drafts";
import { INITIAL_SAVED_SETS } from "@/lib/saved-sets";
import { DraftSetComposer } from "./DraftSetComposer";
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
const base = { today, selectedDay: null, showStopped: false, onToggleStopped: () => {} };

describe("経過のカードを選ぶ", () => {
  const html = as("医師", <HistoryPane {...base} patient={sakura} entries={sakura.history} onDo={() => {}} />);
  it("記事は n:、オーダは o:（Rp のまとまりの中の1行ずつ）で、どのカードも選べる", () => {
    const keys = [...html.matchAll(/data-pick="([^"]+)"/g)].map((m) => m[1]);
    expect(keys.some((k) => k.startsWith("n:"))).toBe(true);
    expect(keys.some((k) => k.startsWith("o:"))).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
    const orders = sakura.history.filter((e) => e.kind === "order").length;
    expect(keys.filter((k) => k.startsWith("o:")).length).toBe(orders);
  });
  it("最初は何も選ばれていない。四角は一覧のスクロールの中に描く", () => {
    expect(html).not.toContain("data-picked");
    expect(html).not.toContain("data-marquee");
    expect(html).toContain("scroll-thin relative min-h-0 flex-1 overflow-y-auto");
  });
});

const ctx: CheckContext = { activeOrders: [], labOrders: [], drafts: [], nowTime: "10:00", fmtDay: () => "", describe: () => "" };
const lab: Draft = { id: "d-lab", origin: "manual", sourceText: "（Do：前の検査から）", comment: null, kind: "lab", tests: [{ code: "SET-ROUTINE", said: "SET-ROUTINE" }], collect: { day: null, when: null, time: null, beforeDose: null }, priority: null, cultureSets: null, duplicateOk: false };
const inj: Draft = { ...INITIAL_SAVED_SETS[0].rows[0].draft, id: "d-inj" };
const stop: Draft = { id: "d-stop", origin: "manual", sourceText: "（経過から中止）", comment: null, kind: "stop", effectiveDay: 0, drugCode: "ORAL-LOX60", said: "ロキソプロフェン", targetOrderId: "x" };
const pane = (drafts: Draft[]) => (
  <TodayPane patient={sakura} today={today} nowTime="10:00" note="" onNoteChange={() => {}} instruction="" onInstructionChange={() => {}} onAppendInstruction={() => {}} drafts={drafts} issues={{}} ctx={ctx} drafting={false} error={null} meta={null} flash={null} onDraft={() => {}} onApply={() => {}} onRemove={() => {}} onRedo={() => {}} onConfirm={() => {}} orderMode="doctor" onConfirmNote={() => {}} noteAt={null} onNoteAt={() => {}} />
);

describe("記事の下の下書きを選ぶ", () => {
  const html = as("医師", pane([lab, inj, stop]));
  it("下書きの1件ずつが選べる（data-pick）。セットに選ぶチェックボックスはもう出ない", () => {
    expect([...html.matchAll(/data-pick="([^"]+)"/g)].map((m) => m[1])).toEqual(["d-lab", "d-inj", "d-stop"]);
    expect(html).not.toContain("セットに含める下書き");
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain(">セットにする</button>");
    expect(html).toContain("scroll-thin relative min-h-0 flex-1 space-y-4 overflow-y-auto");
  });
  it("「セットにする」は選んだ件数で開き、範囲は院内共通・科・部署・個人（最初は個人）", () => {
    const closed = as("医師", <DraftSetComposer drafts={[lab, inj, stop]} ctx={ctx} ids={null} picked={2} onOpen={() => {}} onDone={() => {}} />);
    expect(closed).toContain("セットにする（2）");
    expect(closed).not.toContain("セットの作成");
    const open = as("医師", <DraftSetComposer drafts={[lab, inj, stop]} ctx={ctx} ids={["d-lab", "d-stop"]} picked={2} onOpen={() => {}} onDone={() => {}} />);
    expect(open).toContain("セットにする（1）");
    expect(open).toContain('aria-label="1行目の名前"');
    expect(open).not.toContain('aria-label="2行目の名前"');
    expect([...open.matchAll(/<option[^>]*>([^<]+)<\/option>/g)].map((m) => m[1])).toEqual(["院内共通", "科", "部署", "個人"]);
    expect(open).toMatch(/<option selected="">個人<\/option>|<option value="個人" selected="">個人<\/option>/);
  });
});
