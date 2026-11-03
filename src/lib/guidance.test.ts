import { describe, expect, it } from "vitest";
import { guidanceNoteText, guidanceProblems, nutritionCountNote, nutritionTimeNote, openRequests, type GuidanceRecord } from "./guidance";
import type { OrderEntry } from "./types";

const req = (id: string, kind: "栄養食事指導" | "服薬指導" | "退院時の生活指導"): OrderEntry => ({
  kind: "order",
  id,
  day: 0,
  time: "09:00",
  author: "山本（専攻医）",
  status: "有効",
  order: { type: "procedure", code: "PROC-GUIDE", start: { day: 0 }, guide: { kind, note: "" } } as never,
});

describe("指導の記録", () => {
  it("closes the request it answers, and only that kind", () => {
    const entries = [req("g1", "栄養食事指導"), req("g2", "服薬指導")];
    const rec = { answers: ["g1"] } as GuidanceRecord;
    expect(openRequests(entries, "栄養食事指導", [])).toHaveLength(1);
    expect(openRequests(entries, "栄養食事指導", [rec])).toHaveLength(0);
    expect(openRequests(entries, "服薬指導", [rec])).toHaveLength(1);
  });
  it("needs content and minutes", () => {
    expect(guidanceProblems({ text: "", minutes: null })).toEqual(["内容", "時間（分）"]);
    expect(guidanceProblems({ text: "減塩", minutes: 30 })).toEqual([]);
  });
  it("counts the fee schedule's limits: once a week, twice a stay", () => {
    const dow = (d: number) => (2 + d + 70) % 7; // day 0 = Tuesday
    expect(nutritionCountNote([], 0, dow)).toBeNull();
    expect(nutritionCountNote([-1], 0, dow)).toContain("週1回"); // Monday, same week
    expect(nutritionCountNote([-3], 0, dow)).toBeNull(); // Saturday, the week before
    expect(nutritionCountNote([-10, -3], 0, dow)).toContain("2回まで");
  });
  it("compares the minutes with the notice's 30 (初回) and 20 (2回目)", () => {
    expect(nutritionTimeNote(25, 0)).toContain("初回は概ね30分");
    expect(nutritionTimeNote(30, 0)).toBeNull();
    expect(nutritionTimeNote(20, 1)).toBeNull();
    expect(nutritionTimeNote(15, 1)).toContain("2回目は概ね20分");
  });
  it("writes the note", () => {
    expect(guidanceNoteText({ kind: "栄養食事指導", heard: "本人と家族", minutes: 30, text: "減塩6g未満 " } as GuidanceRecord)).toBe("【栄養食事指導】相手：本人と家族　30分\n減塩6g未満");
  });
});
