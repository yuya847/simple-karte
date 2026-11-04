// The patient list and the ward map render (on the server, without a browser) with every inpatient's chart.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PATIENTS } from "@/lib/patients";
import { BEDS_WITH_CHARTS, WARD_CHART_PATIENTS } from "@/lib/ward-charts";
import { PatientList } from "./PatientList";
import { WardMap } from "./WardMap";

const all = [...PATIENTS, ...WARD_CHART_PATIENTS];
const ward = { beds: BEDS_WITH_CHARTS, patient: (id: string) => all.find((p) => p.id === id) };
const team = new Set(PATIENTS.map((p) => p.id));
const mine = (id: string) => team.has(id);

describe("患者一覧・病棟マップ：受け持ち以外の患者もカルテが開く", () => {
  it("the list: 「受け持ちを目立たせる」 is on at first; the team gets the full row, the others a gray row that opens", () => {
    const html = renderToStaticMarkup(<PatientList ward={ward} title="患者一覧" nowTime="10:00" changes={{}} summaries={{}} waiting={{}} mine={mine} onOpen={() => {}} />);
    expect(html).toContain("受け持ちを目立たせる");
    expect(html).toMatch(/<input type="checkbox"[^>]*checked=""[^>]*\/>受け持ちを目立たせる/);
    expect(html).toContain(`${BEDS_WITH_CHARTS.length}人`);
    // Full rows (the team) carry the kana line; gray rows say they open.
    for (const p of PATIENTS) expect(html).toContain(p.kana);
    expect(html.match(/押すとカルテが開きます/g)?.length).toBe(BEDS_WITH_CHARTS.length - PATIENTS.length);
    expect(html).not.toContain("カルテを開けません");
    // A gray row shows the day in hospital now that the chart exists.
    const okabe = WARD_CHART_PATIENTS.find((p) => p.name === "岡部 正二")!;
    expect(html).toContain(`${1 - okabe.admittedOn}日目`);
  });

  it("the map: the team's 4 cards, the others gray buttons, and the note on the fictional charts", () => {
    const html = renderToStaticMarkup(<WardMap ward={ward} summaries={{}} mine={mine} onOpen={() => {}} />);
    expect(html).toContain("受け持ち <b class=\"text-ai\">4</b>名");
    expect(html.match(/<button type="button" title="受け持ち以外の患者（架空）。押すとカルテが開きます/g)?.length).toBe(BEDS_WITH_CHARTS.length - PATIENTS.length);
    expect(html).toContain("架空の小さな記録");
    expect(html).not.toContain("カルテを開けません");
  });
});
