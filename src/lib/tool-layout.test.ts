import { afterEach, expect, it, vi } from "vitest";
import { deleteToolGroup, moveTool, parseToolLayout, resolveTools } from "./tool-layout";
import { loadRail, saveRail } from "./rail";
const defaults = [{ key: "intervention", title: "介入", tools: ["rx", "inj"] }, { key: "reference", title: "参照", tools: ["calendar"] }];
afterEach(() => vi.unstubAllGlobals());
it("カテゴリを越えて移動・順序変更・名前変更し、人ごとに読み戻す", () => {
  const data = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) } });
  let l = moveTool(resolveTools(defaults), "rx", "reference", "calendar");
  l = { ...l, groups: l.groups.map(g => g.key === "reference" ? { ...g, title: "毎日" } : g), hidden: ["inj"] };
  saveRail("山本", { mode: "icons", pins: [], layout: l });
  expect(loadRail("山本").layout).toEqual(l);
  expect(loadRail("田中").layout).toBeUndefined();
  expect(l.groups[1]).toEqual({ key: "reference", title: "毎日", tools: ["rx", "calendar"] });
  expect(deleteToolGroup(l, "reference").groups.find(g => g.key === "other")?.tools).toEqual(["rx", "calendar"]);
});
it("初期値に追加された道具を補い、権限外の道具・重複・壊れた設定を除く", () => {
  expect(parseToolLayout({ groups: [null], hidden: [] })).toBeUndefined();
  const l = resolveTools(defaults, { groups: [{ key: "other", title: "自由", tools: ["rx", "rx", "forbidden"] }], hidden: [] });
  expect(l.groups.flatMap(g => g.tools).sort()).toEqual(["calendar", "inj", "rx"]);
  expect(resolveTools(defaults).groups).toEqual(defaults);
});
it("隠した道具を全部戻す：並びはそのまま、隠したものだけ表示に戻る", async () => {
  const { showAllTools } = await import("./tool-layout");
  const l = { ...moveTool(resolveTools(defaults), "rx", "reference"), hidden: ["inj", "calendar"] };
  expect(showAllTools(l)).toEqual({ ...l, hidden: [] });
  expect(showAllTools(undefined)).toBeUndefined();
});
it("隠す・戻す・落とした所に置く（人ごとの layout.hidden）", async () => {
  const { hideTool, showTool, placeTool } = await import("./tool-layout");
  const l = resolveTools(defaults);
  const hidden = hideTool(hideTool(l, "inj"), "inj");
  expect(hidden.hidden).toEqual(["inj"]);
  expect(hidden.groups).toEqual(l.groups);
  expect(showTool(hidden, "inj")).toEqual(l);
  // Dropped on its own group's tiles: shown where it was; on another tile: before it; on another group: at its end.
  expect(placeTool(hidden, "inj", "intervention")).toEqual(l);
  expect(placeTool(hidden, "inj", "intervention", "rx").groups[0].tools).toEqual(["inj", "rx"]);
  const moved = placeTool(hidden, "inj", "reference");
  expect(moved.hidden).toEqual([]);
  expect(moved.groups.map((g) => g.tools)).toEqual([["rx"], ["calendar", "inj"]]);
  // A tool this role does not have is not added.
  expect(placeTool(l, "forbidden", "reference")).toBe(l);
});
