import { describe, expect, it } from "vitest";
import { emptyStanding } from "./standing";
import { BULK_SOURCES, parseRow, rowWarnings, rowsWithErrors, toSave, type BulkRow } from "./vitals-bulk";

const row = (values: BulkRow["values"], extra: Partial<BulkRow> = {}): BulkRow => ({ values, o2: "", avpu: "", ...extra });

describe("入力の確かめ", () => {
  it("an empty row is not a measurement", () => {
    expect(parseRow(row({}))).toEqual({ filled: false, errors: [] });
  });

  it("reads the numbers, with the oxygen and the consciousness", () => {
    const p = parseRow(row({ bt: "37.6", hr: "88", sbp: "122", dbp: "70", rr: "16", spo2: "97" }, { avpu: "A" }));
    expect(p.errors).toEqual([]);
    expect(p.vital).toEqual({ bt: 37.6, hr: 88, sbp: 122, dbp: 70, rr: 16, spo2: 97, o2: "室内気", avpu: "A" });
  });

  it("catches a slip of the keys: not a number, SpO2 over 100, the lower pressure over the upper, one half of the pressure", () => {
    expect(parseRow(row({ hr: "8８x" })).errors).toEqual(["脈拍は数で入れてください"]);
    expect(parseRow(row({ spo2: "970" })).errors).toEqual(["SpO2 は100までです"]);
    expect(parseRow(row({ sbp: "70", dbp: "120" })).errors).toEqual(["血圧の下が上より高くなっています"]);
    expect(parseRow(row({ sbp: "120" })).errors).toEqual(["血圧は上と下を両方入れてください"]);
    expect(parseRow(row({ bt: "36.5" }, { time: "25:00" })).errors).toEqual(["時刻は「14:20」のように入れてください"]);
  });
});

describe("知らせ（指示簿の基準と NEWS2 だけ）", () => {
  it("the doctor's call criteria of the 指示簿", () => {
    const s = { ...emptyStanding("医師", { day: 0, time: "09:00" }), calls: [{ key: "sbpLow" as const, value: 90 }, { key: "bt" as const, value: 38.5 }] };
    const w = rowWarnings({ bt: 38.6, sbp: 88, dbp: 50 }, s);
    expect(w.filter((x) => x.basis === "指示簿").map((x) => x.text)).toEqual(["医師への連絡の基準：収縮期血圧 88mmHg（基準 ≤90）", "医師への連絡の基準：体温 38.6℃（基準 ≥38.5）"]);
  });

  it("NEWS2: a parameter scoring 3, and a total of 5 or more", () => {
    const w = rowWarnings({ rr: 26, spo2: 93, hr: 112, sbp: 120, dbp: 70, bt: 38.4, o2: "鼻カニュラ 2L", avpu: "A" });
    expect(w.map((x) => x.text)).toEqual(["NEWS2 で3点：呼吸数 26/分", "NEWS2 合計 10点（観察の目安：連続モニタリング）"]);
    expect(rowWarnings({ bt: 36.8, hr: 72, sbp: 124, dbp: 70, rr: 16, spo2: 98, o2: "室内気", avpu: "A" })).toEqual([]);
    expect(BULK_SOURCES.news2).toContain("Royal College of Physicians");
  });
});

describe("保存するもの", () => {
  it("only typed rows without errors, each at its own time or the table's, with who", () => {
    const rows = { a: row({ bt: "37.0" }), b: row({}), c: row({ hr: "x" }), d: row({ hr: "70" }, { time: "06:30" }) };
    expect(toSave(rows, "10:00", "看護師 佐藤")).toEqual([
      { patientId: "a", vital: { day: 0, time: "10:00", bt: 37, o2: "室内気", avpu: undefined, by: "看護師 佐藤" } },
      { patientId: "d", vital: { day: 0, time: "06:30", hr: 70, o2: "室内気", avpu: undefined, by: "看護師 佐藤" } },
    ]);
    expect(rowsWithErrors(rows)).toEqual(["c"]);
  });
});
