import { expect, it } from "vitest";
import { panelSize, panelWidth } from "./panel-size";

it("短いフォームと表の幅を分け、画面の85%以内に収める", () => {
  expect(panelWidth("add-leave", true)).toBe(640);
  expect(panelWidth("diet", true)).toBe(720);
  expect(panelWidth("results", true)).toBe(960);
  expect(panelSize("standing", true, 390, 700)).toEqual({ x: 8, y: 52.5, w: 374, h: 595 });
});
