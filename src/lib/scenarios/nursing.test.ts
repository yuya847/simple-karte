import { describe, it, expect } from "vitest";
import { generateScenarios } from "./index";
import { fallDueList } from "../fall-reassess";
import { nursingOxygen } from "./nursing";
import { buildWorksheet, shiftWindow } from "../worksheet";
import type { OrderEntry } from "../types";

const s = generateScenarios();
describe("試験病棟の看護記録", () => {
  it("入院評価と退院支援の日付は入院後0〜1日", () => {
    for (const p of s.patients) {
      const a = s.evals[p.id];
      for (const at of [a?.fall?.at, a?.pressure?.at, a?.nutrition?.at, a?.discharge?.extractedAt, a?.discharge?.talkedAt, a?.discharge?.conferenceAt]) {
        if (at) { expect(at.day).toBeGreaterThanOrEqual(p.admittedOn); expect(at.day).toBeLessThanOrEqual(p.admittedOn + 1); }
      }
    }
  });
  it("再評価は入院後で、期限切れは一部だけ", () => {
    const patients = s.cases.filter((c) => c.stage === "入院").map(({ patient: p }) => ({ id: p.id, name: p.name, room: p.room, admittedOn: p.admittedOn, first: s.evals[p.id]?.fall, reviews: s.nursing.fallReviews[p.id] ?? [], triggers: [] }));
    for (const p of patients) for (const r of p.reviews) expect(r.at.day).toBeGreaterThanOrEqual(p.admittedOn);
    const due = fallDueList(patients);
    expect(due.filter((r) => r.state === "期限切れ").length).toBeGreaterThan(0);
    expect(due.filter((r) => r.state === "期限切れ").length).toBeLessThan(patients.length / 2);
  });
  it("褥瘡・看護計画・指示受けの残りがある", () => {
    expect(s.nursing.ulcers.length).toBeGreaterThan(0);
    expect(s.nursing.pendingKeys.length).toBeGreaterThan(0);
    for (const c of s.cases.filter((c) => c.stage === "入院")) expect(s.nursing.nursingPlans.some((p) => p.patientId === c.patient.id)).toBe(true);
    for (const u of s.nursing.ulcers) { if (u.origin === "持ち込み") expect(s.evals[u.patientId].pressure?.ulcerNow).toBe(true); expect(u.assessments[0].at.day).toBeGreaterThanOrEqual(u.foundOn); }
  });
  it("体温と血圧が患者ごとに異なり、酸素指示と測定が一致する", () => {
    expect(new Set(s.patients.map((p) => p.vitals.at(-1)?.bt)).size).toBeGreaterThan(5);
    expect(new Set(s.patients.map((p) => p.vitals.at(-1)?.sbp)).size).toBeGreaterThan(10);
    for (const p of s.patients) for (const v of p.vitals) {
      if (p.id === "99000013" && v.day <= p.admittedOn + 3) continue;
      expect(v.o2).toBe(nursingOxygen(p, v.day, v.time));
    }
  });
  it("夜勤も継続中の酸素・留置・点滴を拾う", () => {
    const p = structuredClone(s.patients[1]);
    const entries: OrderEntry[] = [
      { kind: "order", id: "oxygen", day: -1, time: "09:00", author: p.attending, status: "有効", order: { type: "procedure", code: "PROC-O2", start: { day: -1, time: "09:00" }, schedule: { kind: "continuous" }, o2: { device: "鼻カニュラ", lpm: 2 } } },
      { kind: "order", id: "catheter", day: -1, time: "09:00", author: p.attending, status: "有効", order: { type: "procedure", code: "PROC-FOLEY", start: { day: -1, time: "09:00" }, schedule: { kind: "continuous" } } },
      { kind: "order", id: "fluid", day: -1, time: "09:00", author: p.attending, status: "有効", order: { type: "injection", items: [{ drugCode: "INJ-NS500", amount: 500, unit: "mL" }], route: "点滴静注", start: { day: -1, time: "09:00" }, schedule: { kind: "per_day", count: 2 } } },
    ];
    const { lo, hi } = shiftWindow("night", 0);
    expect(buildWorksheet([{ patient: p, room: p.room, entries }], lo, hi, 1100).running.map((r) => r.orderId)).toEqual(expect.arrayContaining(["oxygen", "catheter", "fluid"]));
  });
});
