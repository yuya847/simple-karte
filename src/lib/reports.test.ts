import { describe, expect, it } from "vitest";
import { initialEndo } from "./endoscopy";
import { initialPathology } from "./pathology";
import { PATIENTS } from "./patients";
import { initialPhysioDesk } from "./physio-desk";
import { demoRisOrders, initialRisDesk } from "./ris";
import { readStateOf, reportsForOrder, reportsOf, sectionsOf, summaryOf, unreadReports, wardReportRows } from "./reports";

const NOW = 10 * 60;
const ris = initialRisDesk(NOW);
const physio = initialPhysioDesk(NOW);
const pathology = initialPathology(NOW);
const endo = initialEndo(["90010231"], NOW);
const src = { ris, physio, pathology, endo };
const find = (id: string) => PATIENTS.find((p) => p.id === id)!;
const entriesOf = (id: string) => [...find(id).history, ...(demoRisOrders(NOW)[id] ?? [])];

describe("レポートの見出し", () => {
  it("splits a report written as one text at 【診断】【推奨】; the text before is the 所見", () => {
    expect(sectionsOf("左腎は腫大。\n【診断】腎盂腎炎。\n【推奨】解熱しなければ造影 CT。")).toEqual([
      { label: "所見", text: "左腎は腫大。" },
      { label: "診断", text: "腎盂腎炎。" },
      { label: "推奨", text: "解熱しなければ造影 CT。" },
    ]);
    expect(sectionsOf("右下肺野に浸潤影。胸水なし。")).toEqual([{ label: "所見", text: "右下肺野に浸潤影。胸水なし。" }]);
    expect(sectionsOf("")).toEqual([]);
  });
  it("the summary is the first line of the first section, cut out as it is", () => {
    expect(summaryOf({ sections: [{ label: "所見", text: "一行目。\n二行目。" }, { label: "診断", text: "まとめ" }] })).toBe("一行目。");
    expect(summaryOf({ sections: [] })).toBe("");
  });
});

describe("患者のレポート", () => {
  it("lists 画像・生理 of 北村さん newest first, with the keys the results use", () => {
    const rs = reportsOf(find("90010198"), entriesOf("90010198"), src);
    // The ECG was reported after the portable X-ray (physio-desk.ts, ris.ts).
    expect(rs.map((r) => r.kind)).toEqual(["生理", "画像", "画像", "画像"]);
    expect(rs[0].key).toBe("phy|o-phy-demo1|v1");
    expect(rs[0].sections.map((s) => s.label)).toEqual(["測定値", "所見", "まとめ"]);
    expect(rs[1].key).toBe("ris|o-ris-demo1|v1");
    expect(rs[1].orderId).toBe("o-ris-demo1");
    expect(rs[1].region).toBe("胸部");
    expect(rs[1].sections.map((s) => s.label)).toEqual(["所見", "診断", "推奨"]);
    expect(rs[1].imageOf).toBe("o-ris-demo1");
    expect(rs[2].key).toBe("img|img-kita-2");
    expect(rs[3].key).toBe("img|img-kita-1");
    // Reports of other patients are left out.
    expect(rs.every((r) => r.patientId === "90010198")).toBe(true);
  });
  it("the fictional CT reports carry 所見・診断・推奨", () => {
    const ct = reportsOf(find("90010260"), entriesOf("90010260"), src).find((r) => r.key === "img|img-mori-1")!;
    expect(ct.title).toContain("CT");
    expect(ct.sections.map((s) => s.label)).toEqual(["所見", "診断", "推奨"]);
    expect(summaryOf(ct)).toBe(ct.sections[0].text.split("\n")[0]);
  });
  it("finds the reports of an order (the mark on the order row)", () => {
    const rs = reportsOf(find("90010198"), entriesOf("90010198"), src);
    expect(reportsForOrder(rs, "o-ris-demo1").map((r) => r.kind)).toEqual(["画像"]);
    expect(reportsForOrder(rs, "o-phy-demo2")).toEqual([]);
  });
  it("counts unread: today's reports without 確認; before today they are 前の記録", () => {
    const rs = reportsOf(find("90010198"), entriesOf("90010198"), src);
    expect(unreadReports(rs, {}).map((r) => r.key)).toEqual(["phy|o-phy-demo1|v1", "ris|o-ris-demo1|v1"]);
    const ack = { by: "山本（専攻医）", at: { day: 0 as const, time: "10:05" } };
    expect(unreadReports(rs, { "ris|o-ris-demo1|v1": ack }).map((r) => r.key)).toEqual(["phy|o-phy-demo1|v1"]);
    expect(readStateOf(rs[1], { "ris|o-ris-demo1|v1": ack })).toEqual({ state: "確認済み", ack });
    expect(readStateOf(rs[1], {})).toEqual({ state: "未読" });
    expect(readStateOf(rs[3], {})).toEqual({ state: "前の記録" });
  });
  it("today's 超音波 of 佐倉さん is unread; the CTs from admission are not", () => {
    const rs = reportsOf(find("90010231"), entriesOf("90010231"), src);
    expect(unreadReports(rs, {}).map((r) => r.key)).toContain("img|img-sakura-3");
    const oura = reportsOf(find("90010244"), entriesOf("90010244"), src);
    expect(oura.find((r) => r.key === "img|img-oura-2")?.sections.map((s) => s.label)).toEqual(["所見", "診断", "推奨"]);
    expect(unreadReports(oura, {}).map((r) => r.key)).not.toContain("img|img-oura-2");
  });
});

describe("病棟のレポート一覧", () => {
  it("groups by patient, the ones with unread reports first, and leaves out patients without any", () => {
    const people = PATIENTS.map((p, i) => ({ patient: p, room: `51${i}`, entries: entriesOf(p.id) }));
    const rows = wardReportRows(people, src, {});
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].unread).toBeGreaterThan(0);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].unread).toBeGreaterThanOrEqual(rows[i].unread);
    expect(wardReportRows([{ patient: { ...PATIENTS[0], imaging: [] }, room: "500", entries: [] }], {}, {})).toEqual([]);
  });
});
