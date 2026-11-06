import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { RemeasureRows } from "./RemeasureRows";
import { PATIENTS } from "@/lib/patients";
import { markRemeasured } from "@/lib/take-desk-remeasure";

const patient = PATIENTS[0];
const v = { day: 0, time: "11:20", bt: 38.5, hr: 124, sbp: 86, dbp: 50, rr: 28, spo2: 88, avpu: "V" as const };
const props = { people: [{ patient, room: "512", entries: [] }], today: { y: 2026, m: 11, d: 4 }, day: 0, shift: "day" as const, interactive: true, onMeasure: () => {} };
it("患者・確定した値の点数・予定時刻・測った操作と根拠を表示する", () => {
  const html = renderToStaticMarkup(<RemeasureRows {...props} remeasureVitals={{ [patient.id]: [v] }} />);
  for (const text of [patient.name, "11:50", "再測定 NEWS2 15点のため", "測った", "class=\"hint", "rcp.ac.uk"]) expect(html).toContain(text);
});
it("測った・次の測定・別患者・勤務帯を切り分け、印刷に操作を出さない", () => {
  for (const remeasureVitals of [{ [patient.id]: markRemeasured([v]) }, { [patient.id]: [v, { day: 0, time: "11:40" }] }, { other: [v] }]) {
    expect(renderToStaticMarkup(<RemeasureRows {...props} remeasureVitals={remeasureVitals} />)).not.toContain("<tr");
  }
  expect(renderToStaticMarkup(<RemeasureRows {...props} shift="night" remeasureVitals={{ [patient.id]: [v] }} />)).not.toContain("<tr");
  expect(renderToStaticMarkup(<RemeasureRows {...props} interactive={false} remeasureVitals={{ [patient.id]: [v] }} />)).not.toContain("<button");
});
