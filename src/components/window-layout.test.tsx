import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { DayInput } from "./DayInput";

it("任意の日付を年をまたいで表示できる", () => {
  const html = renderToStaticMarkup(<DayInput label="出る日付" value={40} today={{ y: 2026, m: 12, d: 1 }} onChange={() => {}} />);
  expect(html).toContain('type="date"');
  expect(html).toContain('value="2027-01-10"');
});
it("退院も記事の下に出し、独立ウインドウを作らない", () => {
  const src = readFileSync("src/components/WardApp.tsx", "utf8");
  expect(src).toMatch(/const DRAWER_PANELS[^\n]*"add-discharge"/);
  expect(src).toContain('openOrder("add-discharge")');
  expect(src).toContain('<InlineOrder title="退院オーダ"');
  expect(src).not.toContain('<Drawer title="退院オーダ"');
});

it("カレンダーで選んだ任意の日を保存用の日数に渡し、空欄では書き換えない", () => {
  const onChange = vi.fn();
  const input = DayInput({ label: "出る日付", value: null, today: { y: 2026, m: 12, d: 1 }, onChange });
  input.props.onChange({ target: { value: "2027-01-10" } });
  expect(onChange).toHaveBeenCalledWith(40);
  input.props.onChange({ target: { value: "" } });
  expect(onChange).toHaveBeenCalledTimes(1);
});
