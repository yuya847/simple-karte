import { describe, expect, it } from "vitest";
import { flagsFor } from "./patient-flags";
import { PATIENTS } from "./patients";
import type { OrderEntry } from "./types";
import { WARD_PLANS, BEDS, emptyBeds, nurseFor } from "./ward";

const orders = (id: string) => PATIENTS.find((p) => p.id === id)!.history.filter((e): e is OrderEntry => e.kind === "order");
const labels = (id: string, now = 420, waiting = 0) => flagsFor(PATIENTS.find((p) => p.id === id)!, orders(id), now, waiting).map((f) => f.label);

describe("患者一覧の印（記録からコードで）", () => {
  it("大浦: oxygen at the flow running now, a running drip, fasting", () => {
    expect(labels("90010244")).toEqual(expect.arrayContaining(["酸素 1L", "持続点滴", "絶食", "転倒注意"]));
  });
  it("before 05:00 today the 2L order was running", () => {
    expect(labels("90010244", 240)).toContain("酸素 2L");
  });
  it("北村: the catheter, the allergy, no oxygen any more", () => {
    const l = labels("90010198");
    expect(l).toContain("尿カテ");
    expect(l).toContain("アレルギー NSAIDs（喘息発作）");
    expect(l.some((x) => x.startsWith("酸素"))).toBe(false);
  });
  it("佐倉: 接触予防策 from MRSA, and 指示受けがまだ when given", () => {
    expect(labels("90010231", 420, 2)).toEqual(expect.arrayContaining(["接触予防策", "指示受けがまだ 2"]));
  });
});

describe("病棟の予定（架空）", () => {
  it("planned admissions go to beds that are empty now", () => {
    const empty = new Set(emptyBeds(BEDS).map((b) => `${b.room.no}${b.bed}`));
    for (const p of WARD_PLANS.filter((x) => x.kind === "入院")) expect(empty.has(`${p.room}${p.bed}`), p.name).toBe(true);
  });
  it("planned discharges are of patients in those beds", () => {
    for (const p of WARD_PLANS.filter((x) => x.kind === "退院")) expect(BEDS.find((b) => b.room === p.room && b.bed === p.bed)?.other?.name, p.name).toBe(p.name);
  });
  it("every room has a nurse today", () => {
    for (const b of BEDS) expect(nurseFor(b.room)).not.toBe("（未定）");
  });
});
