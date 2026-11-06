import { describe, expect, it } from "vitest";
import { checkStep, EMPTY_STEP, NO_GROWTH, organismCandidates } from "./lab-culture";
import { labNumber } from "./lab-number";
import { physioCalculated, physioWithCalculated } from "./physio-calculations";
import { callScript } from "./results";
import { toEnter, type DrawRow } from "./lab-desk";

describe("検査技師の再点検", () => {
  it("MRSA の矛盾する感受性と陽性血培の発育なしを確定しない", () => {
    const culture = { collectedOn: -5, specimen: "血液", status: "中間報告" as const, gram: "グラム陽性球菌（ブドウ状）", sets: "2セット中1セット陽性" };
    expect(checkStep("最終報告", culture, { ...EMPTY_STEP, organism: NO_GROWTH }).step).toBeUndefined();
    for (const drug of ["ABPC", "MPIPC", "CEZ", "CTRX", "MEPM"]) {
      expect(checkStep("最終報告", culture, { ...EMPTY_STEP, organism: "MRSA", sir: { [drug]: "S" } }).step).toBeUndefined();
      expect(checkStep("最終報告", culture, { ...EMPTY_STEP, organism: "MRSA", sir: { [drug]: "R" } }).step).toBeDefined();
    }
    expect(organismCandidates("グラム陰性桿菌")[0]).toBe("大腸菌");
    expect(organismCandidates("グラム陽性球菌（ブドウ状）").slice(0, 3).every((n) => /ブドウ|MRSA/.test(n))).toBe(true);
  });
  it("項目ごとに小数点の桁をそろえる", () => {
    expect(labNumber("Hb", 12)).toBe("12.0");
    expect(labNumber("Alb", 4)).toBe("4.0");
    expect(labNumber("Cre", 1)).toBe("1.00");
    expect(labNumber("Na", 140)).toBe("140");
  });
  it("QTc を2式で計算し、手入力は再計算で消さない", () => {
    expect(physioCalculated("PHY-ECG", { HR: 60, QT: 400 })).toEqual({ QTc: 400, QTcF: 400 });
    expect(physioCalculated("PHY-ECG", { HR: 120, QT: 400 })).toEqual({ QTc: 566, QTcF: 504 });
    expect(physioWithCalculated("PHY-ECG", { HR: "120", QT: "400", QTc: "550" }, new Set(["QTc"]))).toMatchObject({ QTc: "550", QTcF: "504" });
    expect(physioCalculated("PHY-ECG", { HR: 0, QT: 400 })).toEqual({});
  });
  it("Teichholz の単位をmmからcmへ直し、不正な径では計算しない", () => {
    expect(physioCalculated("PHY-UCG", { LVDd: 50, LVDs: 30 })).toEqual({ FS: 40, LVEF: 70.4 });
    expect(physioCalculated("PHY-UCG", { LVDd: 30, LVDs: 50 })).toEqual({});
    expect(physioCalculated("PHY-UCG", { LVDd: 0, LVDs: 0 })).toEqual({});
  });
  it("受付済みの至急・救急を先頭にして初期選択に使う", () => {
    const row = { status: "受付済み", urgent: false, place: "病棟", at: 360 } as DrawRow;
    const urgent = { ...row, urgent: true, at: 600 };
    const er = { ...urgent, place: "救急" as const };
    expect(toEnter([row, urgent, er])).toEqual([er, urgent, row]);
  });
  it("外来の連絡文は患者IDの接頭辞を含まない", () => {
    const script = callScript({ patientId: "opd:99000020", kind: "検査", panic: [], day: 0, time: "09:10" } as unknown as Parameters<typeof callScript>[0], { id: "opd:99000020", name: "試験患者" }, "外来");
    expect(script.join(" ")).toContain("ID 99000020");
    expect(script.join(" ")).not.toContain("opd:");
  });
});
