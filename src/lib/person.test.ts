import { describe, expect, it } from "vitest";
import { ageSex, ageText } from "./person";

describe("age and sex", () => {
  it("writes 72歳男性", () => {
    expect(ageSex({ age: 72, sex: "男" })).toBe("72歳男性");
    expect(ageSex({ age: 86, sex: "女" })).toBe("86歳女性");
  });
  it("adds months up to 3 years old", () => {
    expect(ageSex({ age: 1, sex: "女", ageMonths: 3 })).toBe("1歳3カ月女性");
    expect(ageText(0, 7)).toBe("0歳7カ月");
    expect(ageText(3, 11)).toBe("3歳11カ月");
    expect(ageText(4, 2)).toBe("4歳");
  });
  it("says when it is not known", () => {
    expect(ageSex({ age: null, sex: null })).toBe("年齢不明性別不明");
    expect(ageText(2)).toBe("2歳");
  });
});
