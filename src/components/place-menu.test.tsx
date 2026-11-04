// The ways back to the ward's menu render (on the server): the ＋ of the screens row says it opens the menu in a new
// tab, and a patient view's tab has the ⌄ whose list ends with 画面を選ぶ（メニュー）… (the list itself opens on a press).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WARD_MENU_OPTION, WARD_SCREENS_PLUS } from "@/lib/place-menu";
import { Row, type TabItem } from "./AppFrame";

describe("病棟の画面の段", () => {
  it("＋: 画面を選ぶ（メニューを新しいタブで）", () => {
    const html = renderToStaticMarkup(<Row row={{ label: "病棟の画面", items: [{ key: "mine", label: "受け持ち患者", active: true, onSelect: () => {} }], plus: { ...WARD_SCREENS_PLUS, onClick: () => {} } }} small={false} />);
    expect(html).toContain('aria-label="画面を選ぶ" title="画面を選ぶ（メニューを新しいタブで）"');
    expect(html).not.toContain("画面を開く");
  });
  it("the ⌄ of 受け持ち患者 is there, and its list ends with the menu", () => {
    const options = [{ key: "mine", label: "受け持ち患者" }, { key: "all", label: "入院患者一覧" }, WARD_MENU_OPTION];
    const t: TabItem = { key: "mine", label: "受け持ち患者", active: true, onSelect: () => {}, switcher: { options, onPick: () => {} } };
    const html = renderToStaticMarkup(<Row row={{ label: "病棟の画面", items: [t] }} small={false} />);
    expect(html).toContain('aria-label="受け持ち患者をほかの見せ方に切り替える"');
    expect(options.at(-1)).toEqual(WARD_MENU_OPTION);
  });
});
