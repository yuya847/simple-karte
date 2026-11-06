// 同時に一つの患者を開く: the day's records are saved as one JSON row (workspace.ts). When another tab or device
// saved after this page read the records, the two are merged record by record instead of one overwriting the
// other, and the merged records are saved. The merge is three-way when the records this page started from
// (the base) are known: what only the other side changed is taken, what only this page changed is kept, and
// what both changed is merged inside (an array of entries with ids: union by id, each id merged inside; a
// map: key by key; a list without ids: the union, in order). Where a single value was changed on both sides,
// local input is kept and the conflict is reported. What one person is writing (the chart's note and drafts) stays as it is here.

export interface MergeOptions {
  /** Whether a top-level record's entry (e.g. charts → "p1|看護師") belongs to this page alone (kept as it is here). */
  local?: (key: string, sub: string) => boolean;
  /** Top-level records that are taken from the saved side as they are (their setter merges them in itself). */
  theirs?: readonly string[];
  /** Top-level records that stay as they are here (e.g. who saves from this page). */
  mine?: readonly string[];
}

export interface MergeResult {
  data: Record<string, unknown>;
  /** The top-level records where something of the saved side came in. */
  changed: string[];
  conflicts: string[];
  /** The top-level records where this page holds something the saved side lacks (so the result is to be saved). What is local to this page does not count. */
  kept: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const idOf = (v: unknown): string | null => (isObj(v) && typeof v.id === "string" && v.id ? v.id : null);
const hasIds = (a: unknown[]) => a.length > 0 && a.every((v) => idOf(v) !== null);
export const stableJson = (v: unknown): string => JSON.stringify(v, (_k, value) =>
  isObj(value) ? Object.fromEntries(Object.keys(value).sort().map(k => [k, value[k]])) : value) ?? "undefined";
const key = stableJson;

/** Deep equality by JSON (records are plain data). */
export const sameJson = (a: unknown, b: unknown): boolean => a === b || key(a) === key(b);

/** Two lists of entries with ids: every id of either, merged inside when both have it; the saved side's new entries after this page's. */
function mergeIdLists(mine: unknown[], theirs: unknown[], base: unknown[] | undefined): unknown[] {
  const baseById = new Map<string, unknown>();
  if (base && hasIds(base)) for (const v of base) baseById.set(idOf(v)!, v);
  const theirById = new Map(theirs.map((v) => [idOf(v)!, v]));
  const mineById = new Map(mine.map((v) => [idOf(v)!, v]));
  const out: unknown[] = [];
  for (const v of new Map(mine.map(v => [idOf(v), v])).values()) {
    const id = idOf(v)!;
    const t = theirById.get(id);
    if (t !== undefined) out.push(merge3(v, t, baseById.get(id)));
    else out.push(v);
  }
  for (const v of new Map(theirs.map(v => [idOf(v), v])).values()) {
    const id = idOf(v)!;
    if (mineById.has(id)) continue;

    out.push(v);
  }
  return out;
}

/** Two lists without ids (strings, moments…): the union in order; something the other side removed from the base goes. */
function mergeLists(mine: unknown[], theirs: unknown[], base: unknown[] | undefined): unknown[] {
  const identity = (v: unknown) => idOf(v) ? `id:${idOf(v)}` : key(v);
  const inTheirs = new Set(theirs.map(identity));
  const inMine = new Set(mine.map(identity));
  const inBase = new Set((base ?? []).map(identity));
  const out: unknown[] = [];
  const seen = new Set<string>();
  for (const v of mine) {
    const k = identity(v);
    if (seen.has(k)) continue;
    if (!inTheirs.has(k) && inBase.has(k)) continue;
    seen.add(k);
    out.push(idOf(v) && inTheirs.has(k) ? merge3(v, theirs.find(t => identity(t) === k), base?.find(b => identity(b) === k)) : v);
  }
  for (const v of theirs) {
    const k = identity(v);
    if (seen.has(k) || inMine.has(k)) continue;
    if (inBase.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

function mergeObjects(mine: Obj, theirs: Obj, base: Obj | undefined, local?: (sub: string) => boolean, preserveMissing = false): Obj {
  const out: Obj = {};
  for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
    if (local?.(k)) {
      // What is being written here stays; what another page writes is not brought in (only when nothing is known yet).
      if (k in mine) out[k] = mine[k];
      else if (!base) out[k] = theirs[k];
      continue;
    }
    const inMine = k in mine;
    const inTheirs = k in theirs;
    const b = base?.[k];
    if (inMine && inTheirs) out[k] = merge3(mine[k], theirs[k], b);
    else if (inMine) {
      // Removed on the other side, and not changed here: it goes.
      if (preserveMissing || !(base && k in base && sameJson(b, mine[k]))) out[k] = mine[k];
    } else if (preserveMissing || !(base && k in base && sameJson(b, theirs[k]))) out[k] = theirs[k];
  }
  return out;
}

/** One value of the records, three-way. */
export function merge3(mine: unknown, theirs: unknown, base: unknown): unknown {
  if (Array.isArray(mine) && Array.isArray(theirs)) {
    const b = Array.isArray(base) ? base : undefined;
    if ((hasIds(mine) || !mine.length) && (hasIds(theirs) || !theirs.length)) return mergeIdLists(mine, theirs, b);
    return mergeLists(mine, theirs, b);
  }
  if (!isObj(base) && isObj(mine) && isObj(theirs) && recordTime(mine) !== null && recordTime(theirs) !== null && recordTime(mine) !== recordTime(theirs)) return recordTime(mine)! > recordTime(theirs)! ? mine : theirs;
  if (isObj(mine) && isObj(theirs)) return mergeObjects(mine, theirs, isObj(base) ? base : undefined);
  if (sameJson(mine, theirs)) return mine;
  if (base !== undefined) {
    if (sameJson(mine, base)) return theirs;
    if (sameJson(theirs, base)) return mine;
  }
  // Keep unsaved local input when both sides changed a scalar.
  return mine;
}

/**
 * The records of this page merged with the records saved elsewhere. `base`: the records this page read or
 * saved last (null when not known: then a two-way merge, where nothing is removed).
 */
export function mergeWorkspace(mine: Record<string, unknown>, theirs: Record<string, unknown>, base: Record<string, unknown> | null, opts: MergeOptions = {}): MergeResult {
  const data: Record<string, unknown> = {};
  const changed: string[] = [];
  const kept: string[] = [];
  const takeTheirs = new Set(opts.theirs ?? []);
  const keepMine = new Set(opts.mine ?? []);
  // Without what is local to this page, for telling whether the saved side lacks something.
  const shared = (k: string, v: unknown) => (opts.local && isObj(v) ? Object.fromEntries(Object.entries(v).filter(([sub]) => !opts.local!(k, sub))) : v);
  for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
    const m = mine[k];
    const t = theirs[k];
    const b = base?.[k];
    let v: unknown;
    if (!(k in theirs) || (keepMine.has(k) && k in mine)) v = m;
    else if (!(k in mine) || takeTheirs.has(k)) v = t;
    else if (["calls", "acks", "notes", "revised"].includes(k) && isObj(m) && isObj(t)) v = mergeObjects(m, t, isObj(b) ? b : undefined, undefined, true);
    else if (isObj(m) && isObj(t) && opts.local) v = mergeObjects(m, t, isObj(b) ? b : undefined, (sub) => opts.local!(k, sub));
    else v = merge3(m, t, b);
    data[k] = v;
    if (!sameJson(v, m)) changed.push(k);
    if (!keepMine.has(k) && !takeTheirs.has(k) && !sameJson(shared(k, v), shared(k, t))) kept.push(k);
  }
  const conflicts = conflictPaths(mine, theirs, base ?? {}, opts);
  return { data, changed, kept, conflicts };
}

/** For `charts`: what one role is writing (its desk "patient|role") stays on this page. */
export const chartDeskOf = (role: string, desk = role) => (k: string, sub: string) => {
  if (k === "charts") return sub.endsWith(`|${role}`);
  if (k === "windowEntries") {
    try {
      const [scope] = JSON.parse(sub) as [string, string];
      return typeof scope === "string" && scope.endsWith(`:${desk}`);
    } catch { return false; }
  }
  return false;
};

/** Report simultaneous scalar edits; separate additions and timestamp-resolved records are not conflicts. */
function conflictPaths(mine: Obj, theirs: Obj, base: Obj, opts: MergeOptions): string[] {
  const out: string[] = [];
  const walk = (m: unknown, t: unknown, b: unknown, path: string) => {
    if (sameJson(m, t) || sameJson(m, b) || sameJson(t, b) || m === undefined || t === undefined) return;
    if (Array.isArray(m) && Array.isArray(t)) {
      if (hasIds(m) && hasIds(t)) for (const v of m) {
        const id = idOf(v)!;
        walk(v, t.find((x) => idOf(x) === id), Array.isArray(b) ? b.find((x) => idOf(x) === id) : undefined, `${path}[${id}]`);
      }
    } else if (isObj(m) && isObj(t)) {
      if (!isObj(b) && recordTime(m) !== null && recordTime(t) !== null && recordTime(m) !== recordTime(t)) return;
      for (const k of Object.keys(m)) walk(m[k], t[k], isObj(b) ? b[k] : undefined, `${path}.${k}`);
    } else out.push(path);
  };
  for (const k of Object.keys(mine)) {
    if (opts.mine?.includes(k) || opts.theirs?.includes(k)) continue;
    const m = mine[k], t = theirs[k], b = base[k];
    if (opts.local && isObj(m) && isObj(t)) {
      for (const sub of Object.keys(m)) if (!opts.local(k, sub)) walk(m[sub], t[sub], isObj(b) ? b[sub] : undefined, `${k}.${sub}`);
    } else walk(m, t, b, k);
  }
  return out;
}
const recordTime = (v: Obj): number | null => {
  const n = Date.parse(String(v.updatedAt ?? v.updated_at ?? ""));
  return Number.isFinite(n) ? n : null;
};
