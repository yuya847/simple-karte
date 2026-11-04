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

import { canReviewVerbal, reviewVerbal, verbalConfirmationProblems } from "./verbal";
it("医師・復唱・有効な時刻が揃うまで確定できない", () => {
  expect(verbalConfirmationProblems({ doctor: " ", readBack: false, time: "24:00" })).toHaveLength(3);
  expect(verbalConfirmationProblems({ doctor: "当直医", readBack: true, time: "00:00" })).toEqual([]);
});
it("指示医と指導医だけが承認・理由付き取り消しを行い、承認待ちから消える", () => {
  const doctor = { role: "医師" as const, name: "当直医" };
  expect(canReviewVerbal(e(), { ...doctor, name: "別の医師" })).toBe(false);
  expect(canReviewVerbal(e(), { role: "看護師", name: "当直医" })).toBe(false);
  expect(canReviewVerbal(e(), { ...doctor, name: "指導医 高橋" })).toBe(true);
  const signed = reviewVerbal(e(), doctor, "08:00");
  expect(signed.verbal).toMatchObject({ signedBy: "当直医", signedAt: { day: 0, time: "08:00" } });
  expect(verbalUnsigned([signed])).toEqual([]);
  expect(reviewVerbal(e(), doctor, "08:00", " ")).toEqual(e());
  const cancelled = reviewVerbal(e(), doctor, "08:00", "指示を訂正");
  expect(cancelled.verbal?.cancelled?.reason).toBe("指示を訂正");
  expect(verbalUnsigned([cancelled])).toEqual([]);
});
