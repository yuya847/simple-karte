import { describe, expect, it } from "vitest";
import { ADOPTED_INJECTIONS, ADOPTED_ORAL, ADOPTED_TOPICAL } from "./formulary-items";
import { DRUGS, ORAL_DRUGS, findDrug, ingredientOf } from "./master";
import { EMPTY_QUERY, formulary, searchFormulary } from "./formulary";
import { loadMaster } from "./masters/server";
import { masterQuantity, officialDrugCode, drugPoints } from "./billing/drug";
import { findInteractions } from "./interactions";
import { generateScenarios } from "./scenarios";
import { antibioticsOf } from "./specialist";
import { doseOptions, validDose } from "./rx-entry";
import { doseOf } from "./narcotic-book";

const items = formulary();
describe("総合病院の採用薬", () => {
  it("内服600・実在注射400・外用150以上を重複なしで収載する", () => {
    const counts = Object.fromEntries(["内服", "注射", "外用"].map(route => [route, items.filter(d => d.route === route).length]));
    expect(counts.内服).toBeGreaterThanOrEqual(600);
    expect(counts.注射).toBeGreaterThanOrEqual(400);
    expect(counts.外用).toBeGreaterThanOrEqual(150);
    expect(new Set(items.map(d => d.code)).size).toBe(items.length);
  });
  it("追加全品目の名称・単位・薬価・YJ・規制区分の原データは公開マスターと一致する", () => {
    const official = new Map(loadMaster("y").rows.map(r => [r[0], r]));
    for (const r of [...ADOPTED_ORAL, ...ADOPTED_INJECTIONS, ...ADOPTED_TOPICAL]) {
      const row = official.get(r[0])!;
      expect(row, r[0]).toBeDefined();
      expect([row[1], row[3], Number(row[5]), row[14], row[17], row[6], Number(row[9])]).toEqual(r.slice(1));
      expect(officialDrugCode(r[0])).toBe(r[0]);
      expect(row[13]).toBe("99999999");
      expect(drugPoints(Number(row[5]))).toBeGreaterThan(0);
    }
  });
  it.each([ ["MEPM", "621948001"], ["VCM 散", "620008047"], ["めろぺねむ", "621948001"], ["CEZ", "INJ-CEZ1"], ["CTRX", "INJ-CTRX1"], ["LVFX", "621925901"], ["MNZ", "620007057"], ["PIPC/TAZ", "622450701"], ["TAZ/PIPC", "622450701"] ])("略語・かなで探せる：%s", (q, code) => {
    const matches = searchFormulary(items, { ...EMPTY_QUERY, q });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.map(d => d.code)).toContain(code);
  });
  it("同一成分の別規格でも既存薬と重複判定できる", () => {
    const amlo = ADOPTED_ORAL.find(r => r[4].startsWith("2171022"))!;
    expect(ingredientOf(amlo[0])).toBe(ingredientOf("ORAL-AMLO5"));
  });
  it("全追加注射・内服の既定単位から算定量に変換できる", () => {
    for (const d of DRUGS.filter(d => /^6\d{8}$/.test(d.code))) expect(masterQuantity(d.code, 1, d.units[0]), d.name).toBeGreaterThan(0);
    for (const d of ORAL_DRUGS) expect(masterQuantity(d.code, 1, d.unit), d.name).toBeGreaterThan(0);
    expect(masterQuantity("621948001", 1, "g")).toBe(2);
    expect(masterQuantity("620008047", 0.125, "g")).toBe(0.25);
    expect(masterQuantity("620008909", 10, "単位")).toBe(0.1);
    expect(doseOptions({ unit: "g" })).toContain("0.125");
    expect(validDose("0.125", { unit: "g" })).toBe(true);
  });
  it("抗がん注射はレジメン限定、追加麻薬のアンプルも施用量を計算できる", () => {
    for (const d of DRUGS.filter(d => d.chemo)) expect(items.find(x => x.code === d.code)?.adoption).toBe("採用（レジメン限定）");
    expect(doseOf({ drugCode: "621208101", amount: 0.05, unit: "mg" })).toEqual({ ampoules: 1, ml: 1 });
  });
  it("MEPMとバルプロ酸の併用禁忌と、規格違いの既存相互作用を拾う", () => {
    const vpa = ADOPTED_ORAL.find(r => r[1].includes("バルプロ酸"))!;
    const hits = findInteractions(["621948001"], [{ code: vpa[0], where: "内服" }]);
    expect(hits.some(h => h.level === "併用禁忌" && h.sources.length > 0)).toBe(true);
    const amlo = ADOPTED_ORAL.find(r => r[1].includes("アムロジピン") && r[4].startsWith("2171022"))!;
    expect(findInteractions([amlo[0]], [{ code: "ORAL-ENA5", where: "内服" }]).length).toBeGreaterThan(0);
  });
  it.each([20261106, 42, 7])("ESBLとCDの筋書きは結果→治療→終了までつながる：%s", seed => {
    const patients = generateScenarios(seed).patients;
    const esbl = patients[7], cd = patients[11];
    const mepm = esbl.history.find(e => e.kind === "order" && e.order.type === "injection" && e.order.items.some(d => d.drugCode === "621948001"));
    expect(mepm?.kind === "order" && mepm.status).toBe("終了");
    expect(esbl.cultures.some(c => c.organism?.includes("ESBL") && c.susceptibility?.some(s => s.drug === "MEPM" && s.result === "S"))).toBe(true);
    expect(esbl.history.some(e => e.kind === "note" && e.text?.includes("MEPM 7日間を完了"))).toBe(true);
    expect(cd.history.some(e => e.kind === "order" && e.order.type === "prescription" && e.order.drugCode === "620008047" && e.order.amount === 0.125 && e.order.timings.length === 4 && e.status === "終了")).toBe(true);
    expect(cd.history.some(e => e.kind === "note" && e.text?.includes("10日間を完了"))).toBe(true);
    if (mepm?.kind === "order" && mepm.order.type === "injection") expect(antibioticsOf([{ ...mepm, status: "有効", order: { ...mepm.order, start: { day: 0, time: "12:00" }, days: 1, end: { day: 0, time: "23:59" } } }]).some(a => a.kind === "許可確認")).toBe(true);
    expect(findDrug("620008909")?.fictional).not.toBe(true);
  });
});
