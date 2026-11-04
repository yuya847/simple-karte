// The nursing-management screens render (on the server, without a browser) from the fictional record.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { initialUlcers } from "@/lib/pressure-course";
import { BEDS_WITH_CHARTS, WARD_CHART_PATIENTS } from "@/lib/ward-charts";
import { PressurePanel } from "./panels/PressurePanel";
import { StatusBoard } from "./StatusBoard";
import { UlcerBoard } from "./UlcerBoard";

const where = (pid: string) => {
  const b = BEDS_WITH_CHARTS.find((x) => x.patientId === pid);
  const p = WARD_CHART_PATIENTS.find((x) => x.id === pid);
  return b && p ? { name: p.name, room: `${b.room}${b.bed}` } : undefined;
};
const pick = { label: "階", value: "5階東病棟", options: [{ value: "5階東病棟", label: "5階東病棟" }], onChange: () => {} };
const fmtDay = (d: number) => `D${d}`;

describe("状態の一括登録", () => {
  const patients = [
    { id: "a", name: "甲 一郎", room: "512", infections: ["MRSA（血液）"] },
    { id: "b", name: "乙 花子", room: "515B", infections: [], rescue: "担送" as const },
  ];
  it("shows every patient with the four categories, the infection's precaution chosen, and the labels of the hospital's own rules", () => {
    const html = renderToStaticMarkup(<StatusBoard pick={pick} patients={patients} book={{}} nowTime="10:00" canType onRegister={() => {}} />);
    expect(html).toContain("2人を登録する");
    expect(html).toContain("まだ登録していません");
    expect(html).toMatch(/aria-pressed="true"[^>]*>接触</);
    expect(html).toContain("医政地発1219第1号");
    expect(html.match(/架空の病院の取り決め/g)!.length).toBeGreaterThanOrEqual(3);
    // 甲 has nothing chosen yet; 乙's 救護区分 comes from the bed.
    expect(html).toContain("未入力：重症度・観察の程度・生活の自由度・救護区分");
    expect(html).toMatch(/<option value="担送" title="[^"]*" selected="">担送/);
  });

  it("says who registered the shift, and a viewer who may not register cannot change it", () => {
    const sheet = { rows: { a: { severity: "重症" as const, observe: "A" as const, freedom: "1" as const, rescue: "担送" as const, precautions: ["接触予防策" as const] } }, by: "看護師 佐藤", at: { day: 0, time: "09:10" } };
    const html = renderToStaticMarkup(<StatusBoard pick={pick} patients={patients} book={{ "0|day": [sheet] }} nowTime="10:00" canType={false} onRegister={() => {}} />);
    expect(html).toContain("登録済み 09:10 看護師 佐藤");
    expect(html).toContain("重症 1");
    expect(html).not.toContain("人を登録する");
  });
});

describe("褥瘡のある患者・褥瘡の経過", () => {
  it("the ward list shows the three fictional patients, overdue first, with the change and the sources", () => {
    const html = renderToStaticMarkup(<UlcerBoard pick={pick} ulcers={initialUlcers()} where={where} fmtDay={fmtDay} onOpen={() => {}} />);
    expect(html).toContain("3人・3か所");
    // 藤井（最後の評価が8日前）が先頭。
    expect(html.indexOf("藤井 さよ")).toBeLessThan(html.indexOf("野口 ハル"));
    expect(html).toContain("期限切れ");
    expect(html).toContain("D3-e3s6i1g3N3p0");
    expect(html).toContain("▼3点");
    expect(html).toContain("架空の見本（図形）");
    expect(html).toContain("保医発0305第7号");
    expect(html).toContain("架空の病院の取り決め");
  });

  it("the chart's course shows each assessment, its total and photo, and the warning on real photos", () => {
    const html = renderToStaticMarkup(<PressurePanel patientId="90035151" ulcers={initialUlcers()} nowTime="10:00" fmtDay={fmtDay} newId={() => "x"} canRecord onChange={() => {}} />);
    expect(html).toContain("仙骨部");
    expect(html).toContain("持ち込み");
    expect(html).toContain("D3-e3s8i1G4N3p0");
    expect(html).toContain("<b>19</b>");
    expect(html).toContain("評価を記録");
    expect(html).toContain("日本褥瘡学会");
    // A viewer who may not record sees the course only.
    const ro = renderToStaticMarkup(<PressurePanel patientId="90035151" ulcers={initialUlcers()} nowTime="10:00" fmtDay={fmtDay} newId={() => "x"} canRecord={false} onChange={() => {}} />);
    expect(ro).not.toContain("＋ 褥瘡を登録");
    expect(ro).not.toContain("治癒とする");
  });
});
