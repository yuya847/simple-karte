import { describe, expect, it } from "vitest";

describe("日をまたぐ時計", () => {
  it("counts on from the first day after midnight", async () => {
    const { continuedTime, daysFrom } = await import("./dates");
    const boot = { y: 2026, m: 11, d: 3 };
    expect(daysFrom(boot, { y: 2026, m: 11, d: 4 })).toBe(1);
    expect(continuedTime(boot, new Date("2026-11-03T13:15:00Z"))).toBe("22:15");
    expect(continuedTime(boot, new Date("2026-11-03T15:30:00Z"))).toBe("24:30");
    expect(continuedTime(boot, new Date("2026-11-04T00:05:00Z"))).toBe("33:05");
  });
});
