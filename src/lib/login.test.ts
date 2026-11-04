import { describe, expect, it } from "vitest";
import { afterFail, checkPassword, DEFAULT_LOGIN, forgetPassword, hashPassword, idleOver, loadFails, loadLoginSettings, loadPasswords, lockedFor, LOCK_RULE, passwordProblem, saveFails, saveLoginSettings, savePassword } from "./login";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

describe("ログインの仕組み（既定はオフ）", () => {
  it("is off until it is turned on for this device, and keeps only a known idle time", () => {
    const s = memory();
    expect(loadLoginSettings(s)).toEqual(DEFAULT_LOGIN);
    expect(DEFAULT_LOGIN.on).toBe(false);
    saveLoginSettings({ on: true, idleMinutes: 10 }, s);
    expect(loadLoginSettings(s)).toEqual({ on: true, idleMinutes: 10 });
    s.setItem("simple-karte:login-settings", JSON.stringify({ on: "yes", idleMinutes: 9999 }));
    expect(loadLoginSettings(s)).toEqual(DEFAULT_LOGIN);
    expect(loadLoginSettings(null)).toEqual(DEFAULT_LOGIN);
  });

  it("asks for 13 characters or more with letters and digits, nothing easy to guess, typed twice the same", () => {
    expect(passwordProblem("abc123", "abc123", "看護師 佐藤")).toMatch(/13文字以上/);
    expect(passwordProblem("abcdefghijklmn", "abcdefghijklmn", "")).toMatch(/英字と数字/);
    expect(passwordProblem("aaaa1234567890", "aaaa1234567890", "")).toMatch(/4つ以上/);
    expect(passwordProblem("mypassword2026x", "mypassword2026x", "")).toMatch(/推測されやすい/);
    expect(passwordProblem("Ward5East2026b", "Ward5East2026c", "")).toMatch(/2回目/);
    expect(passwordProblem("Ward5East2026b", "Ward5East2026b", "看護師 佐藤")).toBeNull();
  });

  it("keeps only a salted hash, and checks a password against it", async () => {
    const rec = await hashPassword("Ward5East2026b", "看護師", 1000);
    expect(JSON.stringify(rec)).not.toContain("Ward5East2026b");
    expect(await checkPassword("Ward5East2026b", rec)).toBe(true);
    expect(await checkPassword("Ward5East2026c", rec)).toBe(false);
    const again = await hashPassword("Ward5East2026b", "看護師", 1000);
    expect(again.salt).not.toBe(rec.salt);
    expect(again.hash).not.toBe(rec.hash);
    const s = memory();
    savePassword("看護師 佐藤", rec, s);
    expect(loadPasswords(s)["看護師 佐藤"]).toEqual(rec);
    forgetPassword("看護師 佐藤", s);
    expect(loadPasswords(s)).toEqual({});
  });

  it("stops logging in for some minutes after five wrong passwords in a row", () => {
    let f = afterFail(undefined, 0);
    for (let i = 1; i < LOCK_RULE.tries - 1; i++) f = afterFail(f, 0);
    expect(f).toEqual({ count: LOCK_RULE.tries - 1 });
    expect(lockedFor(f, 0)).toBe(0);
    f = afterFail(f, 1000);
    expect(lockedFor(f, 1000)).toBe(LOCK_RULE.minutes);
    expect(lockedFor(f, 1000 + LOCK_RULE.minutes * 60_000)).toBe(0);
    // After the stop, counting starts again.
    expect(afterFail(f, 1000 + LOCK_RULE.minutes * 60_000 + 1)).toEqual({ count: 1 });
    const s = memory();
    saveFails({ "看護師 佐藤": f }, s);
    expect(loadFails(s)["看護師 佐藤"]).toEqual(f);
  });

  it("locks the screen after the minutes without use", () => {
    expect(idleOver(0, 14 * 60_000, 15)).toBe(false);
    expect(idleOver(0, 15 * 60_000, 15)).toBe(true);
  });
});
