import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TabChoice } from "./TabChoice";
it("選択肢の前に薄い番号を出し、無効な候補も表示順を保つ", () => {
  const html = renderToStaticMarkup(<TabChoice numbered label="回数" options={[{ value: 1, label: "1日1回" }, { value: 2, label: "1日2回", disabled: true }]} value={1} onChange={() => {}} />);
  expect(html).toContain('opacity-50">1</span>1日1回');
  expect(html).toContain('opacity-50">2</span>1日2回');
  expect(html).toContain('disabled=""');
});
