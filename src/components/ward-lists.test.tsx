// The patient list and the ward map render (on the server, without a browser) with every inpatient's chart.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PATIENTS } from "@/lib/patients";
import { BEDS_WITH_CHARTS, WARD_CHART_PATIENTS } from "@/lib/ward-charts";
import { ROOMS, WARD_NAME, WARD_PLANS } from "@/lib/ward";
import { admissionPlans, bedsAsOf, dayRange, dischargePlans } from "@/lib/ward-asof";
import { PatientList } from "./PatientList";
import { WardMap } from "./WardMap";

const all = [...PATIENTS, ...WARD_CHART_PATIENTS];
const ward = { beds: BEDS_WITH_CHARTS, patient: (id: string) => all.find((p) => p.id === id) };
const team = new Set(PATIENTS.map((p) => p.id));
const mine = (id: string) => team.has(id);

const fmt = (d: number) => `11/${4 + d}（水）`;
const asOfOn = (day: number) => bedsAsOf(day, { beds: BEDS_WITH_CHARTS, rooms: ROOMS, floors: [WARD_NAME], patient: ward.patient, admissions: admissionPlans(WARD_PLANS), discharges: dischargePlans(BEDS_WITH_CHARTS, ward.patient, () => []) });
const navFor = (asOf: ReturnType<typeof asOfOn>) => ({ day: asOf.day, ...dayRange(asOf), onChange: () => {}, fmtDay: fmt, counts: { admit: asOf.counts.admit, discharge: asOf.counts.discharge } });

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
    expect(html.match(/<button type="button" title="受け持ち以外の患者。押すとカルテが開きます/g)?.length).toBe(BEDS_WITH_CHARTS.length - PATIENTS.length);
    expect(html).not.toContain("受け持ち以外の患者には、入院時の記事");
    expect(html).not.toContain("架空");
    expect(html).not.toContain("カルテを開けません");
  });
});

describe("患者一覧・病棟マップ：日付を動かすと、その日のベッドを出す", () => {
  it("the map today: the date, the counts, the reserved bed as 入院予定, and no band; 転床 is still offered (drag the card, or its menu)", () => {
    const asOf = asOfOn(0);
    const html = renderToStaticMarkup(<WardMap ward={{ beds: asOf.beds, patient: ward.patient }} summaries={{}} mine={mine} onOpen={() => {}} onMove={() => {}} dayNav={navFor(asOf)} asOf={asOf} />);
    expect(html).toContain("今日 11/4（水）");
    expect(html).not.toContain("の見込み");
    expect(html).toContain(`入院 <b class="text-ink">${BEDS_WITH_CHARTS.length}</b>名`);
    expect(html).toContain("（うち入院予定 1）");
    expect(html).toContain("小川 節子");
    expect(html).toContain("入院予定 14:00");
    expect(html).toContain('draggable="true"');
    expect(html).not.toContain(">移動<");
  });

  it("the map tomorrow: the band, the 退院予定 marks, the dotted 入院予定 bed, and the counts of that morning", () => {
    const asOf = asOfOn(1);
    const html = renderToStaticMarkup(<WardMap ward={{ beds: asOf.beds, patient: ward.patient }} summaries={{}} mine={mine} onOpen={() => {}} dayNav={navFor(asOf)} asOf={asOf} />);
    expect(html).toContain("11/5（水）の見込み（予定から計算）");
    expect(html).toContain("明日 11/5（水）");
    expect(html).toContain("今日に戻る");
    expect(html).toContain("退院予定 10:00");
    expect(html).toContain("退院予定 11:00");
    expect(html).toContain("太田 実");
    expect(html).toContain("入院予定 10:30");
    expect(html).toContain("入院予定（11/4（水） 14:00）");
    expect(html).toContain(`入院 <b class="text-ink">${asOf.counts.occupied}</b>名・空床 <b class="text-ink">${asOf.counts.empty}</b>床（うち入院予定 1）`);
    expect(html).toContain('入院 <b class="text-ink">1</b>・退院 <b class="text-ink">2</b>');
    // The day after, the beds left are 空く予定.
    const later = asOfOn(2);
    expect(renderToStaticMarkup(<WardMap ward={{ beds: later.beds, patient: ward.patient }} summaries={{}} mine={mine} onOpen={() => {}} dayNav={navFor(later)} asOf={later} />)).toContain("空く予定");
  });

  it("the map on a past day: the record band, 記録なし where nobody is known, and the patient admitted that day on day 1", () => {
    const asOf = asOfOn(-3);
    const html = renderToStaticMarkup(<WardMap ward={{ beds: asOf.beds, patient: ward.patient }} summaries={{}} mine={mine} onOpen={() => {}} dayNav={navFor(asOf)} asOf={asOf} />);
    expect(html).toContain("11/1（水）の記録から");
    expect(html).toContain("記録なし");
    expect(html).toContain('空床 <b class="text-ink">—</b>床');
    expect(html).toContain(PATIENTS[0].name); // admitted 3 days ago
    expect(html).toContain("入院1日目");
    expect(html).not.toContain("空床</div>");
    const unknown = asOfOn((asOf.firstKnown ?? 0) - 1);
    expect(renderToStaticMarkup(<WardMap ward={{ beds: unknown.beds, patient: ward.patient }} summaries={{}} mine={mine} onOpen={() => {}} dayNav={navFor(unknown)} asOf={unknown} />)).toContain("この日の記録はありません");
  });

  it("the list: no 今日・明日 row any more; the date and the counts in the header; tomorrow's rows carry the marks", () => {
    const today = asOfOn(0);
    const h0 = renderToStaticMarkup(<PatientList ward={{ beds: today.beds, patient: ward.patient }} title="入院患者一覧" nowTime="10:00" changes={{}} summaries={{}} waiting={{}} mine={mine} onOpen={() => {}} dayNav={navFor(today)} asOf={today} />);
    expect(h0).not.toContain("救急から入院");
    expect(h0).not.toMatch(/<b class="text-ink-soft">今日<\/b>/);
    expect(h0).toContain("今日 11/4（水）");
    expect(h0).toContain(`${BEDS_WITH_CHARTS.length + 1}人`); // the 入院予定 row counts as a person
    expect(h0).toContain("入院予定 14:00");
    expect(h0).toContain("小川 節子");
    expect(h0).not.toContain("の見込み");
    const tomorrow = asOfOn(1);
    const h1 = renderToStaticMarkup(<PatientList ward={{ beds: tomorrow.beds, patient: ward.patient }} title="入院患者一覧" nowTime="10:00" changes={{}} summaries={{}} waiting={{}} mine={mine} onOpen={() => {}} dayNav={navFor(tomorrow)} asOf={tomorrow} />);
    expect(h1).toContain("11/5（水）の見込み（予定から計算）");
    expect(h1).toContain("退院予定 10:00");
    expect(h1).toContain("入院予定 10:30");
    expect(h1).toContain("太田 実");
    // 入院◯日目 is counted for that day.
    expect(h1).toContain(`${1 - PATIENTS[0].admittedOn + 1}日目`);
    const later = asOfOn(2);
    expect(renderToStaticMarkup(<PatientList ward={{ beds: later.beds, patient: ward.patient }} title="入院患者一覧" nowTime="10:00" changes={{}} summaries={{}} waiting={{}} mine={mine} onOpen={() => {}} dayNav={navFor(later)} asOf={later} />)).toContain("空く予定");
  });
});
