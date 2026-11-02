import { describe, expect, it } from "vitest";
import { applyHdChange, hdDiff, hdFee, HD_PATIENTS, runsOn, ufPlan } from "./dialysis";

const inoue = HD_PATIENTS.find((p) => p.id === "hd-1")!;
const saito = HD_PATIENTS.find((p) => p.id === "hd-4")!;
const yamaguchi = HD_PATIENTS.find((p) => p.id === "hd-3")!;

describe("除水の計算", () => {
  it("体重 − DW、速度は mL ÷ 時間 ÷ DW", () => {
    const p = ufPlan(61.2, inoue.conditions); // DW 58.5, 4時間
    expect(p.uf).toBe(2.7);
    expect(p.formula).toBe("61.2kg − DW 58.5kg = 2.7kg");
    expect(p.rate).toBe(11.5); // 2700 / 4 / 58.5
    expect(p.problems).toEqual([]);
  });
  it("指示の上限を超えたら知らせる（決めるのは医師）", () => {
    const p = ufPlan(56.0, saito.conditions); // DW 52.0, 3.5時間, 上限 2.0kg・12mL/kg/時
    expect(p.problems.some((x) => x.includes("上限 2kg"))).toBe(true);
    expect(p.problems.some((x) => x.includes("12mL/kg/時"))).toBe(true);
  });
});

describe("J038 人工腎臓（令和8年度）", () => {
  it("慢性維持透析３、時間は開始から返血終了まで（4時間以上5時間未満 1,931点）＋水質確保・腎代替療法体制", () => {
    const f = hdFee(inoue, { start: "08:40", end: "12:45", drugsGiven: ["ダルベポエチン アルファ 20μg（火）"] }, false);
    expect(f.lines.map((l) => l.points)).toEqual([1931, 10, 20]);
    expect(f.notes.some((n) => n.includes("所定点数に含まれ"))).toBe(true);
  });
  it("外来で休日に行ったら 時間外・休日加算 380点", () => {
    const f = hdFee(inoue, { start: "08:40", end: "12:30", drugsGiven: [] }, true);
    expect(f.lines.at(-1)).toMatchObject({ name: "時間外・休日加算", points: 380 });
    expect(f.lines[0].points).toBe(1776); // 3時間50分 → 4時間未満
  });
  it("導入期（導入後1月）は「その他の場合」1,560点＋導入期加算１", () => {
    const f = hdFee(saito, { start: "13:30", end: "17:00", drugsGiven: [] }, false);
    expect(f.lines.slice(0, 2).map((l) => l.points)).toEqual([1560, 200]);
  });
  it("オンラインHDF（届出あり）は慢性維持透析３＋濾過加算50点", () => {
    const f = hdFee(yamaguchi, { start: "08:30", end: "13:00", drugsGiven: [] }, false);
    expect(f.lines.slice(0, 2).map((l) => l.points)).toEqual([1931, 50]);
  });
});

describe("条件の変更", () => {
  it("言われた項目だけを、前 → 後 で出す", () => {
    const d = hdDiff(inoue.conditions, { dw: 58, minutes: 270, qb: 220 });
    expect(d).toEqual([
      { label: "DW", before: "58.5kg", after: "58kg" },
      { label: "時間", before: "4時間", after: "4時間30分" },
    ]);
    expect(applyHdChange(inoue.conditions, { dw: 58 }).dw).toBe(58);
  });
  it("曜日", () => {
    expect(runsOn(inoue, 2)).toBe(true);
    expect(runsOn(inoue, 1)).toBe(false);
  });
});
