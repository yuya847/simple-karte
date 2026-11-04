import { describe, expect, it } from "vitest";
import { pushRecent } from "./recent";

describe("最近開いた患者", () => {
  it("puts the latest first, moves a reopened patient up, and keeps at most the limit", () => {
    let l = pushRecent([], "a", 0, "09:00");
    l = pushRecent(l, "b", 0, "09:10");
    l = pushRecent(l, "a", 0, "09:20");
    expect(l.map((r) => `${r.id} ${r.time}`)).toEqual(["a 09:20", "b 09:10"]);
    expect(pushRecent(l, "c", 0, "10:00", 2).map((r) => r.id)).toEqual(["c", "a"]);
  });
});
