import { describe, expect, it } from "vitest";
import { checkDraft, type CheckContext } from "./drafts";
import { CROSS_SETS, expandSet, itemLabel } from "./order-sets";

let n = 0;
const newId = () => `s${++n}`;
const ctx: CheckContext = { activeOrders: [], labOrders: [], drafts: [], nowTime: "08:30", fmtDay: (d) => `D${d}`, describe: (o) => o.id, patientFacts: { sex: "男", age: 70, allergies: [], cre: null } };

describe("セット展開", () => {
  it("names the items", () => {
    const labels = CROSS_SETS[1].items.map(itemLabel);
    expect(labels[0]).toBe("血算・白血球分画・生化学セット・CRP");
    expect(labels[1]).toMatch(/（2セット）$/);
    expect(labels[3]).toBe("胸部X線");
  });
  it("puts only the kept items in, each as a draft the checks still ask about", () => {
    const set = CROSS_SETS[0];
    const ds = expandSet(set, [true, false, true, true], newId);
    expect(ds.map((d) => d.kind)).toEqual(["lab", "imaging", "physio"]);
    for (const d of ds) expect(checkDraft(d, ctx).some((i) => i.level !== "info")).toBe(true); // 時刻などを聞く
  });
  it("orders blood cultures as two sets", () => {
    const ds = expandSet(CROSS_SETS[1], [false, true, false, false], newId);
    expect(ds[0]).toMatchObject({ kind: "lab", cultureSets: 2 });
  });
});
