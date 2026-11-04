import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, FLOW_GROUPS, careShown, chooseSet, deleteSet, groupOrder, groupShown, moveGroup, parseLayout, saveSet, toggleCollapsed, toggleHidden } from "./flow-layout";
import { parseFlowPrefs } from "./flow-prefs";

describe("経過表の行の設定", () => {
  it("groups keep their default order until moved; a new group keeps its place", () => {
    expect(groupOrder([])).toEqual(FLOW_GROUPS.map((g) => g.key));
    const l = moveGroup(DEFAULT_LAYOUT, "notes", -1);
    expect(groupOrder(l.order).slice(-2)).toEqual(["notes", "lab"]);
    // An order kept before a group existed: the missing one goes after its default neighbour.
    expect(groupOrder(["obs", "vitals"])).toEqual(["obs", "vitals", "care", "io", "oral", "glucose", "inj", "lab", "notes"]);
    expect(moveGroup(DEFAULT_LAYOUT, "vitals", -1)).toBe(DEFAULT_LAYOUT);
  });

  it("hide and fold", () => {
    const l = toggleCollapsed(toggleHidden(toggleHidden(DEFAULT_LAYOUT, "vitals.o2"), "group:io"), "care");
    expect(l.hidden).toEqual(["vitals.o2", "group:io"]);
    expect(groupShown(l, "io")).toBe(false);
    expect(groupShown(l, "care")).toBe(true);
    expect(l.collapsed).toEqual(["care"]);
    expect(toggleHidden(l, "vitals.o2").hidden).toEqual(["group:io"]);
  });

  it("a set of care rows shows only its items; deleting it shows all again", () => {
    let l = saveSet(DEFAULT_LAYOUT, " 呼吸 ", ["痰の量", "吸引", "痰の量"]);
    expect(l.sets).toEqual([{ name: "呼吸", items: ["痰の量", "吸引"] }]);
    expect(l.activeSet).toBe("呼吸");
    expect(careShown(l, "痰の量")).toBe(true);
    expect(careShown(l, "口腔ケア")).toBe(false);
    l = chooseSet(l, null);
    expect(careShown(l, "口腔ケア")).toBe(true);
    expect(careShown(toggleHidden(l, "care:口腔ケア"), "口腔ケア")).toBe(false);
    l = deleteSet(chooseSet(l, "呼吸"), "呼吸");
    expect([l.sets, l.activeSet]).toEqual([[], null]);
    expect(saveSet(DEFAULT_LAYOUT, "", ["x"])).toBe(DEFAULT_LAYOUT);
  });

  it("a kept layout that is broken falls back to the default", () => {
    expect(parseLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout({ order: ["care", 1], sets: [{ name: "a", items: ["x", 2] }, { bad: true }], activeSet: "b" })).toEqual({ order: ["care"], hidden: [], collapsed: [], sets: [{ name: "a", items: ["x"] }], activeSet: null });
    expect(parseFlowPrefs(JSON.stringify({ layout: { hidden: ["vitals.rr"] } })).layout.hidden).toEqual(["vitals.rr"]);
  });
});
