// 実施料 of the picked lab items, read from the official master: the same 診療行為 counts once, the
// 生化学（Ⅰ）and 腫瘍マーカー bundles apply, and items billed elsewhere say so. Every code the order
// screen's items point at must exist in the master.
import { describe, expect, it } from "vitest";
import { offeredTests } from "../lab-catalog";
import { LAB_CODES } from "./codes";
import { expandLabCodes, labPoints } from "./lab-points";
import { shinryoItem } from "./master-items";

describe("検体検査の実施料", () => {
  it("every billing code of the order screen's items is in the 医科診療行為マスター", () => {
    for (const t of offeredTests()) {
      for (const mc of LAB_CODES[t.code] ?? []) {
        const it = shinryoItem(mc);
        expect(it, `${t.code} → ${mc}`).toBeDefined();
        expect(it!.abolished, `${t.code} → ${mc} ${it!.name}`).toBe("99999999");
        expect(it!.kubun, `${t.code} → ${mc}`).toMatch(/^D\d{3}$/);
      }
    }
  });

  it("WBC and Hb are the same 末梢血液一般, counted once", () => {
    const r = labPoints(["LAB-WBC", "LAB-HB"]);
    expect(r.items).toBe(2);
    expect(r.lines.map((l) => l.items[0].code)).toEqual(["160008010", "160008010"]);
    expect(r.total).toBe(shinryoItem("160008010")!.points);
    expect(r.lines[0].items[0].kubun).toBe("D005");
  });

  it("the 生化学 set is 5 items or more of 生化学的検査（Ⅰ）, so its items are one bundled price", () => {
    const r = labPoints(["LAB-CHEM"]);
    expect(expandLabCodes(["SET-ROUTINE"])).toEqual(["LAB-CBC", "LAB-CHEM", "LAB-CRP"]);
    expect(r.items).toBe(1);
    const b = r.bundles.find((x) => x.group === "1");
    expect(b?.count).toBeGreaterThanOrEqual(10);
    expect(b?.points).toBe(103);
    expect(r.total).toBe(103);
  });

  it("two 腫瘍マーカー are 230 points together; one alone keeps its own points", () => {
    expect(labPoints(["LAB-CEA", "LAB-CA199"]).total).toBe(230);
    const one = labPoints(["LAB-CEA"]);
    expect(one.total).toBe(shinryoItem("160036510")!.points);
    expect(one.bundles[0]).toMatchObject({ group: "5", count: 1, points: null });
  });

  it("drug levels and the crossmatch are billed elsewhere, and say so", () => {
    const r = labPoints(["LAB-VCM", "LAB-XMATCH", "LAB-CRP"]);
    expect(r.lines[0].note).toContain("特定薬剤治療管理料");
    expect(r.lines[1].note).toContain("K920");
    expect(r.total).toBe(shinryoItem("160054710")!.points);
  });
});
