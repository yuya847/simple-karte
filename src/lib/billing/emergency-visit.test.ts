import { describe, expect, it } from "vitest";
import { arrivalDate, emergencyBand, pendingDraftCount, transferEmergencyOrders } from "./emergency-visit";
import type { HistoryEntry } from "../types";

describe("救急の受診時刻", () => {
  it.each([[359, "深夜"], [360, "時間外"], [479, "時間外"], [480, null], [1079, null], [1080, "時間外"], [1319, "時間外"], [1320, "深夜"]] as const)("平日 %i分 → %s", (min, band) => expect(emergencyBand("2026-11-05", min)).toBe(band));
  it("土曜午後・日曜・祝日・年末年始、深夜優先", () => {
    expect(emergencyBand("2026-11-07", 720)).toBe("時間外");
    expect(emergencyBand("2026-11-08", 600)).toBe("休日");
    expect(emergencyBand("2026-11-03", 600)).toBe("休日");
    expect(emergencyBand("2026-12-29", 600)).toBe("休日");
    expect(emergencyBand("2026-11-08", 1320)).toBe("深夜");
  });
  it("日付をまたぐ到着は前日の曜日・祝日で判定", () => {
    expect(arrivalDate("2026-11-09", -840)).toBe("2026-11-08");
    expect(emergencyBand("2026-11-09", -840)).toBe("休日");
    expect(emergencyBand("2026-11-09", -30)).toBe("深夜");
  });
});
it("職種ごとの下書きを合計し共有コピーと重ねない", () => {
  expect(pendingDraftCount({ p: { drafts: [1] }, "p|医師": { drafts: [1, 2] }, "p|看護師": { drafts: [3] }, "p2|医師": { drafts: [1] } }, "p")).toBe(3);
  expect(pendingDraftCount({}, "p")).toBe(0);
});
it("救急から入院には確定オーダーだけをIDで重複なく引き継ぐ", () => {
  const order = { kind: "order", id: "inj1" } as HistoryEntry;
  expect(transferEmergencyOrders([order], [order, { kind: "note" } as HistoryEntry])).toEqual([order]);
  expect(transferEmergencyOrders([], [order])).toEqual([order]);
});
