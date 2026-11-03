import { describe, expect, it } from "vitest";
import { kanaMatch, searchKey, toKatakana } from "./kana";
import { DRUGS, ORAL_DRUGS } from "./master";

describe("kana search", () => {
  it("reads hiragana as katakana, and ignores width and case", () => {
    expect(toKatakana("かろなーる")).toBe("カロナール");
    expect(searchKey("ｶﾛﾅｰﾙ")).toBe("カロナール");
    expect(searchKey("Vcm")).toBe("vcm");
  });

  it("finds drugs typed in hiragana", () => {
    const find = (list: { name: string; aliases: string[] }[], q: string, prefix = false) => list.filter((d) => [d.name, ...d.aliases].some((a) => kanaMatch(a, q, prefix))).map((d) => d.name);
    expect(find(ORAL_DRUGS, "かろな")).toEqual(["アセトアミノフェン錠"]);
    expect(find(ORAL_DRUGS, "ろきそ", true)).toEqual(["ロキソプロフェンNa錠"]);
    expect(find(ORAL_DRUGS, "さんかま")).toEqual(["酸化マグネシウム錠"]);
    expect(find(DRUGS, "せふぁぞ")).toEqual(["セファゾリンナトリウム注射用"]);
    expect(find(DRUGS, "せいしょく")).toContain("生理食塩液");
    expect(find(DRUGS, "えんかかり")).toEqual(["KCL注20mEqキット"]);
  });
});
