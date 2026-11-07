// The report screens render (on the server, without a browser): the mark on an order row, the patient's list,
// the ward's list. What is unread and the one-line summary come from reports.ts.
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("レポート一覧の絞り込み", () => {
  const sakura = PATIENTS.find((p) => p.id === "90010231")!;
  const rs = reportsOf(sakura, sakura.history, src);
  afterEach(() => vi.unstubAllGlobals());
  it("shows one row of choices: the kinds the patient has with their numbers, 未読だけ, the period and the search", () => {
    const html = as("医師", <ReportList reports={rs} acks={{}} today={today} onSeen={() => {}} admittedOn={sakura.admittedOn} />);
    expect(html).toContain('aria-label="種類"');
    expect(html).toMatch(/aria-checked="true"[^>]*>すべて \d+</);
    expect(html).toContain(">細菌培養 1<");
    expect(html).not.toContain(">病理 ");
    expect(html).not.toContain(">内視鏡 ");
    expect(html).toContain("未読だけ");
    expect(html).toContain(">全期間<");
    expect(html).toContain(">入院中<");
    expect(html).toContain(">7日<");
    expect(html).toContain('aria-label="レポートを検索"');
    // On a visit there is no 入院中.
    expect(as("医師", <ReportList reports={rs} acks={{}} today={today} />)).not.toContain(">入院中<");
    // No reports, no choices.
    const none = as("医師", <ReportList reports={[]} acks={{}} today={today} />);
    expect(none).toContain("レポートはありません。");
    expect(none).not.toContain('aria-label="種類"');
  });
  it("keeps the choice of this person; with nothing left, says 該当なし with the way back", () => {
    const store = new Map([["simple-karte:report-filter:山本（専攻医）", JSON.stringify({ kind: "病理", unread: true, period: "7日" })]]);
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });
    const html = as("医師", <ReportList reports={rs} acks={{}} today={today} onSeen={() => {}} admittedOn={sakura.admittedOn} />);
    expect(html).toMatch(/aria-checked="true"[^>]*>病理 0</);
    expect(html).toMatch(/<input type="checkbox"[^>]*checked=""/);
    expect(html).toMatch(/aria-checked="true"[^>]*>7日</);
    expect(html).toContain("表示 0件");
    expect(html).toContain("該当なし");
    expect(html).toContain("絞り込みを外す");
    expect(html).not.toContain("未読をすべて確認した");
  });
});

describe("細菌培養のレポート", () => {
  const sakura = PATIENTS.find((p) => p.id === "90010231")!;
  const culture = reportsOf(sakura, [], {}).find((r) => r.kind === "細菌")!;
  it("shows 細菌培養 with its step, and opens to the organism, the Gram stain and the table as the laboratory entered it", () => {
    const html = as("医師", <ReportRows reports={[culture]} acks={{}} today={today} onSeen={() => {}} openKey={culture.key} />);
    expect(html).toContain(">細菌培養<");
    expect(html).toContain(">最終報告<");
    expect(html).toContain("血液培養 2セット");
    expect(html).toContain("採取");
    expect(html).toContain("MIC（μg/mL）");
    expect(html).toMatch(/<td class="font-bold text-shu">R<\/td>/);
    expect(html).toContain('<td class="pr-4">VCM</td>');
    expect(html).not.toContain("訂正");
    expect(html).not.toContain("前の報告");
    expect(html).toMatch(/<button[^>]*>確認した<\/button>/);
  });
  it("lets the reports before the latest be read", () => {
    const later = { ...culture, earlier: [{ at: { day: -1, time: "09:30" }, by: "検査技師 中村", text: "塗抹（グラム染色）：グラム陽性球菌（ブドウ状）（2セット中2セット陽性）" }] };
    const html = as("医師", <ReportRows reports={[later]} acks={{}} today={today} openKey={later.key} />);
    expect(html).toContain("前の報告 1件");
    expect(html).toContain("09:30 検査技師 中村　塗抹（グラム染色）");
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
    expect(empty).not.toContain('aria-label="種類"');
  });
  it("has the same kind chips as the chart, counting the unread reports shown (佐倉さんの血液培養 among them)", () => {
    const html = as("医師", <WardReportList rows={rows} mine={() => true} acks={{}} today={today} onOpen={() => {}} />);
    const unread = rows.reduce((n, r) => n + r.unread, 0);
    expect(html).toContain('aria-label="種類"');
    expect(html).toMatch(new RegExp(`aria-checked="true"[^>]*>すべて ${unread}<`));
    expect(html).toContain(">細菌培養 1<");
    expect(html).toContain("血液培養 2セット");
  });
});
