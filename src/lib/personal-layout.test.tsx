import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_LAYOUT, moveFlowRow, orderedRows, parseLayout } from "./flow-layout";
import { parseFlowPrefs } from "./flow-prefs";
import { FlowOrderedRows, FlowRow } from "../components/FlowOrderedRows";
import { StandingLineMenu } from "../components/StandingLineMenu";
import { STANDING_MENU, standingMenuEnabled } from "./standing-menu";
import { calendarRows, type StandingLine } from "./standing-lines";
it("経過表の項目順と非表示を保存形式から読み戻して描画する", () => {
  const keys = ["vitals.bt", "vitals.hr", "vitals.rr"];
  const layout = { ...moveFlowRow(DEFAULT_LAYOUT, keys, "vitals.rr", -1), hidden: ["vitals.bt"] };
  const restored = parseFlowPrefs(JSON.stringify({ layout })).layout;
  expect(orderedRows(keys.map(key => ({ key })), restored).map(r => r.key)).toEqual([keys[0], keys[2], keys[1]]);
  expect(restored.hidden).toEqual([keys[0]]);
  const html = renderToStaticMarkup(<FlowOrderedRows layout={restored}><FlowRow id={keys[0]}>体温</FlowRow><FlowRow id={keys[1]}>脈拍</FlowRow><FlowRow id={keys[2]}>呼吸</FlowRow></FlowOrderedRows>);
  expect(html.indexOf("呼吸")).toBeLessThan(html.indexOf("脈拍"));
  expect(parseLayout({ rowOrder: [1, keys[0], keys[0]] }).rowOrder).toEqual([keys[0]]);
});
const line: StandingLine = { id: "a", cat: "観察", text: "観察指示", by: "医師", start: { day: 0 }, at: { day: 0, time: "10:00" } };
it("指示メニューは変更・終了・追加・コピーを持ち、履歴と権限を区別する", () => {
  expect(STANDING_MENU).toEqual(["指示を変更", "終了", "この指示の下に追加", "新しい指示を追加", "テキストとしてコピー"]);
  expect(standingMenuEnabled(line, false)).toEqual([false, false, false, false, true]);
  expect(standingMenuEnabled({ ...line, changed: { day: 0, time: "11:00", by: "医師", toId: "b" } }, true)).toEqual([false, false, true, true, true]);
  expect(calendarRows([line, { ...line, id: "b" }, { ...line, id: "c", insertAfter: "a" }])[0].lines.map(l => l.id)).toEqual(["a", "c", "b"]);
});

it("右クリックメニューは5項目を描画し、閲覧者にはコピーだけを有効にする", () => {
  const html = renderToStaticMarkup(<StandingLineMenu line={line} canOrder={false} canAdd={false} onAction={() => {}} />);
  expect(html).toContain('role="menu"');
  expect(html.match(/role="menuitem"/g)).toHaveLength(5);
  expect(html.match(/disabled=""/g)).toHaveLength(4);
  STANDING_MENU.forEach(label => expect(html).toContain(label));
});
