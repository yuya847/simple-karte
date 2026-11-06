import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SavedHistoryFilters } from "./SavedHistoryFilters";
import { EXAMPLE_FILTERS } from "@/lib/history-filters";

it("保存した札の一致状態と端末保存の説明を示す", () => {
  const render = (q: string) => renderToStaticMarkup(<SavedHistoryFilters list={EXAMPLE_FILTERS} current={{ ...EXAMPLE_FILTERS[0], q }} onApply={() => {}} onChange={() => {}} />);
  expect(render("")).toContain('aria-pressed="true"');
  expect(render("熱")).toContain('aria-pressed="false"');
  expect(render("")).toContain("＋いまの条件を保存");
  expect(render("")).toContain("医師の記事だけのメニュー");
  expect(render("")).toContain("この端末のみに保存します");
});
