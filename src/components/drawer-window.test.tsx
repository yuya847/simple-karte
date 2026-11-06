// ウインドウ指定のパネルは常にウインドウ。引き出し指定のものは従来のまま。
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { orderWindows } from "@/lib/order-windows";
import { bigWin } from "./Dockable";
import { Drawer, DrawerDefaults } from "./panels/Drawer";

describe("パネルの別ウインドウ", () => {
  it("the drawer has a 別ウインドウ button and keeps its other buttons", () => {
    const html = renderToStaticMarkup(
      <Drawer title="検体検査" onClose={() => {}} expandable>
        <p>中身</p>
      </Drawer>,
    );
    expect(html).toContain("別ウインドウ");
    expect(html).toContain("横いっぱい");
    expect(html).toContain('aria-label="閉じる"');
    expect(html).toContain("中身");
    expect(html).not.toContain("別ウインドウ）");
  });

  it("a panel listed as windowed always renders a window, and 見るだけ stays", () => {
    const html = renderToStaticMarkup(
      <DrawerDefaults.Provider value={{ panel: "add-lab", windowed: new Set(["add-lab"]) }}>
        <Drawer title="検体検査" onClose={() => {}} locked="医師が出します。">
          <button type="button">項目</button>
        </Drawer>
      </DrawerDefaults.Provider>,
    );
    expect(html).toContain('aria-label="検体検査（別ウインドウ）"');
    expect(html).toContain('aria-label="最小化"');
    expect(html).not.toContain("引き出しに戻す");
    expect(html).toContain("見るだけです。医師が出します。");
    expect(html).toContain("<fieldset disabled");
  });

  it("注射・内服 open as nonmodal windows, using this device's remembered size and place", () => {
    vi.stubGlobal("window", { innerWidth: 1400, innerHeight: 900, localStorage: {
      getItem: () => JSON.stringify({ mode: "drawer", win: { x: 40, y: 70, w: 700, h: 600 } }),
    } });
    try {
      for (const key of orderWindows) {
        const html = renderToStaticMarkup(
          <DrawerDefaults.Provider value={{ panel: "add-lab", windowed: new Set(orderWindows) }}>
            <Drawer title={key} windowKey={key} onClose={() => {}}><input aria-label="薬" /></Drawer>
          </DrawerDefaults.Provider>,
        );
        expect(html).toContain(`data-drawer-window="${key}"`);
        expect(html).toContain("left:40px;top:70px;width:700px;height:600px");
        expect(html).not.toContain('aria-modal="true"');
        expect(html).toContain('aria-label="最小化"');
        expect(html).not.toContain("引き出しに戻す");
        expect(html).not.toContain("inset-0");
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("the first window is about 80% of the screen, centred", () => {
    // No browser here: the fallback screen is 1200×800.
    expect(bigWin()).toEqual({ x: 120, y: 80, w: 960, h: 640 });
  });
});

it("フォームの初回は幅720pxで高さは内容に合わせる", () => {
  vi.stubGlobal("window", { innerWidth: 1400, innerHeight: 900, localStorage: { getItem: () => null } });
  try {
    for (const key of orderWindows) {
      const html = renderToStaticMarkup(<DrawerDefaults.Provider value={{ panel: key, windowed: new Set(orderWindows) }}><Drawer title={key} onClose={() => {}}>入力</Drawer></DrawerDefaults.Provider>);
      expect(html).toContain("left:340px;top:67.5px;width:720px;height:auto;min-height:min(240px, 85vh);max-height:85vh");
    }
  } finally { vi.unstubAllGlobals(); }
});

it("短い参照パネルも240px以上で開く", () => {
  for (const key of ["rehab", "active-orders", "pathology", "physio"]) {
    const html = renderToStaticMarkup(<DrawerDefaults.Provider value={{ panel: key, windowed: new Set([key]) }}><Drawer title={key} onClose={() => {}}>記録なし</Drawer></DrawerDefaults.Provider>);
    expect(html).toContain("min-height:min(240px, 85vh)");
  }
});
it("テンプレートは保存された左端の位置より中央を優先する", () => {
  vi.stubGlobal("window", { innerWidth: 1400, innerHeight: 900, localStorage: { getItem: () => JSON.stringify({ mode: "window", win: { x: 0, y: 0, w: 960, h: 500 } }) } });
  try {
    const html = renderToStaticMarkup(<DrawerDefaults.Provider value={{ panel: "templates", windowed: new Set(["templates"]) }}><Drawer title="テンプレート" wide onClose={() => {}}>一覧</Drawer></DrawerDefaults.Provider>);
    expect(html).toContain("left:220px;top:67.5px;width:960px;height:500px");
  } finally { vi.unstubAllGlobals(); }
});
