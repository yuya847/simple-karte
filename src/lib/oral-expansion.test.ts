import { expect, it } from "vitest";
import { ORAL_DRUGS } from "./master";
import { EMPTY_QUERY, formulary, searchFormulary } from "./formulary";
import { marksOf } from "./drug-class";
const brands = ["さわしりん", "おーぐめんちん", "くらびっと", "ふろもっくす", "じすろまっく", "ばくた", "せれこっくす", "とらまーる", "ねきしうむ", "がすたー", "ぶろぷれす", "じゃぬびあ", "りぴとーる", "まいすりー", "べるそむら", "れすりん", "らきそべろん", "むこだいん", "めじこん", "わーふぁりん", "えりきゅーす", "りくしあな", "ぷれどにん", "めちこばーる", "ふぉりあみん"];
it.each(brands)("追加内服はひらがなで検索できる：%s", q => {
  const matches = searchFormulary(formulary(), { ...EMPTY_QUERY, q, route: "内服" });
  expect(matches.length).toBeGreaterThanOrEqual(1);
  expect(matches.some(m => m.url.includes("pmda.go.jp"))).toBe(true);
});
it("内服マスターのコード・一般名と規格は重ならず、劇薬表示を区別する", () => {
  expect(new Set(ORAL_DRUGS.map(d => d.code)).size).toBe(ORAL_DRUGS.length);
  expect(new Set(ORAL_DRUGS.map(d => `${d.name}:${d.strength}`)).size).toBe(ORAL_DRUGS.length);
  expect(marksOf("ORAL-TRAM25").map(m => m.key)).toContain("劇");
  expect(marksOf("ORAL-DEXT15").map(m => m.key)).toContain("劇");
  expect(marksOf("ORAL-ZOL5").map(m => m.key)).toContain("向");
  expect(marksOf("ORAL-AMPC250")).toEqual([]);
});
