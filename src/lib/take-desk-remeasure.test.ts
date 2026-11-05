import { describe, expect, it } from "vitest";
import { markRemeasured, pendingRemeasure, remeasureItem } from "./take-desk-remeasure";

const v = { day: 0, time: "11:20", bt: 38.5, hr: 124, sbp: 86, dbp: 50, rr: 28, spo2: 88, avpu: "V" as const };
describe("架空の病院の再測定予定", () => {
  it.each([0, 4])("%i点では予定を作らない", (score) => expect(remeasureItem(v, score, "11:20")).toBeNull());
  it.each([5, 6])("%i点は1時間後", (score) => expect(remeasureItem(v, score, "11:20")).toEqual({ time: "12:20", label: `再測定 NEWS2 ${score}点のため` }));
  it.each([7, 15])("%i点は30分後", (score) => expect(remeasureItem(v, score, "11:20")).toEqual({ time: "11:50", label: `再測定 NEWS2 ${score}点のため` }));
  it("遅れて入力したときは確定時刻から、翌日は24時を超えた時刻で返す", () => {
    expect(remeasureItem(v, 15, "12:00")?.time).toBe("12:30");
    expect(remeasureItem({ ...v, time: "23:50" }, 15, "23:55")?.time).toBe("24:25");
  });
  it("記録した確定時刻を保持し、測った操作か次の測定で前の予定を消す", () => {
    expect(pendingRemeasure([{ ...v, recordedTime: "11:25" }])?.time).toBe("11:55");
    expect(pendingRemeasure(markRemeasured([v]))).toBeNull();
    expect(v).not.toHaveProperty("remeasured");
    expect(pendingRemeasure([v, { day: 0, time: "11:45" }])).toBeNull();
    expect(pendingRemeasure([v, { ...v, time: "11:45" }])?.time).toBe("12:15");
    expect(pendingRemeasure([])).toBeNull();
  });
});
