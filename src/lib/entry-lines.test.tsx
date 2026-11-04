import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { injectionEntryLines, injEntryStep } from "./inj-entry";
import { rxEntryLines, rxEntryStep } from "./rx-entry";
import { injectionDrugLabel } from "./injection-drug-label";
import { findDrug } from "./master";
import { kanaMatch } from "./kana";
import { DecidedEntryLines } from "@/components/LineEntry";

const values = { route: "点滴静注", schedule: "1日2回", times: ["10:00", "22:00"], duration: "30分", start: "11/5 10:00から", days: "3日間" };
describe("罫線へ確定内容を積む", () => {
  it("未確定の初期値を出さず、段ごとに一行増える", () => {
    expect(injectionEntryLines("dose", values, true)).toEqual([]);
    expect(injectionEntryLines("times", values, true).map((l) => l.text)).toEqual(["点滴静注", "1日2回"]);
    expect(injectionEntryLines("days", values, true).map((l) => l.text)).toEqual(["点滴静注", "1日2回", "10:00・22:00", "30分", "11/5 10:00から"]);
    expect(injectionEntryLines("done", values, false).map((l) => l.text)).not.toContain("30分");
  });
  it("戻した段以降を隠し、上矢印でも前へ戻る", () => {
    expect(injectionEntryLines("route", values, true)).toEqual([]);
    expect(injEntryStep("start", "ArrowUp", true)).toBe("duration");
    expect(injEntryStep("start", "ArrowUp", false)).toBe("times");
    expect(rxEntryStep("usage", "ArrowUp")).toBe("times");
    expect(rxEntryLines("days", { times: "1日3回", usage: "毎食後", days: "7日分" })).toEqual([{ step: "times", text: "1日3回" }, { step: "usage", text: "毎食後" }]);
  });
  it("積んだ行は再編集できるボタンになる", () => {
    const html = renderToStaticMarkup(<DecidedEntryLines lines={injectionEntryLines("duration", values, true)} onEdit={() => {}} />);
    expect(html).toContain('data-decided-step="route"');
    expect(html).toContain('>10:00・22:00</button>');
    expect(html).not.toContain("30分");
  });
});
describe("注射薬の商品名と補足", () => {
  it("分類は商品名から分離し、かなでも検索できる", () => {
    const drug = findDrug("INJ-SOL3A500")!;
    expect(injectionDrugLabel(drug).name).toBe("ソルデム3A輸液 500mL");
    expect(injectionDrugLabel(drug).supplement).toContain("維持液");
    const terms = [drug.name, drug.generic!, drug.category!, ...drug.aliases];
    for (const query of ["ソルデム", "そるでむ", "ブドウ糖", "維持液", "いじえき"]) expect(terms.some((term) => kanaMatch(term, query))).toBe(true);
    expect(injectionDrugLabel({ name: "商品名", package: "1V" })).toEqual({ name: "商品名", supplement: "1V" });
  });
});
