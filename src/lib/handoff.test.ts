import { describe, expect, it } from "vitest";
import { emptyHandoff, handoffFacts, handoffKey, nextShift, previousHandoff, sendProblems, statusOf } from "./handoff";
import { PATIENTS } from "./patients";
import { BEDS } from "./ward";
import type { OrderEntry } from "./types";

const today = { y: 2026, m: 11, d: 3 };

describe("handoff", () => {
  it("picks the shift that starts next", () => {
    expect(nextShift(7 * 60).label).toBe("夜勤→日勤");
    // During the overlap the handoff is still to the shift that is starting.
    expect(nextShift(8 * 60 + 45)).toMatchObject({ label: "夜勤→日勤", lo: 8 * 60 + 30 });
    expect(nextShift(16 * 60 + 40)).toMatchObject({ label: "日勤→夜勤", lo: 16 * 60 + 30 });
    expect(nextShift(17 * 60 + 5).label).toBe("夜勤→日勤");
    expect(nextShift(14 * 60)).toMatchObject({ label: "日勤→夜勤", lo: 16 * 60 + 30, hi: 1440 + 9 * 60 });
    expect(nextShift(20 * 60)).toMatchObject({ label: "夜勤→日勤", lo: 1440 + 8 * 60 + 30 });
  });

  it("keeps one handoff per patient per shift, and finds the one before", () => {
    const morning = { ...emptyHandoff("a", "p", "夜勤→日勤", "看護師 田中"), shiftLo: 510, sentAt: { day: 0, time: "08:40" }, summary: "朝の送り" };
    const evening = { ...emptyHandoff("b", "p", "日勤→夜勤", "看護師 佐藤"), shiftLo: 990 };
    const all = { [handoffKey("p", 510)]: morning, [handoffKey("p", 990)]: evening };
    expect(Object.keys(all)).toHaveLength(2);
    expect(previousHandoff(all, "p", 990)?.summary).toBe("朝の送り");
    expect(previousHandoff(all, "p", 510)).toBeUndefined();
  });

  it("the person chooses the severity and says the summary before sending", () => {
    const h = emptyHandoff("h1", "p", "日勤→夜勤", "看護師 佐藤");
    expect(sendProblems(h)).toHaveLength(2);
    expect(sendProblems({ ...h, severity: "要注意", summary: "入院4日目" })).toEqual([]);
    expect(statusOf(undefined)).toBe("未作成");
    expect(statusOf(h)).toBe("作成中");
    expect(statusOf({ ...h, sentAt: { day: 0, time: "16:00" } })).toBe("送り済み");
    expect(statusOf({ ...h, sentAt: { day: 0, time: "16:00" }, receivedAt: { day: 0, time: "16:40" } })).toBe("受け済み");
  });

  it("gathers facts from the chart by code", () => {
    const p = PATIENTS[0];
    const room = BEDS.find((b) => b.patientId === p.id)!;
    const entries = p.history.filter((e): e is OrderEntry => e.kind === "order");
    const facts = handoffFacts({ patient: p, room: `${room.room}${room.bed}`, entries }, 14 * 60, today, ["未確認の結果 1件"]);
    expect(facts[0]).toMatch(/^最新のバイタル/);
    expect(facts.some((f) => f.includes("NEWS2"))).toBe(true);
    expect(facts.at(-1)).toBe("未確認の結果 1件");
  });
});
