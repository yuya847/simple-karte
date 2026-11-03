import { describe, expect, it } from "vitest";
import { PANIC_LIMITS, bloodCulturePanic, callScript, cultureArrivals, hitLine, mergeCultures, panicOf, resultsOf, uncalled, unseen } from "./results";
import { PATIENTS } from "./patients";

describe("results", () => {
  it("finds values beyond the panic limits by code", () => {
    const hits = panicOf({ K: 7.2, Na: 140, Glu: 45, Plt: 2.1 }, PANIC_LIMITS);
    expect(hits.map((h) => `${h.code}${h.side}`)).toEqual(["Glu低", "K高", "Plt低"]);
    expect(hitLine(hits[1])).toBe("K 7.2 mmol/L（7以上）");
    expect(panicOf({ K: 6.4, Na: 120 }, PANIC_LIMITS)).toEqual([]);
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
    expect(uncalled(items, { [key]: { key, patientId: p.id, hits: [], by: "検査技師 中村", to: "主治医", means: "電話", readBack: true, at: { day: 0, time: "10:00" } } })).toHaveLength(0);
  });

  it("puts the call in the order of 提言第20号", () => {
    const p = { ...PATIENTS[1], cultures: cultureArrivals(600)["90010244"] };
    const item = uncalled(resultsOf(p, PANIC_LIMITS), {})[0];
    const lines = callScript(item, p, "515B");
    expect(lines[0]).toBe("「パニック値の報告です」");
    expect(lines[2]).toBe(`② ${p.name}さん（ID ${p.id}）`);
    expect(lines.at(-1)).toBe("「復唱をお願いします」");
  });
});
