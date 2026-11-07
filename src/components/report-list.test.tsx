// The report screens render (on the server, without a browser): the mark on an order row, the patient's list,
// the ward's list. What is unread and the one-line summary come from reports.ts.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { wardTabsFor } from "@/lib/nav";
import { PATIENTS } from "@/lib/patients";
import { initialPhysioDesk } from "@/lib/physio-desk";
import { reportsOf, wardReportRows } from "@/lib/reports";
import { demoRisOrders, initialRisDesk } from "@/lib/ris";
import { STAFF, type Role } from "@/lib/roles";
import { HistoryPane } from "./HistoryPane";
import { ReportList, ReportRows, WardReportList } from "./ReportList";
import { ReportContext } from "./ReportMark";
import { MeProvider, RoleProvider } from "./RoleContext";

const today = { y: 2026, m: 11, d: 4 };
const NOW = 10 * 60;
const src = { ris: initialRisDesk(NOW), physio: initialPhysioDesk(NOW) };
const kitamura = PATIENTS.find((p) => p.id === "90010198")!;
const entries = [...kitamura.history, ...demoRisOrders(NOW)["90010198"]];
const reports = reportsOf(kitamura, entries, src);
const as = (role: Role, el: React.ReactElement) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{el}</MeProvider>
    </RoleProvider>,
  );

describe("オーダ行のレポートの印", () => {
  const pane = <HistoryPane patient={kitamura} entries={entries} today={today} selectedDay={null} showStopped={false} onToggleStopped={() => {}} />;
  it("shows the mark with a red dot on the X-ray order whose report is unread, and gray once confirmed", () => {
    const html = as("医師", <ReportContext.Provider value={{ reports, acks: {}, today }}>{pane}</ReportContext.Provider>);
    expect(html).toContain('aria-label="画像のレポート（未読）を読む"');
    expect(html).toContain("data-unread=\"true\"");
    const seen = as("医師", <ReportContext.Provider value={{ reports, acks: { "ris|o-ris-demo1|v1": { by: "山本（専攻医）", at: { day: 0, time: "10:05" } } }, today }}>{pane}</ReportContext.Provider>);
    expect(seen).toContain('aria-label="画像のレポート（確認済み）を読む"');
    expect(seen).toContain("確認 10:05 山本（専攻医）");
  });
  it("shows nothing without the context (the order rows stay as they were)", () => {
    expect(as("医師", pane)).not.toContain("のレポート（");
  });
});

describe("レポート一覧（カルテ）", () => {
  it("lists newest first with the kind, the reporter, 未読 and the first line, and the sources", () => {
    const html = as("医師", <ReportList reports={reports} acks={{}} today={today} onSeen={() => {}} onOpenImage={() => {}} />);
    expect(html).toContain(`レポート ${reports.length}件`);
    expect(html).toContain("未読 2件");
    expect(html).toContain("未読だけ");
    expect(html).toContain("未読をすべて確認した");
    expect(html).toContain("放射線科 石田");
    expect(html).not.toContain("（架空）");
    expect(html).toContain("前の記録");
    expect(html).not.toContain("画像診断報告書に関する提言");
    expect(html).not.toContain("画像診断報告書の確認不足等に関する医療安全対策についての見解");
    expect(html).not.toContain("架空の病院の取り決め");
    // The row shows the first line of the text, not a summary made here.
    expect(html).toContain("臥位正面（AP）。両側の肋骨横隔膜角は前回（昨日）と同じく鈍。肺血管影の増強は軽度。");
    expect(html.indexOf("心電図") < html.indexOf("ポータブルX線")).toBe(true);
  });
});

describe("病棟のレポート一覧", () => {
  const people = PATIENTS.map((p, i) => ({ patient: p, room: `51${i}`, entries: [...p.history, ...(demoRisOrders(NOW)[p.id] ?? [])] }));
  const rows = wardReportRows(people, src, {});
  it("is a screen of 病棟 for doctors and nurses", () => {
    expect(wardTabsFor("医師")).toContain("reports");
    expect(wardTabsFor("看護師")).toContain("reports");
    expect(wardTabsFor("薬剤師")).not.toContain("reports");
  });
  it("shows each patient's unread reports, 受け持ち first, and opens the chart", () => {
    const html = as("看護師", <WardReportList rows={rows} mine={() => true} acks={{}} today={today} onSeen={() => {}} onOpen={() => {}} />);
    expect(html).toContain("受け持ちだけ");
    expect(html).toContain("北村 博");
    expect(html).toContain("佐倉 修");
    expect(html).toContain("未読 2");
    // The patient's name opens the chart (no 「カルテを開く」 button on each patient).
    expect(html).toMatch(/<button type="button" class="[^"]*hover:underline"><span class="nums text-ink-soft">51\d<\/span><b>北村 博<\/b><\/button>/);
    expect(html).not.toContain("カルテを開く");
    // A nurse reads the open report; 確認 is the doctor's (the button is locked).
    const open = as("看護師", <ReportRows reports={rows[0].reports} acks={{}} today={today} onSeen={() => {}} openKey={rows[0].reports[0].key} />);
    expect(open).toMatch(/<button[^>]*disabled=""[^>]*>確認した<\/button>/);
    expect(open).toContain("結果の確認");
    const doctor = as("医師", <ReportRows reports={rows[0].reports} acks={{}} today={today} onSeen={() => {}} openKey={rows[0].reports[0].key} />);
    expect(doctor).not.toMatch(/disabled=""[^>]*>確認した/);
    const empty = renderToStaticMarkup(<WardReportList rows={rows} mine={() => false} acks={{}} today={today} onOpen={() => {}} />);
    expect(empty).toContain("未読のレポートはありません");
  });
});
