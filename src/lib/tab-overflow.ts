/** Keep the active tab visible, with the remainder available in the overflow menu. */
export function visibleTabKeys(tabs: { key: string; active: boolean }[], limit: number): Set<string> {
  const count = Math.max(1, limit);
  const visible = tabs.slice(0, count);
  const active = tabs.find((t) => t.active);
  if (active && !visible.includes(active)) visible[visible.length - 1] = active;
  return new Set(visible.map((t) => t.key));
}
