import { describe, expect, it } from "vitest";
import { rpLine, rpNumbers } from "./rp";
import type { Draft } from "./drafts";

const inj = (id: string): Draft => ({
  id,
  origin: "manual",
  sourceText: "",
  comment: null,
  kind: "injection",
  items: [
    { drugCode: "INJ-NS100", said: "生食100", amount: 100, unit: "mL" },
  ],
  route: "点滴静注",
  schedule: { kind: "every_hours", hours: 12 },
  infusionMinutes: 60,
  infusionScope: "per_dose",
  rateMlPerH: null,
  prefer: null,
  start: { day: 0, time: null },
  days: 5,
  duplicate: null,
});
const rx = (id: string): Draft => ({
  id,
  origin: "manual",
  sourceText: "",
  comment: null,
  kind: "prescription",
  category: "定期",
  items: [{ drugCode: null, said: "ロキソニン", daily: 3, perDose: null }],
  timings: ["朝", "昼", "夕"],
  prn: null,
  maxPerDay: null,
  days: 5,
  start: { day: null, timing: null },
  acks: [],
});

describe("Rp numbers", () => {
  it("numbers injections and prescriptions each from Rp1", () => {
    expect(rpNumbers([inj("a"), rx("b"), inj("c"), rx("d")])).toEqual({ a: 1, b: 1, c: 2, d: 2 });
  });
  it("writes one line per Rp", () => {
    expect(rpLine(inj("a"))).toContain("12時間ごと　1回1時間　5日間");
    expect(rpLine(rx("b"))).toBe("ロキソニン 1日3　朝・昼・夕　5日分　定期");
  });
});
