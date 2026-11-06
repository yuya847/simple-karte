// リハビリテーション部 and the doctor's view render (on the server, without a browser) with what they are given.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PATIENTS } from "@/lib/patients";
import { demoRehabOrders, initialRehabDesk, rehabPrescriptions } from "@/lib/rehab";
import { STAFF, type Role } from "@/lib/roles";
import type { OrderEntry } from "@/lib/types";
import { RehabProgressPanel } from "./panels/RehabProgressPanel";
import { RehabPlanForm } from "./RehabPlanForm";
import { RehabVitals } from "./RehabVitals";
import { RehabView } from "./RehabView";
import { MeProvider, RoleProvider } from "./RoleContext";

const today = { y: 2026, m: 11, d: 4 };
const orders = demoRehabOrders();
const people = PATIENTS.map((p) => ({ patient: p, room: p.room, entries: (orders[p.id] ?? []) as OrderEntry[] }));
const desk = initialRehabDesk();
const as = (role: Role, node: React.ReactNode) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{node}</MeProvider>
    </RoleProvider>,
  );

describe("リハビリテーション部", () => {
  it("shows the therapists' schedule with today's bookings, and locks booking for a nurse", () => {
    const html = as("看護師", <RehabView people={people} desk={desk} onDesk={() => {}} nowTime="09:00" today={today} />);
    expect(html).toContain("予定表");
    expect(html).toContain("理学療法士 木村（PT）");
    expect(html).toContain("北村 博 40分（訓練室）");
    expect(html).toContain("リハビリの予約・受付・実施の記録・ADL の評価は療法士が行います");
  });
  it("受付・実施: while 実施を記録 is disabled, what it still needs stands beside the button", () => {
    const html = as("療法士", <RehabView people={people} desk={desk} onDesk={() => {}} nowTime="09:00" today={today} initialTab="work" />);
    expect(html).toContain("受付（来室した）");
    expect(html).toMatch(/<button type="button" disabled="" class="rounded bg-wakatake [^"]*disabled:bg-rule disabled:text-ink-faint">実施を記録<\/button><span class="text-\[11px\] font-bold text-yamabuki">記録するには：受付がまだです・訓練の内容の要点を書いてください<\/span>/);
    // A nurse: the button is locked for the role, and the list of what is missing is not shown (the lock is explained by DenyNote).
    const nurse = as("看護師", <RehabView people={people} desk={desk} onDesk={() => {}} nowTime="09:00" today={today} initialTab="work" />);
    expect(nurse).not.toContain("記録するには：");
  });
  it("今日の最新だけを表示し、注意文の該当値だけを赤く太字にする", () => {
    const html = renderToStaticMarkup(<RehabVitals caution="HR 120/分以上・SBP 90mmHg未満で中止" vitals={[
      { day: 0, time: "11:00", bt: 37, hr: 120, sbp: 90, dbp: 60, spo2: 98 },
      { day: -1, time: "23:00", hr: 140 },
      { day: 0, time: "07:00", hr: 80 },
    ]} />);
    expect(html).toContain("11:00");
    expect(html).not.toContain("07:00");
    expect(html).toContain('class="mr-2 font-bold text-shu">HR 120/分');
    expect(html).toContain('class="mr-2">BP 90/60mmHg');
    expect(html).not.toContain("判断は療法士");
    expect(renderToStaticMarkup(<RehabVitals caution="" vitals={[{ day: -1, time: "23:00", hr: 140 }]} />)).toContain("今日のバイタル：測定記録なし");
  });
  it("the 実施計画書 has the items of 別紙様式21 and is made by a doctor", () => {
    const kita = rehabPrescriptions(people).find((r) => r.patientId === "90010198")!;
    const html = as("療法士", <RehabPlanForm rx={kita} desk={desk} onDesk={() => {}} nowTime="09:00" fmtDay={(d) => `D${d}`} />);
    expect(html).toContain("目標（今後1か月以内）");
    expect(html).toContain("治療方針（リハビリテーション実施方針）");
    expect(html).toContain("心身機能・構造");
    expect(html).toContain("作成済み・説明済み");
    expect(html).toContain("リハビリテーション開始後原則として7日以内、遅くとも14日以内");
  });
  it("the doctor sees units by day, BI over time and the day counts in the chart", () => {
    const kitamura = PATIENTS.find((p) => p.id === "90010198")!;
    const html = as("医師", <RehabProgressPanel patient={kitamura} entries={orders[kitamura.id]} desk={desk} onDesk={() => {}} today={today} nowTime="09:00" />);
    expect(html).toContain("廃用症候群リハビリテーション料");
    expect(html).toContain("5日目");
    expect(html).toContain("2単位");
    expect(html).toContain("55点 → ");
    expect(html).toContain("1日9単位の対象と判断する（医師）");
  });
});
