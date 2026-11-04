import { describe, expect, it } from "vitest";
import { decideHint } from "./decide-hint";

describe("「決める」の横の文：足りないものを並べる", () => {
  it("chosen things: 「〜を選ぶと決められます」", () => {
    expect(decideHint(["経路"])).toBe("経路を選ぶと決められます");
    expect(decideHint(["経路", "回数"])).toBe("経路と回数を選ぶと決められます");
    expect(decideHint(["1回の時間"])).toBe("1回の時間を選ぶと決められます");
  });
  it("typed things: 「〜を入れると決められます」; mixed: typed first, then chosen", () => {
    expect(decideHint(["量"])).toBe("量を入れると決められます");
    expect(decideHint(["速度"])).toBe("速度を入れると決められます");
    expect(decideHint(["量", "経路", "回数"])).toBe("量を入れて、経路と回数を選ぶと決められます");
  });
  it("nothing missing: empty", () => {
    expect(decideHint([])).toBe("");
  });
});
