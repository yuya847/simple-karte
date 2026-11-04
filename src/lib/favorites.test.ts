import { afterEach, describe, expect, it, vi } from "vitest";
import { isFavorite, loadFavorites, normalizeFavorites, saveFavorites, toggleFavorite } from "./favorites";

function fakeStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  vi.stubGlobal("window", { localStorage: ls });
  return store;
}

afterEach(() => vi.unstubAllGlobals());

describe("お気に入りの患者", () => {
  it("stars a patient (newest first), unstars it, and keeps at most the limit", () => {
    let ids = toggleFavorite([], "a");
    ids = toggleFavorite(ids, "b");
    expect(ids).toEqual(["b", "a"]);
    expect(isFavorite(ids, "a")).toBe(true);
    ids = toggleFavorite(ids, "a");
    expect(ids).toEqual(["b"]);
    expect(isFavorite(ids, "a")).toBe(false);
    expect(toggleFavorite(["b", "a"], "c", 2)).toEqual(["c", "b"]);
  });
  it("is kept per person in this browser", () => {
    const store = fakeStorage();
    saveFavorites("山本", ["p1", "p2"]);
    saveFavorites("佐藤", ["p3"]);
    expect(loadFavorites("山本")).toEqual(["p1", "p2"]);
    expect(loadFavorites("佐藤")).toEqual(["p3"]);
    expect(loadFavorites("田中")).toEqual([]);
    expect([...store.keys()].sort()).toEqual(["simple-karte:favorites:佐藤", "simple-karte:favorites:山本"]);
  });
  it("reads nothing from broken data, and drops what is not an id", () => {
    fakeStorage({ "simple-karte:favorites:山本": "[oops", "simple-karte:favorites:佐藤": JSON.stringify(["p1", 2, "", "p1", null]) });
    expect(loadFavorites("山本")).toEqual([]);
    expect(loadFavorites("佐藤")).toEqual(["p1"]);
    expect(normalizeFavorites({ a: 1 })).toEqual([]);
  });
  it("does not throw when storage is blocked", () => {
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
    expect(loadFavorites("山本")).toEqual([]);
    expect(() => saveFavorites("山本", ["p1"])).not.toThrow();
  });
});
