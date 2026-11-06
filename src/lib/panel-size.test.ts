import { expect, it } from "vitest";
import { labWindowWidth, panelSize, panelWidth } from "./panel-size";

it("短いフォームと表の幅を分け、画面の85%以内に収める", () => {
  expect(panelWidth("add-leave", true)).toBe(640);
  expect(panelWidth("diet", true)).toBe(720);
  expect(panelWidth("results", true)).toBe(960);
  expect(panelSize("standing", true, 390, 700)).toEqual({ x: 8, y: 52.5, w: 374, h: 595 });
});

it("検査時系列は日付1列なら432pxで開き、参照一覧も画面いっぱいにしない", () => {
  expect(labWindowWidth(1)).toBe(432);
  expect(labWindowWidth(20)).toBe(960);
  expect(panelSize("results-timeline", false, 1200, 800, labWindowWidth(1)).w).toBe(432);
  expect(panelWidth("path", true)).toBe(640);
  expect(panelWidth("report-list", true)).toBe(640);
});
