import { describe, expect, it } from "vitest";
import { INITIAL_DIAGNOSES } from "../diagnoses";
import { findDisease, searchDiseases, searchModifiers } from "./byomei";

describe("傷病名マスター search", () => {
  it("finds by hiragana reading", () => {
    expect(searchDiseases("かたいほうそうえん")[0]).toMatchObject({ code: "8831322", name: "下腿蜂巣炎", icd10: "L031" });
  });

  it("folds half-width letters into the master's full-width ones", () => {
    expect(searchDiseases("MRSA菌血症")[0]).toMatchObject({ code: "8851038", name: "ＭＲＳＡ菌血症" });
  });

  it("puts an exact name first", () => {
    expect(searchDiseases("誤嚥性肺炎")[0].code).toBe("5070003");
  });

  it("finds suffix and prefix modifiers", () => {
    expect(searchModifiers("疑い").find((m) => m.code === "8002")).toMatchObject({ name: "の疑い", position: "suffix" });
    expect(searchModifiers("右").find((m) => m.code === "2056")).toMatchObject({ position: "prefix" });
  });
});

describe("fictional diagnoses use the master unchanged", () => {
  for (const [patient, list] of Object.entries(INITIAL_DIAGNOSES)) {
    for (const d of list) {
      it(`${patient} ${d.name}`, () => {
        const m = findDisease(d.code);
        expect(m?.name).toBe(d.name);
        expect(m?.icd10).toBe(d.icd10);
      });
    }
  }
});
