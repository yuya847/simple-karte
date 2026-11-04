// The sets on the left of the lab order screen: a set opens up to single items (never a set code, the
// 生化学 panel and the hidden PT・APTT pair opened up too), pressing one adds the items missing and
// pressing it again takes them out, and every department set names items the master offers.
import { describe, expect, it } from "vitest";
import { BASIC_SETS, DEPT_SETS, findLabSet, setPicked, singleItemsOf, toggleSet } from "./lab-sets";
import { findLab, findSet } from "./master";

describe("セットの展開", () => {
  it("a hospital set opens up to single items: no set code, no 生化学セット, PT・APTT as PT and APTT", () => {
    const admit = singleItemsOf("SET-ADMIT");
    expect(admit).toContain("LAB-CBC");
    expect(admit).toContain("LAB-DIFF");
    expect(admit).toContain("LAB-TP");
    expect(admit).toContain("LAB-GLU");
    expect(admit).toContain("LAB-CRP");
    expect(admit).toContain("LAB-PT");
    expect(admit).toContain("LAB-APTT");
    expect(admit).not.toContain("LAB-CHEM");
    expect(admit).not.toContain("LAB-COAG");
    expect(admit.some((c) => findSet(c))).toBe(false);
    expect(new Set(admit).size).toBe(admit.length);
    expect(singleItemsOf("LAB-CHEM")).toEqual(["LAB-TP", "LAB-ALB", "LAB-AST", "LAB-ALT", "LAB-LD", "LAB-ALP", "LAB-TBIL", "LAB-BUN", "LAB-CRE", "LAB-NA", "LAB-K", "LAB-CL", "LAB-GLU"]);
    // An item ordered as one test stays as it is.
    expect(singleItemsOf("LAB-CBC")).toEqual(["LAB-CBC"]);
    expect(singleItemsOf("LAB-BGA")).toEqual(["LAB-BGA"]);
  });

  it("基本セット holds the hospital's sets and the 生化学 set; 科別セット one list per department, every item offered", () => {
    expect(BASIC_SETS.map((s) => s.name)).toEqual(["救急初療セット", "入院時採血セット", "定期採血セット", "電解質（Na・K・Cl）", "生化学セット"]);
    expect(DEPT_SETS.map((d) => d.dept)).toEqual(["総合診療科", "循環器内科", "消化器内科", "呼吸器内科", "整形外科"]);
    const all = [...BASIC_SETS, ...DEPT_SETS.flatMap((d) => d.sets)];
    expect(new Set(all.map((s) => s.code)).size).toBe(all.length);
    for (const s of all) {
      expect(s.codes.length, s.name).toBeGreaterThan(0);
      for (const c of s.codes) {
        const t = findLab(c);
        expect(t, `${s.name}: ${c}`).toBeDefined();
        expect(t!.hidden, `${s.name}: ${c} hidden`).toBeUndefined();
        expect(t!.group, `${s.name}: ${c} is a panel`).not.toBe("セット");
      }
    }
    expect(findLabSet("DSET-CARD-HF")?.codes).toContain("LAB-BNP");
    expect(findLabSet("SET-LYTES")?.codes).toEqual(["LAB-NA", "LAB-K", "LAB-CL"]);
  });
});

describe("セットを押す", () => {
  const lytes = findLabSet("SET-LYTES")!;
  it("adds the items missing, keeps what was picked, and does not pick an item twice", () => {
    expect(toggleSet([], lytes)).toEqual(["LAB-NA", "LAB-K", "LAB-CL"]);
    expect(toggleSet(["LAB-K", "LAB-CRP"], lytes)).toEqual(["LAB-K", "LAB-CRP", "LAB-NA", "LAB-CL"]);
    expect(setPicked(["LAB-K", "LAB-CRP", "LAB-NA", "LAB-CL"], lytes)).toBe(true);
    expect(setPicked(["LAB-K"], lytes)).toBe(false);
  });
  it("pressed again when all of its items are picked, takes them out and leaves the rest", () => {
    expect(toggleSet(["LAB-CRP", "LAB-NA", "LAB-K", "LAB-CL"], lytes)).toEqual(["LAB-CRP"]);
  });
});

 it("救急初療は既存マスターの単項目を重複なく選ぶ", () => {
   const er = BASIC_SETS.find((s) => s.code === "SET-ER-INITIAL")!;
   expect(er.codes).toHaveLength(21);
   expect(new Set(er.codes).size).toBe(21);
   for (const c of ["LAB-CBC", "LAB-PT", "LAB-APTT", "LAB-DD", "LAB-BGA", "LAB-TNT", "LAB-BNP", "LAB-LAC", "LAB-GLU"]) expect(er.codes).toContain(c);
 });
