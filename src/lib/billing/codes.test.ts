import { describe, expect, it } from "vitest";
import { DRUGS, LAB_TESTS, ORAL_DRUGS } from "../master";
import { loadMaster } from "../masters/server";
import { CODES, DRUG_CODES, LAB_CODES } from "./codes";

const ACTIVE = "99999999";
const s = loadMaster("s");
const y = loadMaster("y");
const sIdx = (col: number) => s.cols!.indexOf(col);
const yIdx = (col: number) => y.cols!.indexOf(col);
const shinryo = new Map(s.rows.map((r) => [r[sIdx(3)], r]));
const iyaku = new Map(y.rows.map((r) => [r[yIdx(3)], r]));

describe("the fictional hospital's codes exist in the official masters and are in force", () => {
  it("every drug of the hospital master has a 医薬品マスター code", () => {
    for (const d of [...DRUGS, ...ORAL_DRUGS]) expect(DRUG_CODES[d.code], d.code).toBeTruthy();
  });

  for (const [ours, code] of Object.entries(DRUG_CODES)) {
    it(`${ours} → ${code}`, () => {
      const row = iyaku.get(code);
      expect(row, "not in 医薬品マスター").toBeTruthy();
      expect(row![yIdx(31)], "abolished").toBe(ACTIVE);
    });
  }

  it("every lab item of the hospital master has 診療行為 codes (or is billed otherwise)", () => {
    for (const t of LAB_TESTS) expect(LAB_CODES[t.code], t.code).toBeDefined();
  });

  for (const code of [...Object.values(LAB_CODES).flat(), ...Object.values(CODES)]) {
    it(`診療行為 ${code}`, () => {
      const row = shinryo.get(code);
      expect(row, "not in 医科診療行為マスター").toBeTruthy();
      expect(row![sIdx(88)], "abolished").toBe(ACTIVE);
    });
  }
});
