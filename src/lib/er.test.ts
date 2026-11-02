import { describe, expect, it } from "vitest";
import { erFeeHint, isHoliday, reassessIn, visitTime, type ErPatient } from "./er";

const today = { y: 2026, m: 11, d: 3 }; // 文化の日（祝日・火曜）
const pt = (over: Partial<ErPatient>): ErPatient => ({ id: "x", name: "x", kana: "", sex: "男", age: 70, arrival: "独歩", arrivedAbs: 600, complaint: "", status: "診察待ち", allergies: [], ...over });

describe("JTAS の再評価（時間はコードが数える）", () => {
  it("緊急 15分・準緊急 30分・低緊急 60分・非緊急 120分 from the last triage", () => {
    expect(reassessIn(pt({ jtas: 2, arrivedAbs: 600 }), 610)).toBe(5);
    expect(reassessIn(pt({ jtas: 3, arrivedAbs: 600 }), 640)).toBe(-10);
    expect(reassessIn(pt({ jtas: 3, arrivedAbs: 600, triagedAbs: 635 }), 640)).toBe(25);
    expect(reassessIn(pt({ jtas: 5, arrivedAbs: 600 }), 700)).toBe(20);
  });
  it("not before triage, nor after discharge", () => {
    expect(reassessIn(pt({ status: "搬送中" }), 600)).toBeNull();
    expect(reassessIn(pt({ jtas: 3, status: "帰宅" }), 700)).toBeNull();
  });
});

describe("時間帯と休日", () => {
  it("祝日（2026-11-03）and 年末年始 are 休日", () => {
    expect(isHoliday(2026, 11, 3)).toBe(true);
    expect(isHoliday(2026, 11, 4)).toBe(false);
    expect(isHoliday(2026, 12, 30)).toBe(true);
  });
  it("labels", () => {
    expect(visitTime(600, today).label).toBe("祝日・時間外");
    expect(visitTime(1440 + 600, today).label).toBe("平日・診療時間内");
    expect(visitTime(1440 + 19 * 60, today).label).toBe("平日・夜間");
  });
});

describe("救急外来医学管理料（B001-2-6）の目安", () => {
  it("ambulance → 救急搬送医学管理料, with 時間外救急搬送加算 on a holiday", () => {
    const h = erFeeHint(pt({ arrival: "救急車", arrivedAbs: 600 }), today)!;
    expect(h.item).toContain("救急搬送医学管理料");
    expect(h.note).toContain("時間外救急搬送加算 200点");
    expect(h.note).toContain("届出なし");
  });
  it("walk-in on a weekday night → 夜間休日救急医学管理料 ＋ 院内トリアージ実施体制加算", () => {
    expect(erFeeHint(pt({ arrivedAbs: 1440 + 19 * 60 }), today)?.item).toContain("夜間休日救急医学管理料");
  });
  it("walk-in on a weekday at 17:30 (時間外 but not 夜間) → none", () => {
    expect(erFeeHint(pt({ arrivedAbs: 1440 + 17 * 60 + 30 }), today)).toBeNull();
  });
});
