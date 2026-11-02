import { describe, expect, it } from "vitest";
import { HOSPITAL, meetsStandards } from "./facility";
import { bukkaFor, iyakuItem, shinryoItem } from "./master-items";

const meets = (code: string) => meetsStandards(shinryoItem(code)!.shisetsu);

describe("master items", () => {
  it("reads 急性期一般入院料４ from the master", () => {
    expect(shinryoItem(HOSPITAL.wardBase)).toMatchObject({ name: "急性期一般入院料４", points: 1597, inOut: "1", sumInpatient: "903", chuCode: "9017", kubun: "A100" });
  });

  it("links the 入院料 to its 物価対応料 group", () => {
    expect(bukkaFor(HOSPITAL.wardBase).map((b) => b.code)).toEqual(["180820810", "180820910"]);
  });

  it("reads drug prices", () => {
    expect(iyakuItem("620005694")).toMatchObject({ price: 681, form: "4" });
  });
});

describe("facility standards (施設基準①〜⑩)", () => {
  it("the ward's 入院料 is filed", () => expect(meets("190199910")).toBe(true));
  it("入院期間加算 via the 名寄せ 8020 一般病棟入院基本料", () => expect(meets("190079470")).toBe(true));
  it("filed 加算 are billable", () => {
    for (const code of ["190145710", "190120510", "190147310", "190832110", "190192110", "190207010", "180737910", "180712910"]) {
      expect(meets(code), code).toBe(true);
    }
  });
  it("加算 the hospital has not filed are not", () => {
    expect(meets("190147210")).toBe(false); // 感染対策向上加算１
    expect(meets("190891310")).toBe(false); // 病棟薬剤業務実施加算１
    expect(meets("190117710")).toBe(false); // 急性期一般入院料１
  });
  it("codes with no 施設基準 need none", () => expect(meets("160008010")).toBe(true));
});
