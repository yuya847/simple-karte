import { describe, expect, it } from "vitest";
import { minimizeWindow, windowTray, trayTransform } from "./window-tray";
describe("ウインドウの札", () => {
  it("開いた順を保ち、閉じた札と重複を除いて、前面順を反映する", () => {
    expect(windowTray(["results", "diet", "results"], ["results", "closed"], ["diet", "results"])).toEqual([
      { key: "results", minimized: true, z: 51 }, { key: "diet", minimized: false, z: 50 },
    ]);
    expect(windowTray([], ["results"], ["results"])).toEqual([]);
  });
  it("最小化と復帰を繰り返しても重複せず、ほかの札を保つ", () => {
    const hidden = minimizeWindow(["diet"], "results", true);
    expect(minimizeWindow(hidden, "results", true)).toEqual(["diet", "results"]);
    expect(minimizeWindow(hidden, "results", false)).toEqual(["diet"]);
  });
});

it("患者の札の中心へ縮め、しまった札が一つ増える", () => {
  expect(trayTransform({ x: 100, y: 100, width: 800, height: 600 }, { x: 20, y: 40, width: 100, height: 30 })).toBe("translate(-430px, -345px) scale(0.125, 0.05)");
  const items = windowTray(["results", "diet"], minimizeWindow([], "results", true), []);
  expect(items.filter(i => i.minimized).map(i => i.key)).toEqual(["results"]);
});
