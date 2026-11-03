import { describe, expect, it } from "vitest";
import { journalLines, staffing } from "./journal";
import { findPatient } from "./patients";
import { BEDS, FLOORS, OTHER_FLOOR_BEDS } from "./ward";

describe("看護日誌", () => {
  const ward = { beds: BEDS, patient: findPatient };
  const base = { ward, beds: [...BEDS, ...OTHER_FLOOR_BEDS], requests: [{ ward: "5階東病棟", status: "申込", name: "宮本 タケ" }], restrained: ["大浦 トメ"], callsMet: [], surgeriesToday: [], dialysisToday: [], incidentsToday: 1 };
  it("counts the floor's beds and the patients needing attention", () => {
    const l = journalLines({ ...base, floor: FLOORS[0] });
    const v = (k: string) => l.find((x) => x.label === k)!;
    expect(v("在院患者").value).toBe(BEDS.length);
    expect(v("空床").value + v("在院患者").value).toBe(FLOORS[0].rooms.reduce((n, r) => n + r.beds.length, 0));
    expect(v("入院申込（ベッド待ち）").who).toEqual(["宮本 タケ"]);
    expect(v("身体的拘束中").who).toEqual(["大浦 トメ"]);
    expect(v("感染対策（予防策）").who).toContain("佐倉 修");
  });
  it("does not count another floor's patients", () => {
    const l = journalLines({ ...base, floor: FLOORS[2] });
    expect(l.find((x) => x.label === "身体的拘束中")!.value).toBe(0);
  });
  it("lists the day nurses with their rooms", () => {
    expect(staffing(FLOORS[0]).find((s) => s.nurse === "看護師 渡辺")!.rooms).toEqual(["515", "516"]);
  });
});
