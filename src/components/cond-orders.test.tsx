// 条件付き指示 in the 指示簿 render (on the server, without a browser) with what they are given.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { condHits } from "@/lib/cond-orders";
import { PATIENTS } from "@/lib/patients";
import { STAFF, type Role } from "@/lib/roles";
import { initialStanding } from "@/lib/standing";
import { StandingPanel } from "./panels/StandingPanel";
import { MeProvider, RoleProvider } from "./RoleContext";

const kita = PATIENTS.find((p) => p.id === "90010198")!;
const versions = initialStanding()[kita.id];
const hits = condHits(kita.id, versions[0].conds, kita);
const as = (role: Role, el: React.ReactElement) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{el}</MeProvider>
    </RoleProvider>,
  );
const panel = (role: Role, acks = {}) =>
  as(role, <StandingPanel versions={versions} allergies={[]} nowTime="10:00" fmtDay={(d) => `${d}日`} onSave={() => {}} onTake={() => {}} newId={() => "n"} condHits={hits} condAcks={acks} onCondRecord={() => {}} />);

describe("条件付き指示（指示簿）", () => {
  it("shows the rules in the 指示簿 in the doctor's words", () => {
    const html = panel("医師");
    expect(html).toContain("条件付き指示");
    expect(html).toContain("K 4 mmol/L 未満なら：医師へ連絡。カリウムを補うかは医師が決める（看護師は投与しない）");
  });

  it("shows a nurse the value that met a rule, with a place to record what was done", () => {
    const html = panel("看護師");
    expect(html).toContain("条件付き指示に当たる値があります");
    expect(html).toContain("K 3.6 mmol/L（基準 4 mmol/L 未満）");
    expect(html).toContain("対応を記録");
  });

  it("shows the record instead once it is made", () => {
    const html = panel("看護師", { [hits[0].key]: { key: hits[0].key, by: "看護師 佐藤", at: { day: 0, time: "10:05" }, note: "山本医師に連絡した" } });
    expect(html).toContain("対応の記録：10:05 看護師 佐藤「山本医師に連絡した」");
  });

  it("does not let another role record it", () => {
    expect(panel("薬剤師")).toContain("看護師が指示どおりに対応して記録します");
  });
});
