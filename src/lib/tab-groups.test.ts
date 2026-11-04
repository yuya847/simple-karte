import { describe, expect, it } from "vitest";
import { groupByPlace, placeOf } from "./tab-groups";

describe("開いているカルテのタブを場所ごとに", () => {
  it("knows a visit by its key and takes anything else for an inpatient", () => {
    expect(placeOf("er:e1")).toBe("er");
    expect(placeOf("opd:o3")).toBe("opd");
    expect(placeOf("p001")).toBe("ward");
    // An id with a colon that is not a visit is still an inpatient.
    expect(placeOf("x:1")).toBe("ward");
  });

  it("groups 病棟 → 救急外来 → 外来, keeps each chart's order, and leaves empty groups out", () => {
    const ids = ["opd:o1", "p2", "er:e1", "p1", "er:e2"];
    const groups = groupByPlace(ids, placeOf);
    expect(groups.map((g) => [g.key, g.label, g.items])).toEqual([
      ["ward", "病棟", ["p2", "p1"]],
      ["er", "救急外来", ["er:e1", "er:e2"]],
      ["opd", "外来", ["opd:o1"]],
    ]);
    expect(groupByPlace(["p1", "p2"], placeOf).map((g) => g.key)).toEqual(["ward"]);
    expect(groupByPlace([], placeOf)).toEqual([]);
  });

  it("an admitted ED patient: the ward chart is 病棟's, the visit's tab stays 救急外来's", () => {
    // The caller decides the place (the ward chart has a new id; the visit keeps its key).
    const place = (t: { id: string; admittedAs?: string }) => (t.admittedAs ? "ward" : placeOf(t.id));
    const groups = groupByPlace([{ id: "er:e1" }, { id: "p9", admittedAs: "p9" }], place);
    expect(groups.map((g) => [g.key, g.items.map((t) => t.id)])).toEqual([
      ["ward", ["p9"]],
      ["er", ["er:e1"]],
    ]);
  });
});
