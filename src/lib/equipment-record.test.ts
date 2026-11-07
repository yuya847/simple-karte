import { expect, it } from "vitest";
import { equipmentRecordProblems } from "./equipment-record";
it("CHDFの治療区間をHD指示なしで保存できる", () => {
  expect(equipmentRecordProblems({id:"icu:1:crrt", label:"CHDF 血流量 100"}, "透析実施", "2026-11-07T09:00", "2026-11-07T17:00", "0.4", "100", "ナファモスタット 20mg/h", "異常あり", "")).toEqual([]);
});
it("不足と時刻の逆転・透析以外の機器を検出する", () => {
  expect(equipmentRecordProblems({id:"vent",label:"人工呼吸器"}, "透析実施", "2026-11-07T17:00", "2026-11-07T09:00", "", "0", "", "異常なし", "")).toHaveLength(5);
});
it("一般病棟のHDも同じ入力で保存できる", async () => {
  const { SCENARIOS } = await import("./scenarios");
  const { equipmentOf } = await import("./specialist");
  const device = SCENARIOS.patients.flatMap(p => equipmentOf(p.history.filter(e => e.kind === "order"))).find(e => e.hd?.method === "HD");
  expect(device).toBeDefined();
  expect(equipmentRecordProblems(device, "透析実施", "2026-11-07T09:00", "2026-11-07T13:00", "1", "200", "ヘパリン 試験", "異常なし", "")).toEqual([]);
});
