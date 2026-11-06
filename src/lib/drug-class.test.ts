import { describe, expect, it } from "vitest";
import { DRUG_CLASSES, NARCOTICS, docOf, docUrl, drugCodesOf, marksOf, unclassified } from "./drug-class";
import { TOPICAL_DRUGS, FORMULARY_ONLY_ORAL } from "./formulary-expansion";
import { DRUGS, ORAL_DRUGS } from "./master";

describe("規制区分（電子添文から）", () => {
  it("every master drug has a class, and every class is a master drug", () => {
    expect(unclassified()).toEqual([]);
    const master = new Set([...DRUGS.map((d) => d.code), ...ORAL_DRUGS.map((d) => d.code), ...TOPICAL_DRUGS.map(d => d.code), ...FORMULARY_ONLY_ORAL.map(d => d.code)]);
    expect(Object.keys(DRUG_CLASSES).filter((c) => !master.has(c))).toEqual([]);
  });

  it("each class points at a PMDA 電子添文 whose codes include the item", () => {
    for (const [code, c] of Object.entries(DRUG_CLASSES)) {
      if (!c.doc) { expect(c.classificationSource).toContain("医薬品マスター"); continue; }
      expect(docUrl(c.doc).startsWith("https://www.pmda.go.jp/PmdaSearch/iyakuDetail/")).toBe(true);
      expect((docOf(c.doc) as { codes?: readonly string[] }).codes ?? []).toContain(code);
    }
  });

  it("毒薬 and 劇薬 as printed: the platinum and taxane are 毒薬, カロナール錠500 is 劇薬", () => {
    expect(marksOf("INJ-PTX").map((m) => m.key)).toEqual(["毒", "ハイリスク"]);
    expect(marksOf("INJ-CBDCA").map((m) => m.key)).toEqual(["毒", "ハイリスク"]);
    expect(marksOf("ORAL-APAP500").map((m) => m.key)).toEqual(["劇"]);
    expect(marksOf("INJ-NS500")).toEqual([]);
  });

  it("ハイリスク (薬剤管理指導料「1」): K 注射, 抗悪性腫瘍剤, 糖尿病用剤 — not the heparin lock (血液凝固阻止剤は内服薬に限る)", () => {
    expect(DRUG_CLASSES["INJ-KCL20"].b008?.group).toBe("カリウム製剤（注射薬に限る。）");
    expect(DRUG_CLASSES["ORAL-MET250"].b008?.group).toBe("糖尿病用剤");
    expect(DRUG_CLASSES["INJ-HEPLOCK10"].b008).toBeUndefined();
  });

  it("drug codes of an order", () => {
    expect(drugCodesOf({ type: "injection", items: [{ drugCode: "INJ-NS100" }, { drugCode: "INJ-CEZ1" }] })).toEqual(["INJ-NS100", "INJ-CEZ1"]);
    expect(drugCodesOf({ type: "prescription", drugCode: "ORAL-AMLO5" })).toEqual(["ORAL-AMLO5"]);
    expect(drugCodesOf({ type: "lab" })).toEqual([]);
    expect(drugCodesOf(null)).toEqual([]);
  });

  it("麻薬 are the ones the 電子添文 marks 麻薬", () => {
    for (const c of NARCOTICS) expect(DRUG_CLASSES[c].kisei).toContain("麻薬");
  });
});
