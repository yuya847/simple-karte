import { expect, it } from "vitest";
import { resizeColumns } from "./column-resize";

it("境界線の左右だけを変え、全幅を保つ", () => {
  expect(resizeColumns([150, 600, 500, 48], 1, 50)).toEqual([150, 650, 450, 48]);
});
it("日付欄と本文の最小幅を保つ", () => {
  expect(resizeColumns([150, 600, 500, 48], 0, -999)).toEqual([100, 650, 500, 48]);
  expect(resizeColumns([150, 600, 500, 48], 1, 999)).toEqual([150, 860, 240, 48]);
});
it("狭い画面では既存の幅より狭くせず、値が不正なら変更しない", () => {
  expect(resizeColumns([200, 200, 48], 0, 99)).toEqual([200, 200, 48]);
  expect(resizeColumns([400, 400, 48], 0, NaN)).toEqual([400, 400, 48]);
});
