// A panel's drawer renders on the server (no browser) with its 別ウインドウ button; which panels open
// as a window first is a table WardApp gives through DrawerDefaults, and the server still draws the
// drawer (there is no window to measure) so the markup never depends on a device.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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

  it("a panel listed as windowed still renders as the drawer on the server, and 見るだけ stays", () => {
    const html = renderToStaticMarkup(
      <DrawerDefaults.Provider value={{ panel: "add-lab", windowed: new Set(["add-lab"]) }}>
        <Drawer title="検体検査" onClose={() => {}} locked="医師が出します。">
          <button type="button">項目</button>
        </Drawer>
      </DrawerDefaults.Provider>,
    );
    expect(html).toContain('aria-label="検体検査"');
    expect(html).not.toContain("引き出しに戻す");
    expect(html).toContain("見るだけです。医師が出します。");
    expect(html).toContain("<fieldset disabled");
  });

  it("the first window is about 80% of the screen, centred", () => {
    // No browser here: the fallback screen is 1200×800.
    expect(bigWin()).toEqual({ x: 120, y: 80, w: 960, h: 640 });
  });
});
