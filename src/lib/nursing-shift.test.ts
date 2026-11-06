import { expect, it } from "vitest";
import { nursingShiftStart } from "./nursing-shift";
import { marState } from "./mar";
import { visibleTabKeys } from "./tab-overflow";
import { oxygenParts, oxygenText } from "./oxygen-input";
it("夜勤は16:30から、17:30は現在の勤務で未記録", () => {
  expect(nursingShiftStart("16:29")).toBe(510);
  expect(nursingShiftStart("16:30")).toBe(990);
  expect(nursingShiftStart("08:29")).toBe(990 - 1440);
  expect(nursingShiftStart("08:30")).toBe(510);
  expect(marState({ orderId: "insulin", at: 1050 }, {}, nursingShiftStart("18:00"), 1080)).toBe("未入力");
});
it("はみ出したタブでも選択中のタブを残す", () => {
  const tabs = Array.from({ length: 10 }, (_, i) => ({ key: String(i), active: i === 8 }));
  expect([...visibleTabKeys(tabs, 3)]).toEqual(["0", "1", "8"]);
});
it("酸素方法と流量を保存し、室内気で流量を外す", () => {
  expect(oxygenParts("鼻カニュラ 2L/分")).toEqual({ device: "鼻カニュラ", flow: "2" });
  expect(oxygenText("ハイフロー", "40")).toBe("ハイフロー 40L/分");
  expect(oxygenText("室内気", "2")).toBe("室内気");
});
