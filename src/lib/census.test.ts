import { describe, expect, it } from "vitest";
import { basicAlos, bedsOf, censusStays, dayCsv, dayReport, deptCounts, lastMonths, monthCsv, periodReport, presentAt, type Stay } from "./census";
import { BEDS, FLOORS, OTHER_FLOOR_BEDS } from "./ward";

const st = (x: Partial<Stay> & { id: string; in: Stay["in"] }): Stay => ({ admission: x.id, floor: "A", dept: "内科", ...x });
const P = (from: number, to: number) => ({ label: "p", from, to });

describe("在院（24時）", () => {
  it("counts the admission day, not the day of leaving", () => {
    const s = st({ id: "1", in: { day: -3, kind: "入院" }, out: { day: -1, kind: "退院" } });
    expect([-4, -3, -2, -1].map((d) => presentAt(s, d))).toEqual([false, true, true, false]);
  });
});

describe("入院基本料の平均在院日数（別添6 別紙4）", () => {
  it("is ① ÷ ((新入棟 + 新退棟) / 2), rounded up", () => {
    // Two stays inside the 10 days: 3 nights and 4 nights; one patient there all along (10 days, not new).
    const stays = [
      st({ id: "a", in: { day: -9, kind: "入院" }, out: { day: -6, kind: "退院" } }),
      st({ id: "b", in: { day: -5, kind: "入院" }, out: { day: -1, kind: "退院" } }),
      st({ id: "c", in: { day: -30, kind: "入院" } }),
    ];
    const r = basicAlos(stays, ["A"], P(-9, 0));
    expect(r.patientDays).toBe(3 + 4 + 10);
    expect([r.newIn, r.newOut]).toEqual([2, 2]);
    expect(r.value).toBe(Math.ceil(17 / 2));
  });
  it("counts a same-day 退院 as a day", () => {
    const r = basicAlos([st({ id: "a", in: { day: -2, kind: "入院" }, out: { day: -2, kind: "死亡" } })], ["A"], P(-5, 0));
    expect(r).toMatchObject({ patientDays: 1, newIn: 1, newOut: 1, value: 1 });
  });
  it("keeps a move between the unit's wards inside it, and counts it on each ward alone", () => {
    const stays = [
      st({ id: "1", admission: "x", floor: "A", in: { day: -6, kind: "入院" }, out: { day: -3, kind: "転出" } }),
      st({ id: "2", admission: "x", floor: "B", in: { day: -3, kind: "転入" }, out: { day: -1, kind: "退院" } }),
    ];
    expect(basicAlos(stays, ["A", "B"], P(-9, 0))).toMatchObject({ patientDays: 5, newIn: 1, newOut: 1 });
    // A: the day of the move is A's (別紙4 の2), so -6..-3 = 4 days; B: -3, -2 = 2 days.
    expect(basicAlos(stays, ["A"], P(-9, 0))).toMatchObject({ patientDays: 4, newIn: 1, newOut: 1 });
    expect(basicAlos(stays, ["B"], P(-9, 0))).toMatchObject({ patientDays: 2, newIn: 1, newOut: 1 });
  });
  it("counts only the first entry into a ward in one admission", () => {
    const stays = [
      st({ id: "1", admission: "x", floor: "A", in: { day: -9, kind: "入院" }, out: { day: -7, kind: "転出" } }),
      st({ id: "2", admission: "x", floor: "B", in: { day: -7, kind: "転入" }, out: { day: -5, kind: "転出" } }),
      st({ id: "3", admission: "x", floor: "A", in: { day: -5, kind: "転入" }, out: { day: -2, kind: "退院" } }),
    ];
    expect(basicAlos(stays, ["A"], P(-9, 0))).toMatchObject({ newIn: 1, newOut: 1 });
  });
  it("leaves out 短期滞在手術等基本料３ up to the 5th day, and takes it in from the 1st day after that", () => {
    const short = st({ id: "s", in: { day: -4, kind: "入院" }, out: { day: -2, kind: "退院" }, shortStay3: true });
    expect(basicAlos([short], ["A"], P(-9, 0))).toMatchObject({ patientDays: 0, newIn: 0, excluded: 1 });
    const long = st({ id: "l", in: { day: -8, kind: "入院" }, out: { day: -1, kind: "退院" }, shortStay3: true });
    expect(basicAlos([long], ["A"], P(-9, 0))).toMatchObject({ patientDays: 7, newIn: 1, newOut: 1, excluded: 0 });
  });
  it("leaves out patients there since before the period from 新入棟", () => {
    const r = basicAlos([st({ id: "a", in: { day: -20, kind: "入院" }, out: { day: -3, kind: "退院" } })], ["A"], P(-9, 0));
    expect([r.newIn, r.newOut, r.patientDays]).toEqual([0, 1, 6]);
  });
});

describe("病院報告の病床利用率と平均在院日数", () => {
  const floors = [{ name: "A", rooms: [{ no: "1", kind: "4床室" as const, beds: ["A", "B", "C", "D"], side: "north" as const }] }];
  it("病床利用率 = 在院患者延数 ÷ (日数 × 病床数) × 100; 平均在院日数 = 延数 ÷ ((新入院 + 退院) / 2)", () => {
    const stays = [st({ id: "a", in: { day: -10, kind: "入院" } }), st({ id: "b", in: { day: -4, kind: "入院" }, out: { day: -2, kind: "退院" } })];
    const { total, alos } = periodReport(stays, floors, P(-4, -1));
    // a: 4 days, b: -4, -3 → 6 of 4 × 4 = 16 bed-days
    expect(total.patientDays).toBe(6);
    expect(total.utilization).toBe(37.5);
    expect(alos).toBe(6);
  });
  it("counts the day's 入院・退院・在院 per ward", () => {
    const stays = [st({ id: "a", in: { day: -1, kind: "入院" } }), st({ id: "b", in: { day: -5, kind: "入院" }, out: { day: -1, kind: "退院" } })];
    const { rows } = dayReport(stays, floors, -1);
    expect(rows[0]).toMatchObject({ prev: 1, admit: 1, discharge: 1, census: 1, empty: 3, rate: 25 });
  });
  it("counts patients by department", () => {
    const stays = [st({ id: "a", dept: "外科", in: { day: -3, kind: "入院" } }), st({ id: "b", dept: "内科", in: { day: -3, kind: "入院" }, out: { day: -1, kind: "退院" } })];
    const c = deptCounts(stays, 0, P(-3, 0));
    expect(c.find((x) => x.dept === "内科")).toEqual({ dept: "内科", census: 0, admit: 1, discharge: 1, patientDays: 2 });
    expect(c.find((x) => x.dept === "外科")).toEqual({ dept: "外科", census: 1, admit: 1, discharge: 0, patientDays: 4 });
  });
});

describe("the stays of the hospital", () => {
  const today = { y: 2026, m: 11, d: 4 };
  const patient = (id: string) => ({ id, name: id, department: "総合診療科", admittedOn: -3 });
  const stays = censusStays({ today, days: 130, floors: FLOORS, beds: [...BEDS, ...OTHER_FLOOR_BEDS], moves: {}, patient });
  it("never has more patients than beds on any day", () => {
    for (let d = -120; d <= 0; d++) {
      const { rows } = dayReport(stays, FLOORS, d);
      for (const r of rows) expect(r.census).toBeLessThanOrEqual(r.beds);
    }
  });
  it("matches today's beds", () => {
    const { rows } = dayReport(stays, FLOORS, 0);
    const occupied = (name: string) => [...BEDS, ...OTHER_FLOOR_BEDS].filter((b) => FLOORS.find((f) => f.name === name)!.rooms.some((r) => r.no === b.room)).length;
    for (const r of rows) expect(r.census).toBe(occupied(r.floor));
    expect(bedsOf(FLOORS[0])).toBe(34);
  });
  it("is the same for the same day, and pairs 転出 with a 転入 on another ward the same day", () => {
    expect(censusStays({ today, days: 130, floors: FLOORS, beds: [...BEDS, ...OTHER_FLOOR_BEDS], moves: {}, patient })).toEqual(stays);
    const outs = stays.filter((s) => s.out?.kind === "転出");
    expect(outs.length).toBeGreaterThan(0);
    for (const s of outs) expect(stays.some((x) => x.admission === s.admission && x.in.kind === "転入" && x.in.day === s.out!.day && x.floor !== s.floor)).toBe(true);
  });
  it("splits a 転棟 today into 転出 and 転入", () => {
    const moved = censusStays({ today, days: 30, floors: FLOORS, beds: BEDS, moves: { "90010231": { room: "520", bed: "" } }, patient });
    const mine = moved.filter((s) => s.admission === "live:90010231");
    expect(mine.map((s) => [s.floor, s.in.kind, s.out?.kind])).toEqual([
      ["5階東病棟", "入院", "転出"],
      ["5階南病棟", "転入", undefined],
    ]);
  });
  it("gives the three months before this month", () => {
    expect(lastMonths(today, 3)).toMatchObject({ label: "2026年8月〜2026年10月", from: -95, to: -4 });
  });
});

describe("CSV", () => {
  it("puts the wards, the whole and the outpatients in one sheet", () => {
    const floors = [{ name: "A", rooms: [{ no: "1", kind: "個室" as const, beds: [""], side: "north" as const }] }];
    const csv = dayCsv("11/4", dayReport([st({ id: "a", in: { day: 0, kind: "入院" } })], floors, 0), [{ dept: "内科", first: 1, revisit: 2, ambulance: 0 }]);
    const rows = csv.trim().split("\r\n");
    expect(rows).toHaveLength(4);
    expect(rows[1]).toContain('"A","1","0","1"');
    expect(monthCsv("11月", periodReport([], floors, P(-1, 0)), []).split("\r\n")[0]).toContain("平均在院日数（病院報告）");
  });
});
