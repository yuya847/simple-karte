import { describe, expect, it } from "vitest";
import type { PrescriptionDraft } from "../rx";
import { PATIENTS } from "../patients";
import type { OrderEntry } from "../types";
import { joinLines, linesFromDrafts, linesFromHomeRx } from "./rx-lines";

const draft = (over: Partial<PrescriptionDraft>): PrescriptionDraft => ({
  id: "d",
  origin: "manual",
  sourceText: "",
  comment: null,
  kind: "prescription",
  category: null,
  items: [],
  timings: ["朝"],
  prn: null,
  maxPerDay: null,
  days: 14,
  start: { day: null, timing: null },
  acks: [],
  ...over,
});

describe("prescription lines for the national services", () => {
  it("takes the 退院時処方 as one Rp per bag", () => {
    const kitamura = PATIENTS.find((p) => p.id === "90010198")!;
    const lines = linesFromHomeRx(kitamura.history.filter((e): e is OrderEntry => e.kind === "order"));
    expect(lines.map((l) => `${l.rp}:${l.drug}:${l.perDose}${l.unit}:${l.timings.join("")}:${l.days}`)).toEqual(["1:ORAL-ENA5:1錠:朝:14", "1:ORAL-BISO25:1錠:朝:14", "1:ORAL-SPL25:1錠:朝:14", "2:ORAL-MGO330:1錠:朝夕:14"]);
  });

  it("counts the Rp numbers on across the visit's prescriptions", () => {
    const a = { rp: 1, drug: "ORAL-AMLO5", perDose: 1, unit: "錠", timings: ["朝" as const], prn: null, maxPerDay: null, days: 28 };
    expect(joinLines([[a, { ...a, rp: 2 }], [a]]).map((l) => l.rp)).toEqual([1, 2, 3]);
  });

  it("numbers the outpatient drafts and works out the 1回量 from a 1日量", () => {
    const lines = linesFromDrafts([
      draft({ id: "a", items: [{ drugCode: "ORAL-MGO330", said: "マグミット", daily: 2, perDose: null }], timings: ["朝", "夕"] }),
      draft({ id: "b", items: [{ drugCode: "ORAL-APAP500", said: "カロナール", daily: null, perDose: 1 }], timings: [], prn: "疼痛時", maxPerDay: 3, days: 10 }),
      draft({ id: "c", items: [{ drugCode: null, said: "わからない薬", daily: 1, perDose: null }] }),
    ]);
    expect(lines).toEqual([
      { rp: 1, drug: "ORAL-MGO330", perDose: 1, unit: "錠", timings: ["朝", "夕"], prn: null, maxPerDay: null, days: 14 },
      { rp: 2, drug: "ORAL-APAP500", perDose: 1, unit: "錠", timings: [], prn: "疼痛時", maxPerDay: 3, days: 10 },
    ]);
  });
});
