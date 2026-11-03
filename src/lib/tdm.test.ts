import { describe, expect, it } from "vitest";
import { predict, sawchukZaske } from "./tdm";

// Hand-made case: k = 0.1 /h, Vd = 50 L (CL 5 L/h), 1,000 mg q12h over 1 h, steady state.
// Cmax = (1000/1)(1−e^−0.1)/(5(1−e^−1.2)) ; Cmin = Cmax·e^−1.1 ; AUC24 = 2000/5 = 400.
const k = 0.1;
const cl = 5;
const cmax = (1000 * (1 - Math.exp(-k))) / (cl * (1 - Math.exp(-1.2)));
const cmin = cmax * Math.exp(-k * 11);

describe("TDM（Sawchuk-Zaske）", () => {
  it("recovers k, Vd and AUC24 from a peak 1 h after the infusion and a trough just before the dose", () => {
    const peak = cmax * Math.exp(-k * 1); // drawn at 2 h from start
    const res = sawchukZaske({ dose: 1000, tau: 12, tinf: 1 }, { peak: { t: 2, c: peak }, trough: { before: 0, c: cmin } });
    if ("error" in res) throw new Error(res.error);
    expect(res.k).toBeCloseTo(0.1, 6);
    expect(res.vd).toBeCloseTo(50, 4);
    expect(res.auc24).toBeCloseTo(400, 3);
    expect(res.aucTrapezoid24).toBeGreaterThan(395); // the trapezoid slightly differs during the infusion
    expect(res.steps).toHaveLength(7);
  });
  it("predicts another regimen with the same k and CL", () => {
    const p = predict({ k, vd: 50, cl }, { dose: 1250, tau: 12, tinf: 1.5 });
    expect(p.auc24).toBeCloseTo(500, 6);
    expect(p.cmin).toBeLessThan(p.cmax);
  });
  it("refuses impossible inputs", () => {
    expect(sawchukZaske({ dose: 1000, tau: 12, tinf: 1 }, { peak: { t: 0.5, c: 30 }, trough: { before: 0, c: 10 } })).toHaveProperty("error");
    expect(sawchukZaske({ dose: 1000, tau: 12, tinf: 1 }, { peak: { t: 2, c: 8 }, trough: { before: 0, c: 10 } })).toHaveProperty("error");
  });
});
