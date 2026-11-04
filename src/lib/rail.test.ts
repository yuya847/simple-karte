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
    expect(loadRail("山本")).toEqual({ group: "intervention", mode: "list", pins: ["results", "template:rec-fall"] });
    expect(loadRail("佐藤")).toEqual({ group: "intervention", mode: "icons", pins: [] });
    store.set("simple-karte:tool-rail:田中", "{bad");
    expect(loadRail("田中")).toEqual({ group: "intervention", mode: "icons", pins: [] });
    store.set("simple-karte:tool-rail:鈴木", JSON.stringify({ pins: ["results", 3, null] }));
    expect(loadRail("鈴木").pins).toEqual(["results"]);
  });
});


it("群は保存せず、古い保存値も介入に戻す（お気に入りは保つ）", () => {
  const store = fakeStorage();
  saveRail("群の保存", { mode: "list", pins: ["results"], group: "examination" });
  expect(loadRail("群の保存")).toEqual({ mode: "list", pins: ["results"], group: "intervention" });
  expect(JSON.parse(store.get("simple-karte:tool-rail:群の保存")!)).toEqual({ mode: "list", pins: ["results"] });
  for (const group of ["order", "nurse", "docs", "ref", "billing", "unknown", null]) {
    store.set("simple-karte:tool-rail:旧群", JSON.stringify({ mode: "list", pins: ["results"], group }));
    expect(loadRail("旧群")).toEqual({ mode: "list", pins: ["results"], group: "intervention" });
  }
});


it("表示を切り替えても道具とテンプレートの保存順を保ち、★で外した分だけ除く", () => {
  fakeStorage();
  const person = "縦列の保存";
  const pins = [pinOfTemplate("rec-fall"), "results", "add-rx"];
  saveRail(person, { group: "reference", mode: "icons", pins });
  saveRail(person, { ...loadRail(person), mode: "list" });
  expect(loadRail(person).pins).toEqual(pins);
  saveRail(person, { ...loadRail(person), pins: togglePin(loadRail(person).pins, "results") });
  expect(loadRail(person)).toEqual({ group: "intervention", mode: "list", pins: ["template:rec-fall", "add-rx"] });
});

it("すべて表示は既定で隠し、この端末の保存を復元する", () => {
  fakeStorage();
  expect(loadRail("栄養士").showAll ?? false).toBe(false);
  saveRail("栄養士", { mode: "icons", pins: [], showAll: true });
  expect(loadRail("栄養士").showAll).toBe(true);
});
