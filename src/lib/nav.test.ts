import { describe, expect, it } from "vitest";
import { allowedWardTabs, areasFor, homeArea, nextAfterClose, ownerFor, rehome, wardOwner, wardTabLabel, wardTabsFor, type PatientTab } from "./nav";

describe("① places by role", () => {
  it("everyone has 病棟 and the hospital's notices; 外来 is for doctors and nurses", () => {
    for (const r of ["医師", "看護師", "薬剤師", "MSW"] as const) {
      const keys = areasFor(r).map((a) => a.key);
      expect(keys).toContain("ward");
      expect(keys).toContain("board");
      expect(keys).toContain("incident");
    }
    expect(areasFor("医師").map((a) => a.key)).toContain("opd");
    expect(areasFor("薬剤師").map((a) => a.key)).not.toContain("opd");
    expect(areasFor("薬剤師").map((a) => a.key)).toContain("pharmacy");
  });
  it("輸血部門 is the laboratory's", () => {
    expect(areasFor("臨床検査技師").map((a) => a.key)).toEqual(expect.arrayContaining(["lab", "blood"]));
    expect(areasFor("医師").map((a) => a.key)).not.toContain("blood");
  });
  it("each role starts at its own place", () => {
    expect(homeArea("医師")).toBe("ward");
    expect(homeArea("看護師")).toBe("ward");
    expect(homeArea("薬剤師")).toBe("pharmacy");
    expect(homeArea("臨床検査技師")).toBe("lab");
  });
});

describe("② inside 病棟", () => {
  it("offers the patient lists to everyone and the ward's work by role", () => {
    expect(wardTabsFor("医師")).toEqual(["all", "map", "mine", "floor", "handoff", "admit", "beds", "support", "cosign"]);
    // 研修医の記録の確認: doctors, and 医事課 (診療録の管理) to read; not nurses.
    expect(wardTabsFor("医事課")).toContain("cosign");
    expect(wardTabsFor("看護師")).not.toContain("cosign");
    expect(wardTabsFor("MSW")).toContain("support");
    expect(wardTabsFor("看護師")).toContain("sheet");
    expect(wardTabsFor("看護師")).toContain("acuity");
    expect(wardTabsFor("医事課")).not.toContain("handoff");
  });
  it("医事課の仕事: only 医事課 has it, as the ward's work", () => {
    expect(wardTabsFor("医事課")).toContain("iji");
    expect(wardTabsFor("医師")).not.toContain("iji");
    expect(wardTabLabel("iji", "5階東病棟")).toBe("医事課の仕事");
    expect(homeArea("医事課")).toBe("ward");
  });
  it("病棟の食事: the 管理栄養士 starts there, nurses can read it", () => {
    expect(wardTabsFor("管理栄養士")).toContain("meals");
    expect(wardTabsFor("看護師")).toContain("meals");
    expect(wardTabsFor("MSW")).not.toContain("meals");
    expect(homeArea("管理栄養士")).toBe("ward");
  });
  it("勤務表と様式9: for nurses (the 看護師長 uses it), not for the other roles", () => {
    expect(wardTabsFor("看護師")).toContain("roster");
    expect(wardTabsFor("医師")).not.toContain("roster");
    expect(wardTabsFor("薬剤師")).not.toContain("roster");
  });
  it("水分出納 (several patients at once): for nurses, next to the worksheet", () => {
    expect(wardTabsFor("看護師")).toContain("io");
    expect(wardTabsFor("看護師").indexOf("io")).toBe(wardTabsFor("看護師").indexOf("sheet") + 1);
    expect(wardTabsFor("医師")).not.toContain("io");
  });
  it("keeps only allowed screens from saved defaults, once each and in order", () => {
    expect(allowedWardTabs("医師", ["mine", "sheet", "map", "mine", "x" as never])).toEqual(["mine", "map"]);
  });
  it("names ◯階 after the floor chosen", () => {
    expect(wardTabLabel("floor", "6階東病棟")).toBe("6階東病棟");
    expect(wardTabLabel("mine", "6階東病棟")).toBe("受け持ち患者");
  });
});

describe("③ charts under the tab they were opened from", () => {
  const tabs: PatientTab[] = [
    { id: "a", owner: "ward:mine" },
    { id: "b", owner: "ward:map" },
    { id: "c", owner: "ward:mine" },
    { id: "d", owner: "er" },
  ];
  it("opens where already open, else under the tab in front, else the fallback", () => {
    expect(ownerFor(tabs, "b", "ward:mine", "ward:all")).toBe("ward:map");
    expect(ownerFor(tabs, "z", "er", "ward:all")).toBe("er");
    expect(ownerFor(tabs, "z", null, "ward:all")).toBe("ward:all");
  });
  it("after closing, shows the next chart under the same tab, else the tab's own screen", () => {
    expect(nextAfterClose(tabs, "a")).toBe("c");
    expect(nextAfterClose(tabs, "c")).toBe("a");
    expect(nextAfterClose(tabs, "b")).toBeNull();
  });
  it("moves charts under a screen the new role cannot open", () => {
    const moved = rehome([{ id: "a", owner: wardOwner("sheet") }, { id: "d", owner: "er" }], wardTabsFor("医師"));
    expect(moved).toEqual([{ id: "a", owner: "ward:mine" }, { id: "d", owner: "er" }]);
  });
});
