import { describe, expect, it } from "vitest";
import { alarmsOf, autoReasons, beatMs, breathMs, ecgSample, liveNumbers, monitored, plethSample, respSample, seedOf, simulatedNibp, toggleMonitor, traceSeries, wobble, type MonitorCandidate } from "./monitor";

describe("患者モニター（模擬）: 波形", () => {
  it("one beat is 60000 / HR ms, clamped to a sensible heart rate", () => {
    expect(beatMs(60)).toBe(1000);
    expect(beatMs(120)).toBe(500);
    expect(beatMs(0)).toBe(beatMs(20));
    expect(beatMs(999)).toBe(beatMs(250));
    expect(breathMs(15)).toBe(4000);
  });

  it("the ECG beat has one tall R wave, a P before it and a T after it, and is flat between beats", () => {
    const xs = Array.from({ length: 1000 }, (_, i) => i / 1000);
    const ys = xs.map(ecgSample);
    const peak = ys.indexOf(Math.max(...ys));
    expect(xs[peak]).toBeCloseTo(0.25, 1);
    expect(Math.max(...ys)).toBeGreaterThan(0.85);
    expect(Math.max(...ys)).toBeLessThan(1.05);
    // P wave: a small bump around 0.12; T wave: a bump around 0.45; the end of the cycle is flat.
    expect(ecgSample(0.12)).toBeGreaterThan(0.1);
    expect(ecgSample(0.12)).toBeLessThan(0.3);
    expect(ecgSample(0.45)).toBeGreaterThan(0.2);
    expect(ecgSample(0.45)).toBeLessThan(0.5);
    expect(Math.abs(ecgSample(0.8))).toBeLessThan(0.01);
    // The S wave dips below the line.
    expect(Math.min(...ys)).toBeLessThan(-0.1);
    // Phase wraps.
    expect(ecgSample(1.25)).toBeCloseTo(ecgSample(0.25), 6);
  });

  it("the pulse wave and the breath stay within 0..1 and repeat each cycle", () => {
    for (let i = 0; i <= 100; i++) {
      const x = i / 100;
      expect(plethSample(x)).toBeGreaterThanOrEqual(0);
      expect(plethSample(x)).toBeLessThanOrEqual(1);
      expect(respSample(x)).toBeGreaterThanOrEqual(0);
      expect(respSample(x)).toBeLessThanOrEqual(1);
    }
    expect(plethSample(0.15)).toBeCloseTo(1, 1);
    expect(respSample(0.4)).toBeCloseTo(1, 6);
    expect(respSample(0)).toBeCloseTo(0, 6);
    expect(plethSample(2.3)).toBeCloseTo(plethSample(0.3), 6);
  });

  it("a series at a faster heart rate has more beats in the same time", () => {
    const beats = (hr: number) => traceSeries("ecg", hr, 6000, 1).filter((v, i, a) => v > 0.9 && (i === 0 || a[i - 1] <= 0.9)).length;
    expect(beats(60)).toBe(6);
    expect(beats(120)).toBe(12);
    // The same inputs give the same list.
    expect(traceSeries("pleth", 80, 50, 20)).toEqual(traceSeries("pleth", 80, 50, 20));
  });
});

describe("患者モニター（模擬）: 数値の揺らぎ", () => {
  it("the seed of a string is stable and differs between strings", () => {
    expect(seedOf("p-001")).toBe(seedOf("p-001"));
    expect(seedOf("p-001")).not.toBe(seedOf("p-002"));
  });

  it("wobble stays within ±amp and the bounds, with the digits asked", () => {
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      const v = wobble(80, 3, r);
      expect(v).toBeGreaterThanOrEqual(77);
      expect(v).toBeLessThanOrEqual(83);
      expect(Number.isInteger(v)).toBe(true);
    }
    expect(wobble(100, 1, 1, { max: 100 })).toBe(100);
    expect(wobble(36.8, 0.2, 0.5, { digits: 1 })).toBe(36.8);
  });

  it("the live numbers wobble around the latest record (not toward normal), the same for the same seed and tick", () => {
    const latest = { hr: 118, spo2: 91, rr: 24 };
    for (let tick = 0; tick < 200; tick++) {
      const n = liveNumbers(latest, "p-9", tick);
      expect(n.hr!).toBeGreaterThanOrEqual(115);
      expect(n.hr!).toBeLessThanOrEqual(121);
      expect(n.spo2!).toBeGreaterThanOrEqual(90);
      expect(n.spo2!).toBeLessThanOrEqual(92);
      expect(n.rr!).toBeGreaterThanOrEqual(23);
      expect(n.rr!).toBeLessThanOrEqual(25);
    }
    expect(liveNumbers(latest, "p-9", 7)).toEqual(liveNumbers(latest, "p-9", 7));
    const seq = (seed: string) => Array.from({ length: 20 }, (_, t) => liveNumbers(latest, seed, t).hr);
    expect(seq("a")).toEqual(seq("a"));
    expect(seq("a")).not.toEqual(seq("b"));
  });

  it("a value missing from the record stays missing (the screen shows —)", () => {
    expect(liveNumbers({ hr: 70 }, "x", 1)).toEqual({ hr: expect.any(Number) });
    expect(liveNumbers(undefined, "x", 1)).toEqual({});
  });

  it("SpO2 never shows above 100", () => {
    for (let tick = 0; tick < 50; tick++) expect(liveNumbers({ spo2: 100 }, "s", tick).spo2).toBeLessThanOrEqual(100);
  });

  it("the simulated cuff gives a pressure near the last one, diastolic below systolic", () => {
    for (let tick = 0; tick < 50; tick++) {
      const bp = simulatedNibp({ sbp: 130, dbp: 80 }, "p", tick);
      expect(bp.sbp).toBeGreaterThanOrEqual(124);
      expect(bp.sbp).toBeLessThanOrEqual(136);
      expect(bp.dbp).toBeLessThan(bp.sbp);
    }
    expect(simulatedNibp(undefined, "p", 3)).toEqual(simulatedNibp(undefined, "p", 3));
  });
});

describe("患者モニター（模擬）: アラームの判定（架空の病院の取り決め）", () => {
  it("values inside the limits give no alarm", () => {
    expect(alarmsOf({ hr: 72, spo2: 97, rr: 16, sbp: 120 })).toEqual([]);
    expect(alarmsOf({ hr: 50, spo2: 90, rr: 8, sbp: 90 })).toEqual([]);
    expect(alarmsOf({ hr: 120, rr: 25, sbp: 180 })).toEqual([]);
  });

  it("values outside the limits are named with the limit crossed", () => {
    const a = alarmsOf({ hr: 128, spo2: 88, rr: 27, sbp: 85 });
    expect(a.map((x) => x.key)).toEqual(["hr", "spo2", "rr", "sbp"]);
    expect(a[0].text).toContain("上限 120");
    expect(a[1].text).toContain("下限 90");
    expect(a[2].text).toContain("上限 25");
    expect(a[3].text).toContain("下限 90");
    expect(alarmsOf({ hr: 45 })[0].text).toContain("下限 50");
  });

  it("missing values are not alarms", () => {
    expect(alarmsOf({})).toEqual([]);
    expect(alarmsOf({ hr: NaN })).toEqual([]);
  });
});

describe("セントラルモニター: 誰にモニターを付けるか（架空の病院の取り決め）", () => {
  const p = (id: string, over: Partial<MonitorCandidate> = {}): MonitorCandidate => ({ id, name: id, room: `50${id.slice(-1)}A`, admittedOn: -10, latest: { day: 0, time: "08:00", hr: 72, spo2: 97, rr: 16, o2: "室内気" }, ...over });

  it("oxygen, HR ≥ 100, SpO2 < 95 and admission within 2 days each put a patient on; a quiet patient is off", () => {
    expect(autoReasons(p("a"))).toEqual([]);
    expect(autoReasons(p("b", { latest: { day: 0, time: "08:00", o2: "鼻カニュラ 2L" } }))).toEqual(["酸素投与中"]);
    expect(autoReasons(p("c", { latest: { day: 0, time: "08:00", hr: 100 } }))).toEqual(["心拍数 100 以上"]);
    expect(autoReasons(p("d", { latest: { day: 0, time: "08:00", spo2: 94 } }))).toEqual(["SpO2 95 未満"]);
    expect(autoReasons(p("e", { admittedOn: -2 }))).toEqual(["入院 2 日以内"]);
    expect(autoReasons(p("f", { admittedOn: -3 }))).toEqual([]);
    expect(autoReasons(p("g", { latest: undefined }))).toEqual([]);
  });

  it("the manual list adds and removes, and the result is in room order", () => {
    const quiet = p("1", { room: "510A" });
    const fast = p("2", { room: "501A", latest: { day: 0, time: "08:00", hr: 110 } });
    const list = monitored([quiet, fast]);
    expect(list.map((m) => m.patient.id)).toEqual(["2"]);
    const withQuiet = monitored([quiet, fast], { on: ["1"], off: [] });
    expect(withQuiet.map((m) => m.patient.id)).toEqual(["2", "1"]);
    expect(withQuiet[1].reasons).toEqual(["手で装着"]);
    expect(monitored([quiet, fast], { on: [], off: ["2"] })).toEqual([]);
  });

  it("toggling by hand moves the id between the two lists", () => {
    let m = toggleMonitor({ on: [], off: [] }, "x", true);
    expect(m).toEqual({ on: ["x"], off: [] });
    m = toggleMonitor(m, "x", false);
    expect(m).toEqual({ on: [], off: ["x"] });
    m = toggleMonitor(m, "x", true);
    expect(m).toEqual({ on: ["x"], off: [] });
  });
});
