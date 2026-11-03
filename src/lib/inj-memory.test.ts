import { describe, expect, it } from "vitest";
import { PAST_INJ, injPatternsOf, matchInj } from "./inj-memory";

describe("注射の記憶", () => {
  it("counts the doctor's injections by drugs, route, frequency and drip", () => {
    const p = injPatternsOf(PAST_INJ);
    expect(p[0]).toMatchObject({ count: 6, patients: 6 });
    expect(p[0].order.items[0].drugCode).toBe("INJ-CTRX1");
    expect(p.map((x) => x.count)).toEqual([6, 5, 4, 3, 2]);
  });
  it("finds a pattern by a drug's name or reading", () => {
    const ctrx = injPatternsOf(PAST_INJ)[0];
    expect(matchInj(ctrx, "せふとり")).toBe(true);
    expect(matchInj(ctrx, "バンコ")).toBe(false);
  });
});
