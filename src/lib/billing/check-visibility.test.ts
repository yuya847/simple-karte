import { describe, expect, it } from "vitest";
import { touchedBy, visibleChecks } from "./check-visibility";
import { checkInsurance, EMPTY_FORM } from "./registration";

const today = { y: 2026, m: 11, d: 4 };

describe("保険の登録の確かめの出し方", () => {
  it("a fresh, untouched form shows nothing, although the code finds the empty fields", () => {
    const checks = checkInsurance(EMPTY_FORM, { age: 71, on: today });
    expect(checks.filter((c) => c.level === "error").length).toBeGreaterThanOrEqual(4);
    expect(visibleChecks(checks, { fresh: true, revealAll: false, touched: new Set() })).toEqual([]);
  });
  it("shows the checks of the fields touched, and everything once 登録 is pressed", () => {
    const form = { ...EMPTY_FORM, kind: "国保" as const, insurerNumber: "12" };
    const checks = checkInsurance(form, { age: 71, on: today });
    const touched = touchedBy(touchedBy(new Set(), { kind: "国保" }), { insurerNumber: "12" });
    expect(touched).toEqual(new Set(["kind", "insurerNumber"]));
    const some = visibleChecks(checks, { fresh: true, revealAll: false, touched });
    expect(some.length).toBeGreaterThan(0);
    expect(some.every((c) => c.field === "kind" || c.field === "insurerNumber")).toBe(true);
    expect(some.some((c) => c.text.includes("6桁"))).toBe(true);
    expect(visibleChecks(checks, { fresh: true, revealAll: true, touched })).toEqual(checks);
  });
  it("a form that edits an existing record shows every check at once", () => {
    const checks = checkInsurance(EMPTY_FORM, { age: 71, on: today });
    expect(visibleChecks(checks, { fresh: false, revealAll: false, touched: new Set() })).toEqual(checks);
  });
});
