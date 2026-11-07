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
it("部門の同じ画面で患者scopeを指定すると患者ごとの途中入力が復元される", () => {
  let entries: WindowEntries = {};
  const Harness = (patient: string) => {
    h.context = { scope: "department:薬剤師", entries, setEntries: (f: (all: WindowEntries) => WindowEntries) => { entries = f(entries); } };
    h.cursor = 0;
    const result = useWindowEntry("tdm-lv", { peak: "" }, `${patient}:薬剤師`);
    h.effects.splice(0).forEach(f => f());
    return result;
  };
  Harness("A")[1]({ peak: "30" }); Harness("A");
  expect(Harness("B")[0]).toEqual({ peak: "" });
  Harness("B")[1]({ peak: "25" }); Harness("B");
  expect(Harness("A")[0]).toEqual({ peak: "30" });
  expect(Harness("B")[0]).toEqual({ peak: "25" });
});
it("ICTのコメントとOHAT-Jは行を閉じて別患者を開いても患者・職種別に復元する", () => {
  let entries: WindowEntries = {};
  const Harness = (patient: string, role: string) => {
    h.context = { scope: `department:${role}`, entries, setEntries: (f: (all: WindowEntries) => WindowEntries) => { entries = f(entries); } };
    h.cursor = 0;
    const scope = `${patient}:${role}:${role === "ICT" ? "infection" : "oral"}`;
    const text = useWindowEntry("specialist.text", "", scope);
    const scores = useWindowEntry("specialist.scores", () => Array(8).fill(-1), scope);
    h.effects.splice(0).forEach(f => f());
    return { text, scores };
  };
  Harness("A", "ICT").text[1]("確認途中のコメント"); Harness("A", "ICT");
  h.slots = []; expect(Harness("B", "ICT").text[0]).toBe("");
  h.slots = []; expect(Harness("A", "ICT").text[0]).toBe("確認途中のコメント");
  h.slots = []; Harness("A", "歯科衛生士").scores[1]([1, 2, -1, -1, -1, -1, -1, -1]); Harness("A", "歯科衛生士");
  h.slots = []; expect(Harness("B", "歯科衛生士").scores[0]).toEqual(Array(8).fill(-1));
  h.slots = []; expect(Harness("A", "歯科衛生士").scores[0]).toEqual([1, 2, -1, -1, -1, -1, -1, -1]);
});
