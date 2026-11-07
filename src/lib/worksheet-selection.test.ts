import { afterEach, expect, it, vi } from "vitest";
vi.mock("react", () => ({ useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get() }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it("看護師ごとの日付・勤務帯をカルテ往復と再読み込み後にも保つ", async () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) } });
  const fallback = { day: -1 as const, shift: "night" as const };
  let { useWorksheetSelection } = await import("./use-worksheet-selection");
  useWorksheetSelection("看護師:佐藤", fallback)[1]({ day: 0, shift: "day" });
  expect(useWorksheetSelection("看護師:佐藤", fallback)[0]).toEqual({ day: 0, shift: "day" });
  expect(useWorksheetSelection("看護師:田中", fallback)[0]).toEqual(fallback);
  vi.resetModules();
  ({ useWorksheetSelection } = await import("./use-worksheet-selection"));
  expect(useWorksheetSelection("看護師:佐藤", fallback)[0]).toEqual({ day: 0, shift: "day" });
  storage.set("karte:worksheet:壊れた値", '{"day":4,"shift":"invalid"}');
  expect(useWorksheetSelection("壊れた値", fallback)[0]).toEqual(fallback);
});
