// 退院サマリの一覧 and the approval in the chart render (on the server, without a browser).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emptySections, type DischargeDraft } from "@/lib/discharge";
import { wardTabsFor } from "@/lib/nav";
import { STAFF, type Role, type Staff } from "@/lib/roles";
import { PAST_SUMMARIES, confirmSummary, summaryRows } from "@/lib/summary-approval";
import { MeProvider, RoleProvider } from "./RoleContext";
import { SummaryApproval, SummaryList } from "./SummaryList";

const today = { y: 2026, m: 11, d: 4 };
const yam = "山本（専攻医）";
const as = (role: Role, me: Staff, el: React.ReactElement) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={me}>{el}</MeProvider>
    </RoleProvider>,
  );
const doc = (name: string) => ({ role: "医師" as const, name });
const draft: DischargeDraft = confirmSummary({ patientId: "90010231", dischargeDay: 0, destination: "自宅", outcome: "1", route: "1", sections: { ...emptySections(), course: "軽快" }, status: "作成中", letter: { to: "", dept: "", doctor: "", purpose: "" } }, yam, { day: 0, time: "09:00" });
const rows = summaryRows([{ id: "90010231", name: "佐倉 修", department: "総合診療科", attending: yam, dischargedAt: { day: 0 } }], { "90010231": draft }, PAST_SUMMARIES);

describe("退院サマリの一覧", () => {
  it("is a screen of 病棟 for doctors and 医事課", () => {
    expect(wardTabsFor("医師")).toContain("summaries");
    expect(wardTabsFor("医事課")).toContain("summaries");
    expect(wardTabsFor("看護師")).not.toContain("summaries");
  });

  it("lists each discharge with its state and deadline, last month's rate and the sources", () => {
    const html = as("医事課", STAFF.医事課, <SummaryList rows={rows} today={today} onOpen={() => {}} />);
    expect(html).toContain("佐倉 修");
    expect(html).toContain("竹内 茂");
    expect(html).toContain("期限切れ");
    expect(html).toContain("前月（2026年10月）に退院した");
    expect(html).toContain("施設基準は毎月9割以上");
    expect(html).toContain("保医発0305第7号");
    expect(html).toContain("架空の病院の取り決め");
    expect(html).toContain("架空の過去の記録（カルテなし）");
    expect(html).not.toContain("開いて承認する");
  });

  it("offers the team's 指導医 to open and approve", () => {
    expect(as("医師", doc("指導医 高橋"), <SummaryList rows={rows} today={today} onOpen={() => {}} />)).toContain("開いて承認する");
    expect(as("医師", doc(yam), <SummaryList rows={rows} today={today} onOpen={() => {}} />)).not.toContain("開いて承認する");
  });

  it("in the chart, the approver approves or sends back; the writer sees why not", () => {
    const sup = as("医師", doc("指導医 高橋"), <SummaryApproval record={draft} attending={yam} fmtDay={() => "11/4"} nowTime="10:00" onApprove={() => {}} onReturn={() => {}} />);
    expect(sup).toContain("読んで承認する");
    expect(sup).toContain("差し戻す");
    const self = as("医師", doc(yam), <SummaryApproval record={draft} attending={yam} fmtDay={() => "11/4"} nowTime="10:00" onApprove={() => {}} onReturn={() => {}} />);
    expect(self).toContain("自分が書いたサマリーは承認できません");
    expect(self).not.toContain("読んで承認する");
  });
});
