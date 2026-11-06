import { afterEach, expect, it, vi } from "vitest";
import { EXAMPLE_FILTERS, filterProblems, loadFilters, moveFilter, removeFilter, sameFilter, saveFilters } from "./history-filters";

afterEach(() => vi.unstubAllGlobals());
it("空名と重複を止め、名前変更では自分を除く", () => {
  expect(filterProblems(" ", [])).toHaveLength(1);
  expect(filterProblems(" 医師の記事だけ ", EXAMPLE_FILTERS)).toHaveLength(1);
  expect(filterProblems("医師の記事だけ", EXAMPLE_FILTERS, "example-doctor")).toEqual([]);
});
it("配列の順序によらず全条件を比べる", () => {
  const a = { ...EXAMPLE_FILTERS[0], departments: ["内科", "外科"] };
  expect(sameFilter(a, { ...a, departments: ["外科", "内科"] })).toBe(true);
  for (const patch of [{ on: [] }, { templateIds: ["t"] }, { onlyTemplates: true }, { departments: [] }, { roles: ["医師"] }, { q: "熱" }]) {
    expect(sameFilter(a, { ...a, ...patch })).toBe(false);
  }
});
it("人別に保存し、削除した例を復活させず、順序を保つ", () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) } });
  const list = [...EXAMPLE_FILTERS, { ...EXAMPLE_FILTERS[0], id: "n", name: "看護記録だけ", on: ["nurse"] }];
  expect(loadFilters("A")).toEqual(EXAMPLE_FILTERS);
  expect(saveFilters("A", moveFilter(list, "n", -1))).toBe(true);
  expect(loadFilters("A").map((f) => f.id)).toEqual(["n", "example-doctor"]);
  expect(loadFilters("B")).toEqual(EXAMPLE_FILTERS);
  expect(storage.has("simple-karte:history-filters:A")).toBe(true);
  saveFilters("A", removeFilter(removeFilter(list, "n"), "example-doctor"));
  expect(loadFilters("A")).toEqual([]);
  expect(saveFilters("A", [list[0], list[0]])).toBe(false);
  storage.set("simple-karte:history-filters:A", '[{"id":"bad","name":"壊れた条件"}]');
  expect(loadFilters("A")).toEqual([]);
  storage.set("simple-karte:history-filters:A", "{");
  expect(loadFilters("A")).toEqual(EXAMPLE_FILTERS);
});
it("保存不可を返す", () => {
  vi.stubGlobal("window", { localStorage: { setItem: () => { throw Error("blocked"); } } });
  expect(saveFilters("A", EXAMPLE_FILTERS)).toBe(false);
});
it("古い保存は予定日・中止非表示で読み、新条件も比較と保存に含める", () => {
  const old = { ...EXAMPLE_FILTERS[0], orderDay: undefined, showStopped: undefined };
  const storage = new Map([["simple-karte:history-filters:A", JSON.stringify([old])]]);
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) } });
  expect(loadFilters("A")[0]).toMatchObject({ orderDay: "予定日", showStopped: false });
  const changed = { ...EXAMPLE_FILTERS[0], orderDay: "依頼日" as const, showStopped: true };
  expect(sameFilter(old, changed)).toBe(false);
  expect(saveFilters("A", [changed])).toBe(true);
  expect(loadFilters("A")).toEqual([changed]);
});
