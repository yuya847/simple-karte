// 右端ツールのお気に入り: pins (tools and templates) kept per person in this browser.
import { afterEach, describe, expect, it, vi } from "vitest";
import { isTemplatePin, loadRail, pinOfTemplate, saveRail, templateIdOf, togglePin } from "./rail";

function fakeStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });
  return store;
}
afterEach(() => vi.unstubAllGlobals());

describe("お気に入りの道具", () => {
  it("a template's pin carries its id; a tool's pin is its key", () => {
    expect(pinOfTemplate("rec-fall")).toBe("template:rec-fall");
    expect(isTemplatePin("template:rec-fall")).toBe(true);
    expect(isTemplatePin("results")).toBe(false);
    expect(templateIdOf("template:rec-fall")).toBe("rec-fall");
    expect(templateIdOf("results")).toBeNull();
  });

  it("★ adds a pin, ★ again removes it, in the order pinned", () => {
    let pins = togglePin([], "results");
    pins = togglePin(pins, pinOfTemplate("rec-fall"));
    expect(pins).toEqual(["results", "template:rec-fall"]);
    expect(togglePin(pins, "results")).toEqual(["template:rec-fall"]);
  });

  it("is kept per person in this browser, and a broken entry falls back to the plain rail", () => {
    const store = fakeStorage();
    saveRail("山本", { mode: "list", pins: ["results", "template:rec-fall"] });
    expect(loadRail("山本")).toEqual({ mode: "list", pins: ["results", "template:rec-fall"] });
    expect(loadRail("佐藤")).toEqual({ mode: "icons", pins: [] });
    store.set("simple-karte:tool-rail:田中", "{bad");
    expect(loadRail("田中")).toEqual({ mode: "icons", pins: [] });
    store.set("simple-karte:tool-rail:鈴木", JSON.stringify({ pins: ["results", 3, null] }));
    expect(loadRail("鈴木").pins).toEqual(["results"]);
  });
});
