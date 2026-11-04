import { describe, expect, it } from "vitest";
import { erxChecks, takenUntil } from "./erx-check";
import { otherRxOf, type OtherRx } from "./other-records";

const today = { y: 2026, m: 11, d: 4 };
const rec = (over: Partial<OtherRx>): OtherRx => ({ drug: "ORAL-AMLO5", perDose: 1, timings: ["朝"], days: 28, issuedOn: -10, prescriber: "kaede", pharmacy: "sakuraPh", via: "電子処方箋", ...over });

describe("重複投薬等チェック of the simulated 電子処方箋管理サービス", () => {
  it("finds the 併用禁忌 of スピロノラクトン with another clinic's エプレレノン, with the 電子添文 10.1", () => {
    const f = erxChecks(["ORAL-SPL25"], otherRxOf("opd-1"), today);
    expect(f).toHaveLength(1);
    expect(f[0].kind).toBe("併用禁忌");
    expect(f[0].other?.institution).toBe("あおば内科（架空）");
    expect(f[0].other?.drugName).toBe("セララ錠２５ｍｇ");
    expect(f[0].sources[0].label).toContain("アルダクトンA");
    expect(f[0].sources[0].label).toContain("10.1");
    expect(f[0].sources[0].url).toContain("pmda.go.jp");
  });

  it("finds a duplicate of the same ingredient while the other prescription lasts", () => {
    const f = erxChecks(["ORAL-SPL25", "ORAL-MGO330"], otherRxOf("90010198"), today);
    expect(f.map((x) => `${x.kind}:${x.drug}`)).toEqual(["重複投薬:ORAL-SPL25"]);
    expect(f[0].text).toContain("スピロノラクトン");
    expect(f[0].other?.until).toBe("12/3（木）");
  });

  it("looks back 100 days, counts 14 days for a 頓服, and skips what is over", () => {
    expect(takenUntil(rec({ timings: [], days: 3, issuedOn: -5 }))).toBe(8);
    expect(erxChecks(["ORAL-AMLO5"], [rec({ issuedOn: -48 })], today)).toEqual([]);
    expect(erxChecks(["ORAL-AMLO5"], [rec({ issuedOn: -101, days: 120 })], today)).toEqual([]);
    expect(erxChecks(["ORAL-AMLO5"], [rec({ issuedOn: -100, days: 120 })], today)).toHaveLength(1);
    expect(erxChecks(["ORAL-APAP500"], [rec({ drug: "ORAL-APAP500", timings: [], days: 5, issuedOn: -13 })], today)).toHaveLength(1);
    expect(erxChecks(["ORAL-APAP500"], [rec({ drug: "ORAL-APAP500", timings: [], days: 5, issuedOn: -14 })], today)).toEqual([]);
    expect(erxChecks(["ORAL-APAP500"], otherRxOf("opd-1"), today)).toEqual([]);
  });

  it("without consent shows only that there is a finding, not the other drug or institution", () => {
    const f = erxChecks(["ORAL-SPL25"], otherRxOf("opd-1"), today, false);
    expect(f[0].other).toBeNull();
    expect(f[0].text).toContain("同意がない");
    expect(JSON.stringify(f)).not.toContain("エプレレノン");
    expect(JSON.stringify(f)).not.toContain("あおば内科");
  });

  it("lists 併用禁忌 before 重複投薬 and checks a drug given twice only once", () => {
    const others = [...otherRxOf("opd-1"), { ...otherRxOf("90010198")[2] }];
    const f = erxChecks(["ORAL-SPL25", "ORAL-SPL25"], others, today);
    expect(f.map((x) => x.kind)).toEqual(["併用禁忌", "重複投薬"]);
  });
});
