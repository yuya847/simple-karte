// クリティカルパス in the chart and the ward's list render (on the server, without a browser).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { wardTabsFor } from "@/lib/nav";
import { PATIENTS } from "@/lib/patients";
import { EMPTY_PATHS, type PathBook } from "@/lib/pathway";
import { STAFF, type Role } from "@/lib/roles";
import { PathList } from "./PathList";
import { PathPanel } from "./panels/PathPanel";
import { MeProvider, RoleProvider } from "./RoleContext";
import { ToolRail } from "./ToolRail";

const today = { y: 2026, m: 11, d: 4 };
const oura = PATIENTS.find((p) => p.id === "90010244")!;
const as = (role: Role, el: React.ReactElement) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{el}</MeProvider>
    </RoleProvider>,
  );
const book: PathBook = {
  apps: [{ id: "a1", patientId: oura.id, code: "PATH-ASPN", startDay: -1, by: "山本（専攻医）", at: { day: -1, time: "15:00" }, expanded: ["1-0", "2-0"] }],
  evals: [{ id: "e1", appId: "a1", day: 1, key: "a1-1", result: "達成", by: "看護師 佐藤", role: "看護師", at: { day: -1, time: "18:00" } }],
  variances: [{ id: "v1", appId: "a1", day: 1, outcomeKey: "a1-2", sign: "負", category: "医療者", detail: "抗菌薬の開始が翌朝になった", by: "看護師 佐藤", at: { day: -1, time: "20:00" } }],
};
const panel = (role: Role, b: PathBook) => as(role, <PathPanel patient={oura} book={b} onBook={() => {}} entries={[]} today={today} nowTime="10:00" newId={() => "n"} onDrafts={() => {}} onNote={() => {}} />);

describe("クリティカルパス", () => {
  it("is a tool on the right rail and a screen of 病棟 for doctors and nurses", () => {
    expect(as("医師", <ToolRail open={null} onOpen={() => {}} />)).toContain("パス");
    expect(wardTabsFor("医師")).toContain("paths");
    expect(wardTabsFor("看護師")).toContain("paths");
    expect(wardTabsFor("医事課")).not.toContain("paths");
  });

  it("lets a doctor choose a path, with the fictional hospital's note and no drugs", () => {
    const html = panel("医師", EMPTY_PATHS);
    expect(html).toContain("パスを選ぶ（使うかどうかは医師が決めます）");
    expect(html).toContain("誤嚥性肺炎");
    expect(html).toContain("心不全（急性増悪）");
    expect(html).toContain("蜂窩織炎（下肢）");
    expect(html).not.toContain("架空の病院の取り決め");
    expect(html).toContain("医師が患者ごとに選んでオーダします");
  });

  it("does not let a nurse apply one", () => {
    const html = panel("看護師", EMPTY_PATHS);
    expect(html).toContain("この患者に使っているパスはありません");
    expect(html).not.toContain("パスを選ぶ");
  });

  it("shows the overview by day with today's column, the outcomes due and the variances", () => {
    const html = panel("看護師", book);
    expect(html).toContain("今日は <b class=\"text-ink\">2日目</b>");
    expect(html).toContain("10日目");
    expect(html).toContain("（下書き）");
    expect(html).toContain("入院時のバイタル・SpO2・意識が記録されている");
    // A nurse evaluates the nurses' outcomes; the doctors' are for a doctor.
    expect(html).toContain("達成");
    expect(html).toContain("このアウトカムは医師が評価します");
    expect(html).toContain("抗菌薬の開始が翌朝になった");
    expect(html).toContain("パスを終える・パスから外れるのは医師が決めます");
  });

  it("lets a doctor put the remaining days' orders in and leave or end the path", () => {
    const html = panel("医師", book);
    expect(html).toContain("まだ下書きにしていないオーダ（今日から先）");
    expect(html).toContain("パスから外れる（離脱）");
    expect(html).toContain("パスを終える（完了・退院）");
  });

  it("lists the patients on a path and every variance by category", () => {
    const html = renderToStaticMarkup(<PathList book={book} patientOf={(id) => (id === oura.id ? { name: oura.name, room: "508" } : undefined)} fmt={(d) => `${d}日`} onOpen={() => {}} />);
    expect(html).toContain("大浦 トメ");
    expect(html).toContain("2日目 / 10日");
    expect(html).toContain("医療者 1件");
    expect(html).toContain("抗菌薬の開始が翌朝になった");
  });
});
