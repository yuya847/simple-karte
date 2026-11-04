// The rows of the flow sheet (経過表) a person wants: which groups come in which order, which rows are
// hidden, which groups are folded, and named sets of 看護ケア・観察 rows (観察項目のセット). Kept per user in
// this browser (flow-prefs.ts); these are the plain rules for changing them.

export const FLOW_GROUPS = [
  { key: "vitals", title: "バイタル" },
  { key: "obs", title: "観察・記録" },
  { key: "care", title: "看護ケア・観察（看護師の指示）" },
  { key: "io", title: "水分出納（IN/OUT）" },
  { key: "oral", title: "内服" },
  { key: "glucose", title: "血糖・インスリン" },
  { key: "inj", title: "注射" },
  { key: "lab", title: "検体検査" },
  { key: "notes", title: "記録" },
] as const;
export type FlowGroupKey = (typeof FLOW_GROUPS)[number]["key"];

/** Rows that can be hidden one by one (the care rows are "care:" + kind|item). */
export const FLOW_ROWS: Partial<Record<FlowGroupKey, { key: string; label: string }[]>> = {
  vitals: [
    { key: "vitals.notes", label: "付箋" },
    { key: "vitals.bt", label: "体温" },
    { key: "vitals.hr", label: "脈拍" },
    { key: "vitals.bp", label: "血圧" },
    { key: "vitals.rr", label: "呼吸数" },
    { key: "vitals.spo2", label: "SpO2" },
    { key: "vitals.o2", label: "酸素" },
    { key: "vitals.news2", label: "NEWS2（コードで計算）" },
  ],
  obs: [
    { key: "obs.diet", label: "食種" },
    { key: "obs.meals", label: "食事（割）" },
    { key: "obs.urine", label: "尿量" },
    { key: "obs.stools", label: "便" },
    { key: "obs.weight", label: "体重" },
    { key: "obs.fluid", label: "点滴量" },
  ],
};

export interface FlowLayout {
  /** Group keys in the order shown (groups missing here keep their place from FLOW_GROUPS). */
  order: string[];
  /** Hidden rows, and hidden groups as "group:" + key. */
  hidden: string[];
  /** Folded groups. */
  collapsed: string[];
  /** Named sets of care rows (their item names). */
  sets: { name: string; items: string[] }[];
  /** The set in use (only its care rows are shown), or null for all. */
  activeSet: string | null;
}

export const DEFAULT_LAYOUT: FlowLayout = { order: [], hidden: [], collapsed: [], sets: [], activeSet: null };

/** All groups in the order the person chose; groups not yet ordered keep their default place. */
export function groupOrder(order: string[]): FlowGroupKey[] {
  const known = FLOW_GROUPS.map((g) => g.key) as FlowGroupKey[];
  const chosen = order.filter((k): k is FlowGroupKey => (known as string[]).includes(k));
  const out = [...chosen];
  known.forEach((k, i) => {
    if (out.includes(k)) return;
    // Put it after the last placed of the groups that come before it by default (or first).
    const after = Math.max(-1, ...known.slice(0, i).map((b) => out.indexOf(b)));
    out.splice(after + 1, 0, k);
  });
  return out;
}

/** Move a group up (−1) or down (+1). */
export function moveGroup(l: FlowLayout, key: FlowGroupKey, dir: -1 | 1): FlowLayout {
  const order = groupOrder(l.order);
  const i = order.indexOf(key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return l;
  [order[i], order[j]] = [order[j], order[i]];
  return { ...l, order };
}

const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

export const toggleHidden = (l: FlowLayout, key: string): FlowLayout => ({ ...l, hidden: toggle(l.hidden, key) });
export const toggleCollapsed = (l: FlowLayout, key: string): FlowLayout => ({ ...l, collapsed: toggle(l.collapsed, key) });
export const groupShown = (l: FlowLayout, key: FlowGroupKey) => !l.hidden.includes(`group:${key}`);

export const careRowKey = (item: string) => `care:${item}`;

/** A care row is shown unless hidden, and (with a set in use) only when its item is in the set. */
export function careShown(l: FlowLayout, item: string): boolean {
  if (l.hidden.includes(careRowKey(item))) return false;
  const set = l.sets.find((s) => s.name === l.activeSet);
  return !set || set.items.includes(item);
}

/** Keep the care rows shown now as a named set (a set of the same name is replaced) and use it. */
export function saveSet(l: FlowLayout, name: string, items: string[]): FlowLayout {
  const n = name.trim().slice(0, 20);
  if (!n || !items.length) return l;
  return { ...l, sets: [...l.sets.filter((s) => s.name !== n), { name: n, items: [...new Set(items)] }], activeSet: n };
}

export const chooseSet = (l: FlowLayout, name: string | null): FlowLayout => ({ ...l, activeSet: name && l.sets.some((s) => s.name === name) ? name : null });

export const deleteSet = (l: FlowLayout, name: string): FlowLayout => ({ ...l, sets: l.sets.filter((s) => s.name !== name), activeSet: l.activeSet === name ? null : l.activeSet });

/** Read a kept layout; anything broken falls back to the default. */
export function parseLayout(v: unknown): FlowLayout {
  if (!v || typeof v !== "object") return DEFAULT_LAYOUT;
  const o = v as Record<string, unknown>;
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
  const sets = Array.isArray(o.sets)
    ? o.sets.flatMap((s) => (s && typeof s === "object" && typeof (s as { name?: unknown }).name === "string" ? [{ name: (s as { name: string }).name, items: strings((s as { items?: unknown }).items) }] : []))
    : [];
  const activeSet = typeof o.activeSet === "string" && sets.some((s) => s.name === o.activeSet) ? o.activeSet : null;
  return { order: strings(o.order), hidden: strings(o.hidden), collapsed: strings(o.collapsed), sets, activeSet };
}
