import { sameJson } from "./merge-workspace";
type Obj = Record<string, unknown>;
type Patch = { value: unknown } | { ids: string[]; entries: Record<string, Patch> } | { fields: Record<string, Patch>; removed: string[] };
const object = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const identified = (v: unknown): v is (Obj & { id: string })[] => Array.isArray(v) && v.every(x => object(x) && typeof x.id === "string");
function diff(value: unknown, seed: unknown): Patch {
  if (identified(value) && identified(seed)) {
    const before = new Map(seed.map(v => [v.id, v]));
    return { ids: value.map(v => v.id), entries: Object.fromEntries(value.filter(v => !sameJson(v, before.get(v.id))).map(v => [v.id, diff(v, before.get(v.id))])) };
  }
  if (!object(value) || !object(seed)) return { value };
  return { fields: Object.fromEntries(Object.keys(value).filter(k => !sameJson(value[k], seed[k])).map(k => [k, diff(value[k], seed[k])])), removed: Object.keys(seed).filter(k => !(k in value)) };
}
function apply(seed: unknown, patch: Patch): unknown {
  if ("value" in patch) return patch.value;
  if ("ids" in patch) {
    const before = new Map(identified(seed) ? seed.map(v => [v.id, v]) : []);
    return patch.ids.map(id => patch.entries[id] ? apply(before.get(id), patch.entries[id]) : before.get(id));
  }
  const out: Obj = object(seed) ? { ...seed } : {};
  for (const k of patch.removed) delete out[k];
  for (const [k, v] of Object.entries(patch.fields)) out[k] = apply(out[k], v);
  return out;
}
// Entries with ids store only changes plus their order; other arrays are replaced.
export const encodeWorkspace = (data: Obj, seed: Obj): Obj => ({ __workspaceDelta: 1, patch: diff(JSON.parse(JSON.stringify(data)), JSON.parse(JSON.stringify(seed))) });
export const decodeWorkspace = (data: Obj, seed: Obj): Obj => data.__workspaceDelta === 1 ? apply(seed, data.patch as Patch) as Obj : data;
