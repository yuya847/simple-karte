import { describe, expect, it } from "vitest";
import { residentBlock } from "./cosign";
import { NARCOTICS } from "./drug-class";
import { licenceOf, narcoticBlock, narcoticOrders, rxComplete, rxItems, usageText } from "./narcotics";
import { STAFF } from "./roles";
import type { InjectionOrder, OrderEntry, PrescriptionOrder } from "./types";

const TODAY = { y: 2026, m: 11, d: 4 };
const morphine: InjectionOrder = { type: "injection", items: [{ drugCode: "INJ-MOR10", amount: 5, unit: "mg" }], route: "皮下注", schedule: { kind: "once" }, start: { day: 0, time: "10:00" } };
const oxy: PrescriptionOrder = { type: "prescription", category: "定期", drugCode: "ORAL-OXC5", amount: 1, unit: "錠", timings: ["朝", "夕"], start: { day: 0, timing: "夕" }, days: 7 };
const cez: InjectionOrder = { type: "injection", items: [{ drugCode: "INJ-CEZ1", amount: 1, unit: "g" }], route: "点滴静注", schedule: { kind: "per_day", count: 2 }, start: { day: 0 } };

describe("麻薬はマスターの電子添文の区分から", () => {
  it("the morphine injection and oxycodone tablet are 麻薬", () => {
    expect([...NARCOTICS].sort()).toEqual(["INJ-MOR10", "ORAL-OXC5"]);
  });
  it("a 研修医 cannot confirm them (架空の病院の取り決め, cosign.ts)", () => {
    expect(residentBlock(morphine)).toBe("麻薬");
    expect(residentBlock(oxy)).toBe("麻薬");
  });
});

describe("麻薬施用者（第27条第1項）", () => {
  it("a doctor with a valid licence may confirm", () => {
    expect(narcoticBlock([morphine, cez], STAFF.医師.name, TODAY)).toBeNull();
  });
  it("a doctor with no licence on record may not", () => {
    const why = narcoticBlock([cez, oxy], "木下（総合診療科 B）", TODAY);
    expect(why).toContain("第27条第1項");
    expect(why).toContain("免許番号が登録されていません");
  });
  it("an expired licence (31 December of the next year, 第5条) does not count", () => {
    expect(licenceOf("指導医 高橋", "麻薬施用者", TODAY).ok).toBe(true);
    const later = licenceOf("指導医 高橋", "麻薬施用者", { y: 2027, m: 1, d: 1 });
    expect(later.ok).toBe(false);
    expect(narcoticBlock([morphine], "指導医 高橋", { y: 2027, m: 1, d: 1 })).toContain("有効期間が過ぎています");
  });
  it("orders without a 麻薬 are not checked", () => {
    expect(narcoticBlock([cez], "木下（総合診療科 B）", TODAY)).toBeNull();
  });
});

describe("麻薬処方箋の記載事項（院内）", () => {
  const entry = (order: OrderEntry["order"], author = STAFF.医師.name): OrderEntry => ({ kind: "order", id: "e", day: 0, time: "09:00", author, status: "有効", order });
  const pt = { name: "佐倉 修", age: 72 };
  it("lists what the law names; address, period and the 麻薬業務所 may be left out", () => {
    const items = rxItems(entry(oxy), pt, TODAY);
    expect(items.find((i) => i.item === "麻薬施用者の免許証の番号")?.value).toContain("第 1-04127 号");
    expect(items.filter((i) => i.state === "omitted").map((i) => i.item)).toEqual(["患者の住所", "処方箋の使用期間", "麻薬業務所の名称・所在地"]);
    expect(items.find((i) => i.item === "記名押印又は署名")?.state).toBe("check");
    expect(rxComplete(items)).toBe(true);
  });
  it("an oral 麻薬 without the number of days is incomplete (投薬日数)", () => {
    const items = rxItems(entry({ ...oxy, days: undefined }), pt, TODAY);
    expect(items.find((i) => i.item.startsWith("用法"))?.state).toBe("missing");
    expect(rxComplete(items)).toBe(false);
  });
  it("a prescriber with no licence leaves the number missing", () => {
    expect(rxComplete(rxItems(entry(morphine, "木下（総合診療科 B）"), pt, TODAY))).toBe(false);
  });
  it("usage in words", () => {
    expect(usageText(oxy).text).toBe("1回1錠 1日2回（朝・夕） 7日分");
    expect(usageText(morphine).text).toBe("5mg 皮下注 1回");
  });
  it("finds the 麻薬 orders", () => {
    expect(narcoticOrders([entry(cez), { ...entry(morphine), id: "m" }]).map((e) => e.id)).toEqual(["m"]);
  });
});
