import { describe, expect, it } from "vitest";
import { calculateClaim } from "./engine";
import { DEFAULT_OPTIONS } from "./model";
import { INSURANCE } from "./insurance";
import { receiptRecords } from "./uke";
import { officialDrugCode } from "./drug";
import type { DayPattern, OrderEntry } from "../types";

const mwf: DayPattern = { kind: "weekdays", days: [1, 3, 5] };
const injection: OrderEntry = { kind: "order", id: "i", day: -13, time: "06:00", author: "医師", status: "有効", order: { type: "injection", items: [{ drugCode: "INJ-CEZ1", amount: 1, unit: "g" }, { drugCode: "INJ-NS500", amount: 500, unit: "mL" }], route: "点滴静注", schedule: { kind: "per_day", count: 1 }, doseTimes: ["10:00"], start: { day: -13, time: "10:00" }, days: 14, dayPattern: mwf } };
const oral: OrderEntry = { ...injection, id: "r", order: { type: "prescription", category: "臨時", drugCode: "ORAL-AMLO5", amount: 1, unit: "錠", timings: ["朝"], start: { day: -13, timing: "朝" }, days: 6, dayPattern: mwf } };
const claim = (entries: OrderEntry[], notGiven: string[] = []) => calculateClaim({ today: "2026-12-10", nowTime: "23:59", month: "2026-12", patient: { id: "90010260", name: "森 久美子", sex: "女", age: 64, admittedOn: -13 }, entries, daily: [], cultures: [], diagnoses: [], options: DEFAULT_OPTIONS, notGiven });

describe("投与日の算定とUKE", () => {
  it("月をまたぐ月水金：内服・注射の薬剤料と注射手技料は12月2・4・7・9日だけ", () => {
    const c = claim([injection, oral]);
    for (const shikibetsu of ["21", "33"]) {
      const acts = c.acts.filter((a) => a.shikibetsu === shikibetsu);
      expect(acts.length).toBeGreaterThan(0);
      expect([...new Set(acts.flatMap((a) => Object.keys(a.days).map(Number)))].sort((a, b) => a - b)).toEqual([2, 4, 7, 9]);
    }
    expect(c.acts.filter((a) => a.shikibetsu === "33").some((a) => a.parts.some((p) => p.lines.some((l) => l.record === "SI")))).toBe(true);
    for (const drug of ["INJ-CEZ1", "ORAL-AMLO5"]) {
      const acts = c.acts.filter((a) => a.parts.some((p) => p.lines.some((l) => l.code === officialDrugCode(drug))));
      expect(acts.reduce((n, a) => n + a.count, 0)).toBe(4);
    }
    const records = receiptRecords({ patient: { id: "90010260", name: "森 久美子", kana: "モリ クミコ", sex: "女", admittedDate: "2026-11-27", insurance: INSURANCE["90010260"], ageAtMonth: 64, preschool: false }, claim: c, diagnoses: [], window: { medicalYen: 0, kogaku: false, tasuu: false } }, 1, "2026-12");
    const drugs = records.filter((r) => r.startsWith("IY,")).map((r) => r.split(","));
    expect(drugs.length).toBeGreaterThan(0);
    for (const row of drugs) {
      expect(row[6]).toBe("4");
      expect(row.slice(13).map((n, i) => n ? i + 1 : null).filter((n) => n !== null)).toEqual([2, 4, 7, 9]);
    }
  });
  it("隔日は開始日基準、未実施の1回は薬剤料から減る", () => {
    const e: OrderEntry = { ...injection, order: { ...injection.order, dayPattern: { kind: "every", n: 2 } } as typeof injection.order };
    const c = claim([e]);
    const drugCount = (result: typeof c) => result.acts.filter((a) => a.parts.some((p) => p.lines.some((l) => l.code === officialDrugCode("INJ-CEZ1")))).reduce((n, a) => n + a.count, 0);
    expect(drugCount(c)).toBe(5); // 12/1, 3, 5, 7, 9
    expect(drugCount(claim([e], [`i|${-7 * 1440 + 600}`]))).toBe(4);
  });
});
