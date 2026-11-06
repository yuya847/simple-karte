// The row of open charts renders (on the server) with its groups by place.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Row, type TabGroup, type TabItem } from "./AppFrame";

const tab = (key: string, label: string, room?: string): TabItem => ({ key, label, patient: { sex: "女", age: 80, room }, active: false, onSelect: () => {} });
const newTab: TabItem = { key: "new", label: "新しいタブ", menu: true, active: false, onSelect: () => {} };

describe("開いているカルテの段：場所ごとのグループ", () => {
  it("several groups: each has a heading (a button to its list) and the later ones a vertical rule", () => {
    const groups: TabGroup[] = [
      { key: "ward", label: "病棟", onSelect: () => {}, items: [tab("p1", "大浦 トメ", "515"), tab("p2", "佐倉 太郎", "503")] },
      { key: "er", label: "救急外来", onSelect: () => {}, items: [tab("er:e1", "救急 花子")] },
      { key: "opd", label: "外来", items: [tab("opd:o1", "外来 一郎")] },
    ];
    const html = renderToStaticMarkup(<Row row={{ label: "開いているカルテ", items: [newTab], groups }} small />);
    expect(html).toMatch(/<button type="button" title="病棟の一覧へ"[^>]*>病棟<\/button>/);
    expect(html).toMatch(/<button type="button" title="救急外来の一覧へ"[^>]*>救急外来<\/button>/);
    // No onSelect: the heading is plain text.
    expect(html).toMatch(/<span class="[^"]*">外来<\/span>/);
    expect(html.match(/role="group"/g)?.length).toBe(3);
    expect(html.match(/border-l border-rule/g)?.length).toBe(2);
    // Order: 病棟 → 救急外来 → 外来, then 新しいタブ at the end.
    expect(html.indexOf("大浦 トメ")).toBeLessThan(html.indexOf("救急 花子"));
    expect(html.indexOf("救急 花子")).toBeLessThan(html.indexOf("外来 一郎"));
    expect(html.indexOf("外来 一郎")).toBeLessThan(html.indexOf("新しいタブ"));
    expect(html.match(/role="tab"/g)?.length).toBe(5);
  });

  it("one group alone: its tabs without a heading", () => {
    const groups: TabGroup[] = [{ key: "ward", label: "病棟", onSelect: () => {}, items: [tab("p1", "大浦 トメ", "515")] }];
    const html = renderToStaticMarkup(<Row row={{ label: "開いているカルテ", items: [], groups }} small />);
    expect(html).not.toContain("病棟の一覧へ");
    expect(html).not.toMatch(/>病棟</);
    expect(html).toContain("大浦 トメ");
    expect(html).not.toContain("border-l border-rule");
  });

  it("no groups: the items as they are (the row of screens)", () => {
    const html = renderToStaticMarkup(<Row row={{ label: "病棟の画面", items: [{ key: "all", label: "入院患者一覧", active: true, onSelect: () => {} }] }} small={false} />);
    expect(html).toContain("入院患者一覧");
    expect(html).not.toContain('role="group"');
  });
});

 it("最小化タブの挿入先は選択中の患者タブのすぐ後ろに置く", () => {
  const html = renderToStaticMarkup(<Row row={{ label: "開いているカルテ", items: [{ ...tab("p1", "患者1"), active: true }, tab("p2", "患者2")] }} small />);
  expect(html.indexOf("患者1")).toBeLessThan(html.indexOf('id="patient-window-tabs"'));
  expect(html.indexOf('id="patient-window-tabs"')).toBeLessThan(html.indexOf("患者2"));
  expect(html.match(/id="patient-window-tabs"/g)).toHaveLength(1);
});
