import { describe, expect, it } from "vitest";
import { matchesRecordFacets, recordFacetOptions } from "./record";
import { STAFF } from "./roles";
import type { HistoryEntry } from "./types";
const nurse: HistoryEntry = { kind: "note", day: 0, time: "09:00", author: STAFF.看護師.name, role: "看護師", text: "観察" };
const order: HistoryEntry = { kind: "order", id: "o", day: 0, time: "10:00", author: STAFF.医師.name, status: "中止", order: { type: "lab", codes: [], collect: { day: 0, time: "11:00" }, priority: "定時" } };
describe("記載の科・職種フィルター", () => {
  it("未選択は全件、項目内はOR、項目間はAND（中止判定は既存のまま）", () => {
    expect(matchesRecordFacets(nurse, "総合診療科", [], [])).toBe(true);
    expect(matchesRecordFacets(nurse, "総合診療科", ["総合診療科", "循環器内科"], ["医師", "看護師"])).toBe(true);
    expect(matchesRecordFacets(nurse, "総合診療科", ["循環器内科"], ["看護師"])).toBe(false);
    expect(matchesRecordFacets(nurse, "総合診療科", [], ["薬剤師"])).toBe(false);
    expect(matchesRecordFacets(order, "循環器内科", ["循環器内科"], ["医師"])).toBe(true);
  });
  it("受診の科も含め、存在する候補のみ重複なく返す", () => {
    expect(recordFacetOptions([{ entry: nurse, department: "総合診療科" }, { entry: nurse, department: "総合診療科" }, { entry: order, department: "循環器内科" }])).toEqual({ departments: ["循環器内科", "総合診療科"], roles: ["医師", "看護師"] });
    expect(recordFacetOptions([])).toEqual({ departments: [], roles: [] });
  });
});
