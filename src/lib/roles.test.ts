import { describe, expect, it } from "vitest";
import { ROLES, TABS, can, denyReason, home } from "./roles";

describe("roles", () => {
  it("only the doctor confirms orders; a nurse enters them as 口頭指示", () => {
    expect(can("医師", "order")).toBe(true);
    expect(can("看護師", "order")).toBe(false);
    expect(can("看護師", "order.verbal")).toBe(true);
    expect(can("薬剤師", "order")).toBe(false);
    expect(can("薬剤師", "order.verbal")).toBe(false);
  });

  it("says who may do a locked action", () => {
    expect(denyReason("医師", "order")).toBeNull();
    expect(denyReason("看護師", "consent")).toBe("説明と同意の記録は医師が行います（いまは看護師で入っています）。");
    expect(denyReason("医事課", "vitals")).toContain("看護師・医師");
  });

  it("every role starts on a tab it can see", () => {
    for (const r of ROLES) expect(TABS[r]).toContain(home(r));
  });

  it("医事課 does not write clinical notes", () => {
    expect(can("医事課", "note")).toBe(false);
    expect(can("MSW", "note")).toBe(true);
  });
});
