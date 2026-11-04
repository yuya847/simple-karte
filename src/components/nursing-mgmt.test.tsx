// The nursing-management screens render (on the server, without a browser) from the fictional record.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { initialUlcers } from "@/lib/pressure-course";
import { BEDS_WITH_CHARTS, WARD_CHART_PATIENTS } from "@/lib/ward-charts";
import { PressurePanel } from "./panels/PressurePanel";
import { UlcerBoard } from "./UlcerBoard";

const where = (pid: string) => {
  const b = BEDS_WITH_CHARTS.find((x) => x.patientId === pid);
  const p = WARD_CHART_PATIENTS.find((x) => x.id === pid);
  return b && p ? { name: p.name, room: `${b.room}${b.bed}` } : undefined;
};
const pick = { label: "階", value: "5階東病棟", options: [{ value: "5階東病棟", label: "5階東病棟" }], onChange: () => {} };
const fmtDay = (d: number) => `D${d}`;

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
