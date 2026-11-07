import { describe, expect, it } from "vitest";
import { hourRecord, hourlyCell, hourlyFromValues } from "./hourly-entry";
import type { HourlyRecord } from "./types";

const base = { id: "new", patientId: "p", at: { day: 0, time: "10:00" }, by: "架空看護師" };
const old: HourlyRecord = { id: "h10", patientId: "p", at: { day: 0, time: "10:00" }, by: "前の看護師", urineMl: 40, rass: -1, note: "前の記録" };

describe("経過表から入れる ICU の1時間の記録（保存の形は hourly のまま）", () => {
  it("H:00 の記録は H−1時〜H時の1件を探す", () => {
    const rows: HourlyRecord[] = [old, { ...old, id: "h9", at: { day: 0, time: "09:00" } }];
    expect(hourRecord(rows, "p", 600)?.id).toBe("h10");
    expect(hourRecord(rows, "p", 540)?.id).toBe("h9");
    expect(hourRecord(rows, "p", 660)).toBeUndefined();
    expect(hourRecord(rows, "q", 600)).toBeUndefined();
  });
  it("入れた値で同じ時間の記録を置き換え（id はそのまま）、空の欄は消す", () => {
    const r = hourlyFromValues({ urineMl: "35", rass: "-2", cpot: "1", gcsE: "3", gcsV: "T", gcsM: "6", pupilRight: "3", pupilLeft: "3", reactRight: "+", reactLeft: "遅", camIcu: "陰性", arterialLine: "on" }, old, base);
    expect(r).toMatchObject({ id: "h10", at: { day: 0, time: "10:00" }, by: "架空看護師", urineMl: 35, rass: -2, cpot: 1, gcs: { e: 3, v: "T", m: 6 }, pupils: { right: 3, left: 3, reactRight: "+", reactLeft: "遅" }, camIcu: "陰性", arterialLine: true });
    expect(r.note).toBeUndefined();
    expect(hourlyFromValues({}, undefined, base).id).toBe("new");
  });
  it("範囲の外は保存しない", () => {
    expect(() => hourlyFromValues({ rass: "5" }, old, base)).toThrow("入力値を確かめてください");
    expect(() => hourlyFromValues({ cpot: "9" }, old, base)).toThrow();
    expect(() => hourlyFromValues({ urineMl: "-1" }, old, base)).toThrow();
    expect(() => hourlyFromValues({ gcsE: "5" }, old, base)).toThrow("GCS の値を確かめてください");
  });
  it("経過表の行の文字", () => {
    const r: HourlyRecord = { ...old, rass: 2, map: 70.4, pupils: { right: 3, left: 2.5, reactRight: "+", reactLeft: "-" }, gcs: { e: 1, v: "T", m: 4 } };
    expect([hourlyCell.rass(r), hourlyCell.map(r), hourlyCell.pupils(r), hourlyCell.gcs(r), hourlyCell.cvp(r)]).toEqual(["+2", "70", "3+/2.5-", "E1VTM4", ""]);
  });
});
