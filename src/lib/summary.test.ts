import { describe, expect, it } from "vitest";
import { initialEvals } from "./admit-eval";
import { PATIENTS } from "./patients";
import { initialStanding } from "./standing";
import { summaryFacts } from "./summary";
import type { OrderEntry } from "./types";

describe("連携サマリ", () => {
  it("gathers the items from the record", () => {
    const p = PATIENTS.find((x) => x.id === "90010198")!;
    const s = summaryFacts(p, p.history.filter((e): e is OrderEntry => e.kind === "order"), { y: 2026, m: 11, d: 3 }, { diagnoses: [], standing: initialStanding()[p.id][0], dietNow: "治療食", evals: initialEvals().find((e) => e.patientId === p.id) });
    const get = (h: string) => s.find((x) => x.heading === h)!.lines;
    expect(get("感染症・アレルギー")).toContain("アレルギー：NSAIDs（喘息発作）");
    expect(get("制限事項（安静・入浴・食事）")).toEqual(["安静度：病棟内歩行", "清潔：シャワー浴", "食事：治療食"]);
    expect(get("医師への連絡の基準・頓用（指示簿）")[0]).toBe("収縮期血圧 180mmHg以上");
    expect(get("病名")).toEqual(["慢性心不全の急性増悪"]);
  });
});
