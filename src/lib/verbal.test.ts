import { describe, expect, it } from "vitest";
import { verbalDeadline, verbalOverdue, verbalUnsigned } from "./verbal";
import type { OrderEntry } from "./types";

const e = (signed = false): OrderEntry => ({
  kind: "order",
  id: "v1",
  day: 0,
  time: "02:10",
  author: "x",
  status: "有効",
  order: { type: "lab", codes: ["LAB-CBC"], collect: { day: 0, time: "02:30" }, priority: "至急" } as OrderEntry["order"],
  verbal: { takenBy: "看護師", doctor: "当直医", at: { day: 0, time: "02:10" }, ...(signed ? { signedAt: { day: 0, time: "08:30" } } : {}) },
});

describe("口頭指示", () => {
  it("unsigned ones, and the 24-hour limit", () => {
    expect(verbalUnsigned([e(), e(true)])).toHaveLength(1);
    expect(verbalDeadline(e())).toBe(130 + 1440);
    expect(verbalOverdue(e(), 130 + 1440)).toBe(false);
    expect(verbalOverdue(e(), 131 + 1440)).toBe(true);
    expect(verbalOverdue(e(true), 3000)).toBe(false);
  });
});
