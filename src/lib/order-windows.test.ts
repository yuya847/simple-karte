import { describe, expect, it, vi } from "vitest";
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

it("入力窓は左寄りの760×520を基準にし、小さい画面に収める", async () => {
  const { orderWindowSize } = await import("./order-windows");
  expect(orderWindowSize(1400, 900)).toEqual({ x: 16, y: 190, w: 760, h: 520 });
  expect(orderWindowSize(600, 400)).toEqual({ x: 16, y: 8, w: 568, h: 384 });
});

it("下書きが描画されてから追加した行へ焦点を移す", async () => {
  const { focusDraftLine } = await import("./order-windows");
  const line = { focus: vi.fn(), scrollIntoView: vi.fn() };
  const getElementById = vi.fn(() => line);
  let paint: (() => void) | undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { paint = callback; });
  vi.stubGlobal("document", { getElementById });
  try {
    focusDraftLine("new-rp");
    expect(getElementById).not.toHaveBeenCalled();
    paint!();
    expect(getElementById).toHaveBeenCalledWith("draft-line-new-rp");
    expect(line.focus).toHaveBeenCalledOnce();
    expect(line.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  } finally { vi.unstubAllGlobals(); }
});
