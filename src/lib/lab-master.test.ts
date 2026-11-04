// The lab master behind the order screen: codes are unique, every item says what it reports and how it
// is drawn, the blood gas is two items (arterial and venous), the old pair code 凝固 is kept but hidden,
// and every offered item has a billing code and sits in exactly one tab.
import { describe, expect, it } from "vitest";
import { LAB_CODES } from "./billing/codes";
import { LAB_TABS, offeredTests, setPickables, subheadOf, tabSections } from "./lab-catalog";
import { LAB_SOURCES, MORE_LAB_INFO, MORE_LAB_TESTS } from "./lab-master-more";
import { LAB_INFO, LAB_TESTS, ORDER_SETS, findLab, labInfo } from "./master";

describe("検体検査のマスタ", () => {
  it("has no duplicate codes, among items and sets", () => {
    const codes = [...LAB_TESTS.map((t) => t.code), ...ORDER_SETS.map((s) => s.code)];
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(MORE_LAB_TESTS.map((t) => t.code)).size).toBe(MORE_LAB_TESTS.length);
  });

  it("offers 150 or more items, each with aliases, a specimen, and (unless a culture) the analytes it reports", () => {
    const offered = offeredTests();
    expect(offered.length).toBeGreaterThanOrEqual(150);
    for (const t of offered) {
      expect(t.aliases.length, t.code).toBeGreaterThan(0);
      expect(["血液", "尿", "その他"], t.code).toContain(t.specimen);
    }
    // The added items: a culture reports through the 細菌検査 steps, everything else names its analytes.
    for (const t of MORE_LAB_TESTS) {
      if (t.group === "微生物") expect(t.contains, `${t.code} is a culture`).toBeUndefined();
      else expect(t.contains?.length ?? 0, `${t.code} needs contains`).toBeGreaterThan(0);
    }
  });

  it("every added item has its material, container and turnaround", () => {
    for (const t of MORE_LAB_TESTS) {
      expect(MORE_LAB_INFO[t.code], t.code).toBeDefined();
      expect(LAB_INFO[t.code], t.code).toEqual(MORE_LAB_INFO[t.code]);
      const i = labInfo(t.code);
      expect(i.material.length).toBeGreaterThan(0);
      expect(i.container.length).toBeGreaterThan(0);
      expect(i.tat).toMatch(/院内|外注/);
    }
  });

  it("the blood gas is an arterial and a venous item with different materials; the old code stays arterial", () => {
    const gas = offeredTests().filter((t) => t.group === "血液ガス");
    expect(gas.map((t) => t.code).sort()).toEqual(["LAB-BGA", "LAB-VBG"]);
    expect(findLab("LAB-BGA")!.name).toContain("動脈血");
    expect(findLab("LAB-VBG")!.name).toContain("静脈血");
    expect(labInfo("LAB-BGA").material).not.toBe(labInfo("LAB-VBG").material);
    expect(findLab("LAB-VBG")!.contains).toContain("PvO2");
    expect(findLab("LAB-BGA")!.contains).toContain("PaO2");
  });

  it("凝固 is listed as PT, APTT, PT-INR, フィブリノゲン, Dダイマー, FDP and AT III; the old pair code is kept but hidden", () => {
    const coag = offeredTests().filter((t) => t.group === "凝固・線溶").map((t) => t.code);
    for (const c of ["LAB-PT", "LAB-APTT", "LAB-PTINR", "LAB-FIB", "LAB-DD", "LAB-FDP", "LAB-AT3"]) expect(coag).toContain(c);
    expect(coag).not.toContain("LAB-COAG");
    expect(findLab("LAB-COAG")?.hidden).toBe(true);
    expect(findLab("LAB-PT")!.name).toContain("プロトロンビン時間");
    expect(findLab("LAB-APTT")!.name).toContain("活性化部分トロンボプラスチン時間");
  });

  it("every offered item has a billing entry, and sits in exactly one tab (sets on the 院内セット tab)", () => {
    for (const t of offeredTests()) {
      expect(LAB_CODES[t.code], `${t.code} in LAB_CODES`).toBeDefined();
      const tabs = LAB_TABS.filter((tab) => t.group && tab.groups.includes(t.group));
      expect(tabs.length, `${t.code} (${t.group})`).toBe(1);
    }
    const setTab = setPickables(LAB_TESTS).map((p) => p.code);
    expect(setTab).toContain("SET-ADMIT");
    expect(setTab).toContain("LAB-CHEM");
    for (const tab of LAB_TABS.filter((x) => x.key !== "sets")) expect(tabSections(tab, LAB_TESTS).length, tab.label).toBeGreaterThan(0);
  });

  it("the tabs are in the order the ward reads them, with sub-headings where a tab is long", () => {
    expect(LAB_TABS.map((t) => t.label)).toEqual(["院内セット", "血算・血液像", "凝固・線溶", "生化学", "炎症・感染症", "心筋・心不全", "内分泌", "腫瘍マーカー", "免疫・アレルギー", "血液ガス", "尿・便", "微生物", "薬物濃度", "輸血検査"]);
    const chem = tabSections(LAB_TABS.find((t) => t.key === "chem")!, LAB_TESTS).map((s) => s.head);
    expect(chem.slice(0, 4)).toEqual(["蛋白", "肝・胆道", "腎", "電解質・微量元素"]);
    expect(chem).toContain("鉄");
    expect(subheadOf(findLab("LAB-HBA1C")!)).toBe("糖代謝");
    const micro = tabSections(LAB_TABS.find((t) => t.key === "micro")!, LAB_TESTS).map((s) => s.head);
    expect(micro).toEqual(["培養", "塗抹・遺伝子・抗原"]);
    const tx = tabSections(LAB_TABS.find((t) => t.key === "tx")!, LAB_TESTS).flatMap((s) => s.items.map((i) => i.code));
    expect(tx).toEqual(["LAB-ABO", "LAB-IRRAB", "LAB-XMATCH", "LAB-DAT"]);
  });

  it("names its sources with URLs", () => {
    expect(LAB_SOURCES.length).toBeGreaterThanOrEqual(3);
    for (const s of LAB_SOURCES) expect(s.url).toMatch(/^https:\/\//);
    expect(LAB_SOURCES.some((s) => s.name.includes("SRL"))).toBe(true);
    expect(LAB_SOURCES.some((s) => s.name.includes("医科診療行為マスター"))).toBe(true);
  });
});
