import { describe, expect, it } from "vitest";
import { INITIAL_NOTICES, INITIAL_READS } from "./board";
import { EMPTY_QUERY, diNotices, diProblems, formulary, formularyCsv, isDi, kiseiText, readers, searchFormulary } from "./formulary";
import { DRUGS, ORAL_DRUGS } from "./master";

const items = formulary();

describe("院内医薬品集", () => {
  it("has every master drug once, each with a PMDA link", () => {
    expect(items.length).toBe(DRUGS.filter(d => !d.fictional).length + ORAL_DRUGS.length);
    expect(new Set(items.map((x) => x.code)).size).toBe(items.length);
    expect(items.every((x) => x.url.startsWith("https://www.pmda.go.jp/PmdaSearch/iyakuDetail/"))).toBe(true);
  });
  it("finds a drug by its brand name, generic name or kana", () => {
    const codes = (q: string) => searchFormulary(items, { ...EMPTY_QUERY, q }).map((x) => x.code);
    expect(codes("ノルバスク")).toEqual(["ORAL-AMLO5"]);
    expect(codes("アムロジピンベシル酸塩")).toEqual(["ORAL-AMLO5"]);
    expect(codes("おきしこんちん")).toEqual(["ORAL-OXC5"]);
  });
  it("filters by 規制区分 and route", () => {
    const f = (kisei: typeof EMPTY_QUERY.kisei, route: typeof EMPTY_QUERY.route = "") => searchFormulary(items, { ...EMPTY_QUERY, kisei, route }).map((x) => x.code).sort();
    expect(f("麻薬")).toEqual(["INJ-MOR10", "ORAL-OXC5"]);
    expect(f("毒薬")).toEqual(["INJ-CBDCA", "INJ-PTX"]);
    expect(f("劇薬", "内服")).toEqual(["ORAL-AMLO5", "ORAL-APAP500", "ORAL-CELE100", "ORAL-DEXT15", "ORAL-DNP5", "ORAL-MET250", "ORAL-OXC5", "ORAL-TRAM25", "ORAL-TRAZ25"]);
    expect(f("処方箋医薬品以外")).toContain("ORAL-LOX60");
    expect(f("ハイリスク")).toEqual(["INJ-CBDCA", "INJ-ETP", "INJ-KCL20", "INJ-PTX", "ORAL-API25", "ORAL-EDO30", "ORAL-MET250", "ORAL-SITA50", "ORAL-TRAZ25", "ORAL-WAR1"]);
  });
  it("薬効順 follows the 日本標準商品分類番号", () => {
    const b = searchFormulary(items, { ...EMPTY_QUERY, sort: "薬効" }).map((x) => x.cls.bunrui);
    expect(b).toEqual([...b].sort());
  });
  it("採用区分 (架空の病院): 抗がん薬はレジメン限定、麻薬は麻薬", () => {
    expect(items.find((x) => x.code === "INJ-PTX")?.adoption).toBe("採用（レジメン限定）");
    expect(items.find((x) => x.code === "INJ-MOR10")?.adoption).toBe("採用（麻薬）");
    expect(kiseiText(items.find((x) => x.code === "INJ-MOR10")!)).toBe("劇薬・麻薬・処方箋医薬品");
  });
  it("CSV with a header and one line per drug", () => {
    const csv = formularyCsv(items.slice(0, 2));
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(3);
    expect(csv).toContain('"規制区分"');
  });
});

describe("DI のお知らせ", () => {
  it("are the 薬剤部 posts that name drugs", () => {
    const di = diNotices(INITIAL_NOTICES);
    expect(di.map((n) => n.id)).toEqual(["n-di-narcotic"]);
    expect(diNotices(INITIAL_NOTICES, "ORAL-OXC5")).toHaveLength(1);
    expect(diNotices(INITIAL_NOTICES, "ORAL-AMLO5")).toHaveLength(0);
    expect(INITIAL_NOTICES.filter(isDi).every((n) => n.from === "薬剤部")).toBe(true);
  });
  it("counts who has read it", () => {
    const n = diNotices(INITIAL_NOTICES)[0];
    const r = readers(n, INITIAL_READS, ["薬剤師 小林", "看護師 佐藤"]);
    expect(r).toEqual({ read: ["薬剤師 小林"], unread: ["看護師 佐藤"] });
  });
  it("needs a title, a body and the drugs", () => {
    expect(diProblems({ title: "", body: "", drugs: [] })).toEqual(["題名", "本文", "対象の薬"]);
    expect(diProblems({ title: "a", body: "b", drugs: ["ORAL-AMLO5"] })).toEqual([]);
  });
});
