export interface SavedFilter {
  id: string;
  name: string;
  on: string[];
  templateIds: string[];
  onlyTemplates: boolean;
  departments: string[];
  roles: string[];
  q: string;
  orderDay?: "予定日" | "依頼日";
  showStopped?: boolean;
}
export type FilterConditions = Omit<SavedFilter, "id" | "name">;

export const EXAMPLE_FILTERS: SavedFilter[] = [
  { id: "example-doctor", name: "医師の記事だけ", on: ["doctor"], templateIds: [], onlyTemplates: false, departments: [], roles: [], q: "", orderDay: "予定日", showStopped: false },
];

export function filterProblems(name: string, list: SavedFilter[], exceptId?: string): string[] {
  if (!name.trim()) return ["名前を入れてください。"];
  return list.some((f) => f.id !== exceptId && f.name === name.trim()) ? ["同じ名前の絞り込みがあります。"] : [];
}

export function sameFilter(a: FilterConditions, b: FilterConditions): boolean {
  const same = (x: string[], y: string[]) => {
    const left = new Set(x), right = new Set(y);
    return left.size === right.size && [...left].every((v) => right.has(v));
  };
  return same(a.on, b.on) && same(a.templateIds, b.templateIds) && same(a.departments, b.departments) && same(a.roles, b.roles) && a.onlyTemplates === b.onlyTemplates && a.q === b.q && (a.orderDay ?? "予定日") === (b.orderDay ?? "予定日") && (a.showStopped ?? false) === (b.showStopped ?? false);
}

const storeKey = (person: string) => `simple-karte:history-filters:${person}`;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");
function valid(v: unknown): v is SavedFilter {
  if (!v || typeof v !== "object") return false;
  const f = v as SavedFilter;
  return typeof f.id === "string" && !!f.id && typeof f.name === "string" && !!f.name.trim() && strings(f.on) && strings(f.templateIds) && typeof f.onlyTemplates === "boolean" && strings(f.departments) && strings(f.roles) && typeof f.q === "string" && (f.orderDay === undefined || f.orderDay === "予定日" || f.orderDay === "依頼日") && (f.showStopped === undefined || typeof f.showStopped === "boolean");
}
export function loadFilters(person: string): SavedFilter[] {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(storeKey(person));
    if (raw === null) return structuredClone(EXAMPLE_FILTERS);
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return structuredClone(EXAMPLE_FILTERS);
    const list: SavedFilter[] = [];
    for (const f of value) if (valid(f) && !list.some((p) => p.id === f.id) && !filterProblems(f.name, list).length) list.push({ ...f, name: f.name.trim(), orderDay: f.orderDay ?? "予定日", showStopped: f.showStopped ?? false });
    return list;
  } catch {
    return structuredClone(EXAMPLE_FILTERS);
  }
}
export function saveFilters(person: string, list: SavedFilter[]): boolean {
  if (list.some((f, i) => !valid(f) || filterProblems(f.name, list.filter((_, j) => j !== i)).length || list.some((p, j) => j !== i && p.id === f.id))) return false;
  try {
    window.localStorage.setItem(storeKey(person), JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}
export const removeFilter = (list: SavedFilter[], id: string) => list.filter((f) => f.id !== id);
export function moveFilter(list: SavedFilter[], id: string, direction: -1 | 1): SavedFilter[] {
  const index = list.findIndex((f) => f.id === id), to = index + direction;
  if (index < 0 || to < 0 || to >= list.length) return list;
  const result = [...list];
  [result[index], result[to]] = [result[to], result[index]];
  return result;
}
