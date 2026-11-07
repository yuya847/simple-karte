export interface ToolGroup { key: string; title: string; tools: string[] }
export interface ToolLayout { groups: ToolGroup[]; hidden: string[] }
export function parseToolLayout(value: unknown): ToolLayout | undefined {
  if (!value || typeof value !== "object") return;
  const v = value as ToolLayout;
  if (!Array.isArray(v.groups) || !v.groups.every(g => g && typeof g.key === "string" && typeof g.title === "string" && Array.isArray(g.tools) && g.tools.every(t => typeof t === "string")) || !Array.isArray(v.hidden)) return;
  return { groups: v.groups.filter((g, i) => v.groups.findIndex(x => x.key === g.key) === i), hidden: v.hidden.filter(t => typeof t === "string") };
}
/** Overlay personal placement on the current role's available tools; new tools keep their defaults. */
export function resolveTools(defaults: ToolGroup[], saved?: ToolLayout): ToolLayout {
  if (!saved) return { groups: defaults, hidden: [] };
  const allowed = new Set(defaults.flatMap(g => g.tools));
  const seen = new Set<string>();
  const groups = saved.groups.map(g => ({ ...g, tools: g.tools.filter(t => { if (!allowed.has(t) || seen.has(t)) return false; seen.add(t); return true; }) }));
  for (const g of defaults) {
    const missing = g.tools.filter(t => !seen.has(t));
    if (!missing.length) continue;
    let target = groups.find(x => x.key === g.key);
    if (!target) { target = { ...g, tools: [] }; groups.push(target); }
    target.tools.push(...missing); missing.forEach(t => seen.add(t));
  }
  if (!groups.some(g => g.key === "other")) groups.push({ key: "other", title: "その他", tools: [] });
  return { groups, hidden: saved.hidden };
}
export function moveTool(layout: ToolLayout, tool: string, target: string, before?: string): ToolLayout {
  if (!layout.groups.some(g => g.key === target) || tool === before) return layout;
  const groups = layout.groups.map(g => ({ ...g, tools: g.tools.filter(t => t !== tool) }));
  const tools = groups.find(g => g.key === target)!.tools;
  const i = before ? tools.indexOf(before) : -1;
  tools.splice(i < 0 ? tools.length : i, 0, tool);
  return { ...layout, groups };
}
export function deleteToolGroup(layout: ToolLayout, key: string): ToolLayout {
  if (key === "other") return layout;
  const removed = layout.groups.find(g => g.key === key);
  const groups = layout.groups.filter(g => g.key !== key).map(g => ({ ...g, tools: [...g.tools] }));
  let other = groups.find(g => g.key === "other");
  if (!other) { other = { key: "other", title: "その他", tools: [] }; groups.push(other); }
  other.tools.push(...(removed?.tools ?? []));
  return { ...layout, groups };
}
/** 隠した道具を全部戻す（設定）: the placement stays, nothing is hidden. Without a saved layout there is nothing to undo. */
export function showAllTools(saved?: ToolLayout): ToolLayout | undefined {
  return saved ? { ...saved, hidden: [] } : undefined;
}
/** この道具を隠す: it keeps its place in its group and comes back there when shown again. */
export function hideTool(layout: ToolLayout, tool: string): ToolLayout {
  return layout.hidden.includes(tool) ? layout : { ...layout, hidden: [...layout.hidden, tool] };
}
/** Show a hidden tool again where it was. */
export function showTool(layout: ToolLayout, tool: string): ToolLayout {
  return layout.hidden.includes(tool) ? { ...layout, hidden: layout.hidden.filter((t) => t !== tool) } : layout;
}
/**
 * A tool dropped on a group's tiles (from 全ツール or the rail itself): shown again, and placed before the tile it
 * was dropped on, or at the end of that group when it came from another group. A tool the role does not have stays out.
 */
export function placeTool(layout: ToolLayout, tool: string, group: string, before?: string): ToolLayout {
  if (!layout.groups.some((g) => g.tools.includes(tool))) return layout;
  const shown = showTool(layout, tool);
  if (before && before !== tool) return moveTool(shown, tool, group, before);
  return shown.groups.find((g) => g.key === group)?.tools.includes(tool) ? shown : moveTool(shown, tool, group);
}
