import { describe, expect, it } from "vitest";
import { PATIENTS } from "./patients";
import { collectFacts, dischargeChecks, labTrend } from "./discharge";
import type { OrderEntry } from "./types";

const today = { y: 2026, m: 11, d: 3 };
const sakura = PATIENTS.find((p) => p.id === "90010231")!;
const entries = sakura.history.filter((e): e is OrderEntry => e.kind === "order");

describe("退院時サマリーの事実はカルテからコードで集める", () => {
  it("dates, days, cultures and the lab trend come from the chart", () => {
    const f = collectFacts(sakura, sakura.history.filter((e): e is OrderEntry => e.kind === "order"), [], today, 4);
    expect(f.admitted).toBe("10/31（土）");
    expect(f.days).toBe(8); // -3 … +4
    expect(f.cultures.some((c) => c.includes("MRSA") || c.includes("黄色ブドウ球菌"))).toBe(true);
    expect(labTrend(sakura).find((l) => l.code === "CRP")?.first.day).toBe(-3);
  });
  it("lists what to settle before discharge", () => {
    const c = dischargeChecks(sakura, entries, ["造影CT"]);
    expect(c.at(-1)).toBe("説明前の同意書：造影CT");
  });
});
