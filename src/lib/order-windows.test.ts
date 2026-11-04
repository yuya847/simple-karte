import { describe, expect, it } from "vitest";
import { normalizeRightState, orderWindows, showOrderWindow } from "./order-windows";

describe("注射・内服の別ウインドウ", () => {
  it("opens both forms without closing the first or mounting it twice", () => {
    const opened = showOrderWindow(showOrderWindow([], "add-injection"), "add-rx");
    expect(opened).toEqual(orderWindows);
    expect(showOrderWindow(opened, "add-injection")).toBe(opened);
  });
  it("reads old saved tabs as note and removes obsolete tabs", () => {
    for (const rightTab of ["injection", "rx", "unknown", null]) {
      expect(normalizeRightState({ rightTab, openTabs: ["injection", "rx", "injcal", "flowsheet"] })).toEqual({ rightTab: "note", openTabs: ["injcal", "flowsheet"] });
    }
    expect(normalizeRightState({ rightTab: "rxcal" })).toEqual({ rightTab: "rxcal", openTabs: [] });
  });
});
