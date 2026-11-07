import { describe, expect, it } from "vitest";
import { initialEndo } from "./endoscopy";
import { addCultureStep, cultureKey, deskCultures } from "./lab-culture";
import { EMPTY_DESK } from "./lab-desk";
import { initialPathology } from "./pathology";
import { PATIENTS } from "./patients";
import { initialPhysioDesk } from "./physio-desk";
import { demoRisOrders, initialRisDesk } from "./ris";
import { cultureReport, CULTURE_LAB, readStateOf, reportsForOrder, reportsOf, sectionsOf, summaryOf, unreadReports, wardReportRows } from "./reports";
import { PANIC_LIMITS, cultureArrivals, mergeCultures, resultsOf, unseen } from "./results";

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
    expect(wardReportRows([{ patient: { ...PATIENTS[0], imaging: [], cultures: [] }, room: "500", entries: [] }], {}, {})).toEqual([]);
  });
});

describe("細菌培養のレポート", () => {
  const ack = { by: "山本（専攻医）", at: { day: 0 as const, time: "10:05" } };
  const sakura = find("90010231");

  it("the final report of 佐倉さん's blood culture: 菌名 first, the Gram stain with the positive sets, the table as entered", () => {
    const r = reportsOf(sakura, entriesOf(sakura.id), src).find((x) => x.kind === "細菌")!;
    expect(r.title).toBe("血液培養 2セット");
    expect(r.stage).toBe("最終報告");
    expect(r.by).toBe(CULTURE_LAB);
    expect(r.version).toBe(1);
    expect(r.examAt).toEqual({ day: -3, time: "" });
    expect(r.sections).toEqual([
      { label: "菌名", text: "MRSA（メチシリン耐性黄色ブドウ球菌）" },
      { label: "塗抹", text: "グラム陽性球菌（ブドウ状）\n2/2セット陽性" },
    ]);
    // S/I/R and the MIC are the laboratory's: copied as they are, in its order.
    expect(r.susceptibility).toEqual(sakura.cultures[0].susceptibility);
    expect(summaryOf(r)).toBe("MRSA（メチシリン耐性黄色ブドウ球菌）");
    expect(unreadReports([r], {}).map((x) => x.key)).toEqual([r.key]);
  });

  it("uses the key of 未確認の結果: a 確認 in either one is a 確認 in the other", () => {
    const r = reportsOf(sakura, [], {}).find((x) => x.kind === "細菌")!;
    const item = resultsOf(sakura, PANIC_LIMITS).find((i) => i.kind === "培養")!;
    expect(r.key).toBe(item.key);
    // 確認した in the report list → gone from 未確認の結果.
    expect(unseen(resultsOf(sakura, PANIC_LIMITS), { [r.key]: ack }).some((i) => i.kind === "培養")).toBe(false);
    // 確認 from 未確認の結果 → the report shows who and when.
    expect(readStateOf(r, { [item.key]: ack })).toEqual({ state: "確認済み", ack });
    expect(unreadReports([r], { [item.key]: ack })).toEqual([]);
  });

  it("a culture still growing is not a report; a Gram stain from yesterday is 前の記録", () => {
    expect(reportsOf(find("90010198"), [], {}).some((r) => r.kind === "細菌")).toBe(false);
    const mori = reportsOf(find("90010260"), [], {}).find((r) => r.kind === "細菌")!;
    expect(mori.title).toBe("尿培養");
    expect(mori.stage).toBe("塗抹");
    expect(mori.sections).toEqual([{ label: "塗抹", text: "グラム陰性桿菌 10⁵/mL" }]);
    expect(mori.susceptibility).toBeUndefined();
    expect(readStateOf(mori, {})).toEqual({ state: "前の記録" });
  });

  it("as the laboratory goes on (塗抹 → 菌名 → 最終報告), the latest is the body and the ones before can be read; each step is a new report to confirm", () => {
    const oura = find("90010244");
    const arrived = cultureArrivals(NOW)[oura.id][0];
    const item = { key: cultureKey(oura.id, arrived), patientId: oura.id, culture: arrived };
    const by = "検査技師 中村";
    let desk = addCultureStep(EMPTY_DESK, item, { stage: "中間報告", organism: "黄色ブドウ球菌（MSSA）" }, by, NOW + 60);
    const named = deskCultures(desk, oura.id)[0];
    const sir = [
      { drug: "MPIPC", mic: "≦0.25", result: "S" as const },
      { drug: "CEZ", mic: "≦1", result: "S" as const },
      { drug: "LVFX", mic: "4", result: "R" as const },
    ];
    desk = addCultureStep(desk, { ...item, culture: named }, { stage: "最終報告", organism: "黄色ブドウ球菌（MSSA）", susceptibility: sir, note: "2セットとも同じ菌" }, by, NOW + 300);
    const patient = { ...oura, cultures: mergeCultures(mergeCultures(oura.cultures, [arrived]), deskCultures(desk, oura.id)) };
    const r = reportsOf(patient, [], { cultures: desk.cultures }).find((x) => x.kind === "細菌")!;
    expect(r.stage).toBe("最終報告");
    expect(r.by).toBe(by);
    expect(r.at).toEqual({ day: 0, time: "15:00" });
    expect(r.title).toBe("血液培養 2セット");
    expect(r.sections.map((s) => s.label)).toEqual(["菌名", "塗抹", "コメント"]);
    expect(r.susceptibility).toEqual(sir);
    expect(r.earlier).toEqual([
      { at: { day: 0, time: arrived.reportedTime }, by: CULTURE_LAB, text: "塗抹（グラム染色）：グラム陽性球菌（ブドウ状）（2セット中1セット陽性）" },
      { at: { day: 0, time: "11:00" }, by, text: "中間報告（菌名）：黄色ブドウ球菌（MSSA）" },
    ]);
    // The key moved on with the step: a 確認 of the Gram stain does not cover the final report.
    const gramKey = cultureReport(oura.id, arrived).key;
    expect(r.key).not.toBe(gramKey);
    expect(unreadReports([r], { [gramKey]: ack })).toEqual([r]);
    expect(resultsOf(patient, PANIC_LIMITS).find((i) => i.kind === "培養")!.key).toBe(r.key);
  });
});
