import { expect, it } from "vitest";
import { openedPanels } from "./use-panel-windows";
it("検査結果を残して食事を開き、引き出しは一つだけ、患者切り替えで全て閉じる", () => {
  const drawer = new Set(["rx", "procedure"]);
  expect(openedPanels(["results"], "diet", drawer)).toEqual(["results", "diet"]);
  expect(openedPanels(["results", "rx"], "procedure", drawer)).toEqual(["results", "procedure"]);
  expect(openedPanels(["results", "diet"], "results", drawer)).toEqual(["diet", "results"]);
  expect(openedPanels(["results", "diet"], null, drawer)).toEqual([]);
});
