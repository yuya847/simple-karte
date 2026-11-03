import { describe, expect, it } from "vitest";
import { PATIENTS } from "../patients";
import { checkDigit, INSURANCE } from "./insurance";
import {
  ageBand,
  checkDigitWork,
  checkInsurance,
  currentInsurance,
  DEMO_FORMS,
  derived,
  EMPTY_FORM,
  expectedRate,
  hasErrors,
  INITIAL_INSURANCE_BOOK,
  mealClassOf,
  toInsurance,
  windowLimit,
  withRecord,
  type InsuranceForm,
} from "./registration";

const on = { y: 2026, m: 11, d: 4 };
const ageOf = (id: string) => PATIENTS.find((p) => p.id === id)!.age;
const level = (cs: ReturnType<typeof checkInsurance>, l: "error" | "warn" | "info") => cs.filter((c) => c.level === l);

// A fictional new patient's card (64歳・協会けんぽ・本人). The numbers are made up.
const card: InsuranceForm = {
  ...EMPTY_FORM,
  kind: "協会けんぽ",
  insurerNumber: "0114099" + checkDigit("0114099"),
  symbol: "９９９９",
  number: "12",
  branch: "00",
  relation: "本人",
  birthDate: "1962-06-01",
  rate: "30",
  incomeClass: "ウ",
  proof: "なし",
};

describe("保険者番号の検証番号（保険者番号等の設定要領 第1の5）", () => {
  it("gives the notice's own examples", () => {
    expect(checkDigit("0613048")).toBe("8"); // 06 13 048 → 22 → 10−2 = 8
    expect(checkDigit("341071236")).toBe("2"); // 医療機関コードの例 → 28 → 10−8 = 2
  });
  it("shows the working out", () => {
    expect(checkDigitWork("0613048")).toBe("0×2 + 6×1 + 1×2 + 3×1 + 0×2 + 4×1 + 8×2=16→7 = 22 → 10 − 2 = 8");
  });
});

describe("年齢の区切り（年齢は誕生日の前日に達する）", () => {
  it("70〜74歳 starts the month after the month 70 is reached", () => {
    expect(ageBand("1956-11-01", { y: 2026, m: 11, d: 4 })).toBe("70〜74歳"); // 70 reached 10/31 → from November
    expect(ageBand("1956-11-15", { y: 2026, m: 11, d: 20 })).toBe("70歳未満"); // 70 reached 11/14 → from December
    expect(ageBand("1956-11-15", { y: 2026, m: 12, d: 1 })).toBe("70〜74歳");
  });
  it("後期高齢者 from the 75th birthday", () => {
    expect(ageBand("1951-11-04", on)).toBe("75歳以上");
    expect(ageBand("1951-11-05", on)).toBe("70〜74歳");
  });
  it("未就学 lasts until the first 3月31日 after 6 is reached", () => {
    expect(ageBand("2020-04-01", { y: 2026, m: 3, d: 31 })).toBe("未就学");
    expect(ageBand("2020-04-01", { y: 2026, m: 4, d: 1 })).toBe("70歳未満");
    expect(ageBand("2020-04-02", on)).toBe("未就学"); // 6歳でも、4月2日生まれは翌年の3月31日まで
  });
  it("負担割合 by band and 区分", () => {
    expect(expectedRate("70歳未満", "協会けんぽ", "ウ")).toBe(30);
    expect(expectedRate("未就学", "協会けんぽ", "ウ")).toBe(20);
    expect(expectedRate("70〜74歳", "国保", "一般")).toBe(20);
    expect(expectedRate("70〜74歳", "国保", "現役並みⅠ")).toBe(30);
    expect(expectedRate("75歳以上", "後期高齢者", "一般Ⅱ")).toBe(20);
    expect(expectedRate("75歳以上", "後期高齢者", "一般Ⅰ")).toBe(10);
    expect(expectedRate("70歳未満", "協会けんぽ", "一般")).toBeNull();
  });
});

describe("デモの4人の登録", () => {
  it("gives back the insurance the claim used before (INSURANCE)", () => {
    for (const [id, form] of Object.entries(DEMO_FORMS)) expect(toInsurance(form), id).toEqual(INSURANCE[id]);
  });
  it("passes the checks with nothing to look at again", () => {
    for (const [id, form] of Object.entries(DEMO_FORMS)) {
      const cs = checkInsurance(form, { age: ageOf(id), on });
      expect(level(cs, "error"), id).toEqual([]);
      expect(level(cs, "warn"), id).toEqual([]);
    }
  });
  it("are registered on the admission day; a new version replaces the one in force", () => {
    expect(Object.keys(INITIAL_INSURANCE_BOOK).sort()).toEqual(Object.keys(INSURANCE).sort());
    expect(currentInsurance(INITIAL_INSURANCE_BOOK, "90010231")).toEqual(INSURANCE["90010231"]);
    expect(currentInsurance(INITIAL_INSURANCE_BOOK, "90020001")).toBeUndefined();
    const next = withRecord(INITIAL_INSURANCE_BOOK, "90010231", { ...INITIAL_INSURANCE_BOOK["90010231"][0], action: "変更", insurance: { ...INSURANCE["90010231"], rate: 30, incomeClass: "現役並みⅠ" } });
    expect(next["90010231"]).toHaveLength(2);
    expect(currentInsurance(next, "90010231")?.rate).toBe(30);
    expect(INITIAL_INSURANCE_BOOK["90010231"]).toHaveLength(1);
  });
});

describe("登録の確かめ", () => {
  const check = (f: Partial<InsuranceForm>, age = 64) => checkInsurance({ ...card, ...f }, { age, on });

  it("asks for every item when nothing is entered", () => {
    expect(level(checkInsurance(EMPTY_FORM, { age: 64, on }), "error").map((c) => c.field)).toEqual(["kind", "insurerNumber", "number", "relation", "birthDate", "rate", "incomeClass", "proof"]);
  });
  it("a correct card has no errors", () => {
    expect(hasErrors(check({}))).toBe(false);
    expect(level(check({}), "warn")).toEqual([]);
  });
  it("a typo in the 保険者番号 is caught by the 検証番号, with the working out", () => {
    const cs = check({ insurerNumber: "01140991" });
    const e = level(cs, "error").find((c) => c.field === "insurerNumber")!;
    expect(e.text).toContain("検証番号");
    expect(e.text).toContain("10 − 5 = 5");
    expect(e.basis).toContain("保発第0331012号");
  });
  it("digits: 8 for 社保・後期, 6 for 国保", () => {
    expect(level(check({ insurerNumber: "140995" }), "error").some((c) => c.text.includes("8桁"))).toBe(true);
    const kokuho = "14099" + checkDigit("14099");
    expect(level(check({ kind: "国保", insurerNumber: kokuho }), "error")).toEqual([]);
  });
  it("法別番号 must go with the kind of insurer", () => {
    const kumiai = "06139990".slice(0, 7);
    const cs = check({ insurerNumber: kumiai + checkDigit(kumiai) });
    expect(level(cs, "error").some((c) => c.text.includes("法別番号 06"))).toBe(true);
    expect(level(check({ kind: "組合健保", insurerNumber: kumiai + checkDigit(kumiai) }), "error")).toEqual([]);
  });
  it("75歳以上 must be 後期高齢者; 後期高齢者 has no 家族", () => {
    expect(level(check({ birthDate: "1950-01-01" }, 76), "error").some((c) => c.field === "kind")).toBe(true);
    const kouki = "3914099" + checkDigit("3914099");
    const cs = check({ kind: "後期高齢者", insurerNumber: kouki, symbol: "", number: "00012345", branch: "", relation: "家族", birthDate: "1950-01-01", rate: "10", incomeClass: "一般Ⅰ" }, 76);
    expect(level(cs, "error").map((c) => c.field)).toEqual(["relation"]);
  });
  it("所得区分 must fit the age, and the 負担割合 is checked against the law", () => {
    expect(level(check({ incomeClass: "一般" }), "error").some((c) => c.field === "incomeClass")).toBe(true);
    const w = level(check({ rate: "20" }), "warn").find((c) => c.field === "rate")!;
    expect(w.text).toContain("3割");
    expect(w.basis).toContain("健康保険法74条");
  });
  it("70〜74歳 needs the 高齢受給者証", () => {
    const f = { kind: "国保" as const, insurerNumber: "14099" + checkDigit("14099"), birthDate: "1954-04-12", rate: "20" as const, incomeClass: "一般" as const };
    expect(level(check(f, 72), "warn").some((c) => c.field === "elderCard")).toBe(true);
    expect(level(check({ ...f, elderCard: true }, 72), "warn")).toEqual([]);
  });
  it("the chart's age is compared with the 生年月日", () => {
    expect(level(check({}, 63), "warn").some((c) => c.field === "birthDate")).toBe(true);
  });
  it("記号・番号 cannot hold a comma (the receipt file is comma separated)", () => {
    expect(level(check({ number: "12,3" }), "error").some((c) => c.field === "number")).toBe(true);
  });
});

describe("登録から決まること", () => {
  it("窓口の限度額: 認定証・マイナ保険証、70歳以上の一般は高齢受給者証で足りる", () => {
    expect(windowLimit(card).known).toBe(false);
    expect(windowLimit({ ...card, proof: "限度額適用認定証" }).known).toBe(true);
    expect(windowLimit({ ...card, kind: "国保", incomeClass: "一般", elderCard: true }).known).toBe(true);
    expect(windowLimit({ ...card, kind: "国保", incomeClass: "現役並みⅡ", elderCard: true }).known).toBe(false);
    expect(windowLimit({ ...card, kind: "後期高齢者", incomeClass: "一般Ⅰ" }).known).toBe(true);
  });
  it("食事の標準負担額は減額認定があるときだけ下がる（90日超は長期）", () => {
    expect(mealClassOf({ ...card, incomeClass: "低所得Ⅱ", proof: "なし" })).toBe("一般");
    expect(mealClassOf({ ...card, incomeClass: "低所得Ⅱ", proof: "限度額適用・標準負担額減額認定証", stayDays: "30" })).toBe("低所得Ⅱ（90日以下）");
    expect(mealClassOf({ ...card, incomeClass: "オ", proof: "マイナ保険証（オンライン資格確認）", stayDays: "120" })).toBe("低所得Ⅱ（90日超）");
    expect(mealClassOf({ ...card, incomeClass: "低所得Ⅰ", proof: "限度額適用・標準負担額減額認定証" })).toBe("低所得Ⅰ");
  });
  it("a new patient's card: 医保単独・本人・入院 (1111), 社会保険診療報酬支払基金", () => {
    const ins = toInsurance(card);
    expect(ins).toMatchObject({ kind: "協会けんぽ", rate: 30, incomeClass: "ウ", limitKnown: false, mealClass: "一般", branch: "00" });
    const d = Object.fromEntries(derived(ins, on).map((x) => [x.label, x.value]));
    expect(d["レセプト種別"]).toMatch(/^1111/);
    expect(d["請求先"]).toBe("社会保険診療報酬支払基金");
    expect(d["特記事項"]).toBe("なし");
  });
});
