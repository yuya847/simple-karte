import { afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, effects: [] as (() => void)[], context: null as unknown }));
vi.mock("react", () => ({
  createContext: () => ({}), useContext: () => h.context,
  useState: (initial: unknown) => { const i = h.cursor++; if (!(i in h.slots)) h.slots[i] = typeof initial === "function" ? initial() : initial; return [h.slots[i], (next: unknown) => { h.slots[i] = typeof next === "function" ? next(h.slots[i]) : next; }]; },
  useEffect: (fn: () => void) => h.effects.push(fn),
}));
import { entryKey, useWindowEntry, type WindowEntries } from "./window-entry";
afterEach(() => { h.slots = []; h.effects = []; h.context = null; });
it("同じフォームのまま患者・職種を切り替えても注射の入れかけを移さず、戻ると復元する", () => {
  let entries: WindowEntries = {};
  const Harness = (scope: string) => {
    h.context = { scope, entries, setEntries: (f: (all: WindowEntries) => WindowEntries) => { entries = f(entries); } };
    h.cursor = 0;
    const result = useWindowEntry("injection.入れかけ", () => ["空"]);
    h.effects.splice(0).forEach(f => f());
    return result;
  };
  Harness("A:医師")[1](["Aの点滴"]); Harness("A:医師");
  expect(Harness("B:医師")[0]).toEqual(["空"]);
  expect(entries[entryKey("B:医師", "injection.入れかけ")]).toEqual(["空"]);
  Harness("B:医師")[1](["Bの点滴"]); Harness("B:医師");
  expect(Harness("A:医師")[0]).toEqual(["Aの点滴"]);
  expect(Harness("A:看護師")[0]).toEqual(["空"]);
  expect(Harness("B:医師")[0]).toEqual(["Bの点滴"]);
});
it("消した入力を次の描画で再保存しない", () => {
  let entries: WindowEntries = {};
  const Harness = () => {
    h.context = { scope: "A:医師", entries, setEntries: (f: (all: WindowEntries) => WindowEntries) => { entries = f(entries); } };
    h.cursor = 0; const result = useWindowEntry("inj", "empty"); h.effects.splice(0).forEach(f => f()); return result;
  };
  Harness()[2](); Harness(); expect(entries).toEqual({});
});
it("workspaceの遅い取り込みを同じ患者のフォームへ戻し、ほかの患者の入力は使わない", () => {
  let entries: WindowEntries = {};
  const Harness = () => {
    h.context = { scope: "A:医師", entries, setEntries: (f: (all: WindowEntries) => WindowEntries) => { entries = f(entries); } };
    h.cursor = 0; const result = useWindowEntry("inj", "空"); h.effects.splice(0).forEach(f => f()); return result;
  };
  Harness();
  entries = { [entryKey("A:医師", "inj")]: "保存済みのA", [entryKey("B:医師", "inj")]: "B" };
  expect(Harness()[0]).toBe("保存済みのA");
  Harness()[1]("直したA"); expect(Harness()[0]).toBe("直したA");
  expect(entries[entryKey("B:医師", "inj")]).toBe("B");
});
