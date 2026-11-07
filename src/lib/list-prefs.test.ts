import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LIST_PREFS, LIST_COLUMNS, loadListPrefs, normalizeListPrefs, saveListPrefs, showsColumn, toggleColumn } from "./list-prefs";

/** A small localStorage for the test (vitest runs in node). */
function fakeStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  vi.stubGlobal("window", { localStorage: ls });
  return store;
}

afterEach(() => vi.unstubAllGlobals());

describe("入院患者一覧の表示オプション", () => {
  it("shows every column but the latest vitals at normal height by default", () => {
    for (const c of LIST_COLUMNS) expect(showsColumn(DEFAULT_LIST_PREFS, c.key)).toBe(c.key !== "vitals");
    expect(DEFAULT_LIST_PREFS.density).toBe("normal");
  });
  it("turns a column off and on again", () => {
    const off = toggleColumn(DEFAULT_LIST_PREFS, "flags");
    expect(showsColumn(off, "flags")).toBe(false);
    expect(showsColumn(off, "dpc")).toBe(true);
    expect(toggleColumn(off, "flags")).toEqual(DEFAULT_LIST_PREFS);
    expect(showsColumn(toggleColumn(DEFAULT_LIST_PREFS, "vitals"), "vitals")).toBe(true);
  });
  it("saves per person and reads it back", () => {
    const store = fakeStorage();
    saveListPrefs("山本", { hidden: ["vitals", "dpc"], density: "compact" });
    expect(loadListPrefs("山本")).toEqual({ hidden: ["vitals", "dpc"], density: "compact" });
    expect(loadListPrefs("佐藤")).toEqual(DEFAULT_LIST_PREFS);
    expect([...store.keys()]).toEqual(["simple-karte:list-prefs:山本"]);
  });
  it("falls back to the default on broken or unknown data", () => {
    fakeStorage({ "simple-karte:list-prefs:山本": "{not json", "simple-karte:list-prefs:佐藤": JSON.stringify({ hidden: ["vitals", "nope", 3, "vitals"], density: "huge" }) });
    expect(loadListPrefs("山本")).toEqual(DEFAULT_LIST_PREFS);
    expect(loadListPrefs("佐藤")).toEqual({ hidden: ["vitals"], density: "normal" });
    expect(normalizeListPrefs(null)).toEqual(DEFAULT_LIST_PREFS);
    expect(normalizeListPrefs("x")).toEqual(DEFAULT_LIST_PREFS);
  });
  it("returns the default when storage cannot be read", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(loadListPrefs("山本")).toEqual(DEFAULT_LIST_PREFS);
    expect(() => saveListPrefs("山本", DEFAULT_LIST_PREFS)).not.toThrow();
  });
});
