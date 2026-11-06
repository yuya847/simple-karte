import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCENARIOS } from "@/lib/scenarios";
import { ordersOf } from "@/lib/record";
import { estimatedCcr } from "@/lib/clinical";
import { latestCre } from "@/lib/exams";
import type { TdmReport } from "@/lib/tdm";
import { TdmView } from "./TdmView";

const people = SCENARIOS.cases.filter((c) => c.stage === "入院").map(({ patient }) => ({ patient, room: patient.room, entries: ordersOf(patient.history) }));
const today = { y: 2026, m: 11, d: 6 };
const vcm = people.find((x) => /MRSA|ＭＲＳＡ/.test(x.patient.admissionDiagnosis))!;
const render = (reports: TdmReport[] = [], x = vcm) => renderToStaticMarkup(<TdmView people={[x]} today={today} nowTime="21:00" reports={reports} onReport={() => {}} />);

describe("TDMの実測値と報告", () => {
  it("実測トラフ14.2を保持し、例を入れるボタンを出さない", () => {
    const html = render();
    expect(html).toContain('value="14.2"');
    expect(html).not.toContain("例を入れる");
    expect(html).toContain(`推定CCr ${estimatedCcr(vcm.patient, latestCre(vcm.patient)?.value)?.toFixed(0)}`);
    expect(html).not.toContain("（eGFR");
  });
  it("実測がなければ例を入れられる", () => {
    const x = { ...vcm, patient: { ...vcm.patient, labs: vcm.patient.labs.map((l) => ({ ...l, values: Object.fromEntries(Object.entries(l.values).filter(([k]) => k !== "VCM")) })) } };
    expect(render([], x)).toContain("例を入れる");
  });
  it("報告に日付を付けて新しい日付・時刻から並べる", () => {
    const base: TdmReport = { id: "old", patientId: vcm.patient.id, drug: "バンコマイシン", regimen: { dose: 1000, tau: 12, tinf: 1 }, levels: { peak: { t: 2, c: 28.6 }, trough: { before: 0, c: 14.2 } }, auc24: 500, cmin: 14.2, proposal: "古い報告", at: "23:00", reportedDate: "2026-11-05", by: "薬剤師", status: "医師へ報告" };
    const html = render([base, { ...base, id: "new", reportedDate: "2026-11-06", at: "08:00", proposal: "新しい報告" }]);
    expect(html).toContain("2026-11-06");
    expect(html.indexOf("新しい報告")).toBeLessThan(html.indexOf("古い報告"));
  });
});
