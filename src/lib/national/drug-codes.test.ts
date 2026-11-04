import { describe, expect, it } from "vitest";
import { loadMaster } from "../masters/server";
import { ORAL_DRUGS } from "../master";
import { ALL_DRUG_CODES, billingReceiptCode, DRUG_MASTER_SOURCE, ORAL_DRUG_CODES } from "./drug-codes";

// Columns of y.json (build.mjs keeps these columns of the CSV, in this order).
const COL = { receipt: 0, name: 1, unit: 3, yakka: 14, genericCode: 16, genericName: 17 };

describe("drug codes for the national services", () => {
  const y = loadMaster("y");
  const byReceipt = new Map(y.rows.map((r) => [r[COL.receipt], r]));

  it("covers every oral drug of the master, with the receipt code the billing uses", () => {
    for (const d of ORAL_DRUGS) {
      expect(ORAL_DRUG_CODES[d.code], d.code).toBeDefined();
      expect(ORAL_DRUG_CODES[d.code].receipt).toBe(billingReceiptCode(d.code));
    }
  });

  it("matches the downloaded 医薬品マスター row by row", () => {
    expect(y.file).toBe(DRUG_MASTER_SOURCE.file);
    for (const c of ALL_DRUG_CODES) {
      const row = byReceipt.get(c.receipt);
      expect(row, c.receipt).toBeDefined();
      expect(row![COL.name]).toBe(c.name);
      expect(row![COL.unit]).toBe(c.unit);
      expect(row![COL.yakka]).toBe(c.yakka);
      expect(row![COL.genericCode] || undefined).toBe(c.generic?.code);
      expect(row![COL.genericName] || undefined).toBe(c.generic?.name);
    }
  });
});
