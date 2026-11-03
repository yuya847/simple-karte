import { describe, expect, it } from "vitest";
import { PANIC_LIMITS, bloodCulturePanic, cultureArrivals, hitLine, mergeCultures, panicOf, resultsOf, uncalled, unseen } from "./results";
import { PATIENTS } from "./patients";

describe("results", () => {
  it("finds values beyond the panic limits by code", () => {
    const hits = panicOf({ K: 6.4, Na: 140, Glu: 45 }, PANIC_LIMITS);
    expect(hits.map((h) => `${h.code}${h.side}`)).toEqual(["K高", "Glu低"]);
    expect(hitLine(hits[0])).toBe("K 6.4 mmol/L（6以上）");
  });

  it("a blood culture that turned positive is phoned in like a panic value", () => {
    const [c] = cultureArrivals(11 * 60)["90010244"];
    expect(c.reportedTime).toBe("10:48");
    expect(bloodCulturePanic(c)).toHaveLength(1);
    expect(bloodCulturePanic({ ...c, specimen: "尿" })).toHaveLength(0);
    const merged = mergeCultures([{ collectedOn: -1, specimen: "血液", status: "培養中" }], [c]);
    expect(merged).toEqual([c]);
  });

  it("only today's results wait for the doctor; seen ones drop out", () => {
    const p = PATIENTS[0];
    const items = resultsOf(p, PANIC_LIMITS);
    const waiting = unseen(items, {});
    expect(waiting.every((i) => i.day >= 0)).toBe(true);
    expect(waiting.length).toBeGreaterThan(0);
    const acks = Object.fromEntries(waiting.map((i) => [i.key, { by: "山本（専攻医）", at: { day: 0, time: "09:00" } }]));
    expect(unseen(items, acks)).toEqual([]);
  });

  it("lists panic values not yet phoned in", () => {
    const p = { ...PATIENTS[1], cultures: cultureArrivals(600)["90010244"] };
    const items = resultsOf(p, PANIC_LIMITS);
    expect(uncalled(items, {})).toHaveLength(1);
    const key = uncalled(items, {})[0].key;
    expect(uncalled(items, { [key]: { key, patientId: p.id, hits: [], by: "検査技師 中村", to: "主治医", readBack: true, at: { day: 0, time: "10:00" } } })).toHaveLength(0);
  });
});
