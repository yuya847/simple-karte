import { describe, expect, it } from "vitest";
import { INITIAL_NOTICES, INITIAL_READS, ROLE_DEPT, fillDates, isExpired, markRead, postProblems, sortNotices, unreadCount, untilLabel, type Notice } from "./board";
import { STAFF } from "./roles";

const today = { y: 2026, m: 11, d: 3 };
const n = (id: string, day: number, time: string, important = false, until: number | null = null): Notice => ({ id, from: "総務課", title: id, body: "", by: "総務課", posted: { day, time }, important, until });

describe("board", () => {
  it("counts what this person has not opened, leaving out expired notices", () => {
    const list = [n("a", 0, "09:00"), n("b", -1, "09:00"), n("old", -9, "09:00", false, -2)];
    expect(unreadCount(list, {}, "看護師 佐藤")).toBe(2);
    expect(unreadCount(list, { a: ["看護師 佐藤"] }, "看護師 佐藤")).toBe(1);
    expect(unreadCount(list, { a: ["看護師 佐藤"] }, "薬剤師 小林")).toBe(2);
  });

  it("marks a notice read without changing the old object", () => {
    const before = { a: ["薬剤師 小林"] };
    const after = markRead(before, "a", "看護師 佐藤");
    expect(after.a).toEqual(["薬剤師 小林", "看護師 佐藤"]);
    expect(before.a).toEqual(["薬剤師 小林"]);
    expect(markRead(after, "a", "看護師 佐藤")).toBe(after);
  });

  it("puts important unread first, then unread, then read, newest first in each", () => {
    const list = [n("read-new", 0, "10:00", true), n("plain-old", -2, "08:00"), n("plain-new", 0, "08:00"), n("imp-old", -3, "08:00", true), n("imp-new", -1, "23:00", true)];
    const order = sortNotices(list, { "read-new": ["me"] }, "me").map((x) => x.id);
    expect(order).toEqual(["imp-new", "imp-old", "plain-new", "plain-old", "read-new"]);
  });

  it("expires after the last day, and shows the dates", () => {
    expect(isExpired(n("x", -3, "09:00", false, 0))).toBe(false);
    expect(isExpired(n("x", -3, "09:00", false, -1))).toBe(true);
    expect(isExpired(n("x", -3, "09:00", false, null))).toBe(false);
    expect(untilLabel(n("x", 0, "09:00", false, 7), today)).toBe("11/10（火）まで");
    expect(untilLabel(n("x", 0, "09:00", false, -1), today)).toBe("11/2（月）まで（期限切れ）");
    expect(untilLabel(n("x", 0, "09:00"), today)).toBe("期限なし");
    expect(fillDates("{+2} 2:00〜、{0}から、{-1}に", today)).toBe("11/5（木） 2:00〜、11/3（火）から、11/2（月）に");
  });

  it("needs a title and a body to post; the department follows the role", () => {
    expect(postProblems({ title: " ", body: "" })).toEqual(["題名", "本文"]);
    expect(postProblems({ title: "お知らせ", body: "本文" })).toEqual([]);
    expect(ROLE_DEPT.医師).toBe("医局");
    expect(ROLE_DEPT.MSW).toBe("地域連携室");
  });

  it("starts with fictional notices, some expired and some already read", () => {
    expect(INITIAL_NOTICES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(INITIAL_NOTICES.map((x) => x.id)).size).toBe(INITIAL_NOTICES.length);
    expect(INITIAL_NOTICES.some((x) => isExpired(x))).toBe(true);
    expect(INITIAL_NOTICES.every((x) => x.posted.day <= 0 && /^\d\d:\d\d$/.test(x.posted.time))).toBe(true);
    for (const ids of Object.values(INITIAL_READS)) for (const name of ids) expect(Object.values(STAFF).map((s) => s.name)).toContain(name);
    expect(INITIAL_NOTICES.find((x) => x.id === "n-meal")!.body).toContain("朝食は前日の17:00");
  });
});
