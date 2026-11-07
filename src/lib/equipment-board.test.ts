import { describe, it, expect } from "vitest";
import { boardEquipment } from "./equipment-board";
import { emptyIcuRecords, type VentSetting } from "./icu/types";
import type { OrderEntry } from "./types";

describe("機器一覧", () => {
  it("同じ HD は1行にまとめて以前の記録のIDも保持する", () => {
    const entries = ["a", "b"].map(id => ({ id, status: "有効", order: { type: "procedure", code: "HD", start: { day: 0, time: "08:00" }, hd: { method: "HD" } } })) as OrderEntry[];
    expect(boardEquipment("p", entries)).toMatchObject([{ id: "a", aliases: ["b"], label: "透析 HD" }]);
  });
  it("最新の呼吸器設定だけを表示し、未来と終了を除く", () => {
    const icu = emptyIcuRecords();
    const vent: VentSetting = { id: "v", patientId: "p", at: { day: -1, time: "08:00" }, by: "技士", mode: "A/C-PC", airway: "経口挿管", fio2: 0.4, peep: 8 };
    icu.vents = [vent, { ...vent, id: "future", at: { day: 1, time: "08:00" }, mode: "なし" }];
    expect(boardEquipment("p", [], [], "10:00", icu)[0].label).toBe("人工呼吸器 A/C-PC FiO2 0.4 PEEP 8");
    for (const mode of ["NPPV", "HFNC", "なし"] as const) {
      icu.vents.push({ ...vent, id: mode, at: { day: 0, time: "09:00" }, mode });
      expect(boardEquipment("p", [], [], "10:00", icu).length).toBe(mode === "なし" ? 0 : 1);
      icu.vents.pop();
    }
    icu.crrt = [{ id: "c", patientId: "p", at: { day: 0, time: "09:00" }, by: "技士", mode: "CHDF", qb: 100, qd: 500, qf: 500, removalMlPerH: 50, anticoag: { drug: "なし", ratePerH: 0, unit: "mg/h" }, access: "カテーテル", end: { day: 0, time: "11:00" } }];
    expect(boardEquipment("p", [], [], "10:00", icu).some(x => x.label.startsWith("CHDF"))).toBe(true);
    expect(boardEquipment("p", [], [], "11:00", icu).some(x => x.label.startsWith("CHDF"))).toBe(false);
  });
});
