// 記事の同時編集: a three-way merge of text (diff3). Two people start from the same note (the base) and each
// types their own changes; the merge keeps both changes wherever they touch different lines, and inside a line
// that both changed it merges by character. Only when both changed the very same characters is there no way
// to tell which is wanted: then the first text's version comes first and the second's follows, so nothing
// typed is lost and every page that merges the same two texts gets the same result (the callers order the
// texts by a stable key). No dependency: the differences are longest-common-subsequence diffs.

/** A change of one side against the base: base[xs, xe) became side[ys, ye). */
interface Hunk {
  xs: number;
  xe: number;
  ys: number;
  ye: number;
}

/** When the two texts are too long to compare in full, the whole text counts as one change. */
const MAX_CELLS = 4_000_000;

/** The changes that turn `x` into `y`, as half-open ranges (longest common subsequence). */
function diffHunks<T>(x: readonly T[], y: readonly T[]): Hunk[] {
  const n = x.length;
  const m = y.length;
  // The same head and tail are not compared (they are stable).
  let head = 0;
  while (head < n && head < m && x[head] === y[head]) head++;
  let tail = 0;
  while (tail < n - head && tail < m - head && x[n - 1 - tail] === y[m - 1 - tail]) tail++;
  const a = x.slice(head, n - tail);
  const b = y.slice(head, m - tail);
  if (!a.length && !b.length) return [];
  if ((a.length + 1) * (b.length + 1) > MAX_CELLS) return [{ xs: head, xe: n - tail, ys: head, ye: m - tail }];
  const w = b.length + 1;
  const lcs = new Int32Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) lcs[i * w + j] = a[i] === b[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
  const out: Hunk[] = [];
  let i = 0;
  let j = 0;
  let cur: Hunk | null = null;
  const change = (di: number, dj: number) => {
    if (!cur) cur = { xs: head + i, xe: head + i, ys: head + j, ye: head + j };
    cur.xe += di;
    cur.ye += dj;
    i += di;
    j += dj;
  };
  const settle = () => {
    if (cur) out.push(cur);
    cur = null;
  };
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      settle();
      i++;
      j++;
    } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) change(1, 0);
    else change(0, 1);
  }
  if (i < a.length) change(a.length - i, 0);
  if (j < b.length) change(0, b.length - j);
  settle();
  return out;
}

/** Whether two changes of the base cannot be applied one after the other without asking which comes first. */
function overlap(h: Hunk, g: Hunk): boolean {
  if (h.xs < g.xe && g.xs < h.xe) return true;
  const hEmpty = h.xs === h.xe;
  const gEmpty = g.xs === g.xe;
  if (hEmpty && gEmpty) return h.xs === g.xs;
  // An insertion strictly inside what the other side replaced.
  if (hEmpty) return g.xs < h.xs && h.xs < g.xe;
  if (gEmpty) return h.xs < g.xs && g.xs < h.xe;
  return false;
}

/** One side's text for the base range [gs, ge): its changes there, and the base items it kept. */
function sideSlice<T>(base: readonly T[], side: readonly T[], hunks: Hunk[], gs: number, ge: number): T[] {
  const out: T[] = [];
  let i = gs;
  for (const h of hunks) {
    for (; i < h.xs; i++) out.push(base[i]);
    for (let k = h.ys; k < h.ye; k++) out.push(side[k]);
    i = h.xe;
  }
  for (; i < ge; i++) out.push(base[i]);
  return out;
}

export interface Merge3Region<T> {
  /** stable: unchanged; a / b: one side changed it; both: the same change on both sides; conflict: different changes. */
  kind: "stable" | "a" | "b" | "both" | "conflict";
  base: T[];
  a: T[];
  b: T[];
}

/** The regions of a three-way comparison, in order. */
export function diff3Regions<T>(base: readonly T[], a: readonly T[], b: readonly T[]): Merge3Region<T>[] {
  const ha = diffHunks(base, a);
  const hb = diffHunks(base, b);
  type Tagged = { h: Hunk; side: "a" | "b" };
  const all: Tagged[] = [...ha.map((h) => ({ h, side: "a" as const })), ...hb.map((h) => ({ h, side: "b" as const }))].sort((p, q) => p.h.xs - q.h.xs || p.h.xe - q.h.xe || (p.side === "a" ? -1 : 1));
  // Changes that overlap in the base are decided together.
  const groups: { gs: number; ge: number; items: Tagged[] }[] = [];
  for (const t of all) {
    const g = groups.at(-1);
    if (g && g.items.some((o) => overlap(o.h, t.h))) {
      g.ge = Math.max(g.ge, t.h.xe);
      g.items.push(t);
    } else groups.push({ gs: t.h.xs, ge: t.h.xe, items: [t] });
  }
  const out: Merge3Region<T>[] = [];
  let i = 0;
  const stable = (to: number) => {
    if (to > i) {
      const s = base.slice(i, to);
      out.push({ kind: "stable", base: s, a: s.slice(), b: s.slice() });
    }
    i = to;
  };
  for (const g of groups) {
    stable(g.gs);
    const sa = sideSlice(base, a, g.items.filter((t) => t.side === "a").map((t) => t.h), g.gs, g.ge);
    const sb = sideSlice(base, b, g.items.filter((t) => t.side === "b").map((t) => t.h), g.gs, g.ge);
    const hasA = g.items.some((t) => t.side === "a");
    const hasB = g.items.some((t) => t.side === "b");
    const same = sa.length === sb.length && sa.every((v, k) => v === sb[k]);
    out.push({ kind: !hasB ? "a" : !hasA ? "b" : same ? "both" : "conflict", base: base.slice(g.gs, g.ge), a: sa, b: sb });
    i = g.ge;
  }
  stable(base.length);
  return out;
}

export interface Merge3Result {
  text: string;
  /** Places where both changed the same characters (the first text's version is put first there). */
  conflicts: number;
  /** Whether anything of `a` or `b` is in the result that is not in the base. */
  changed: boolean;
}

/** Whether `inner` appears in `outer` as one contiguous run. */
function contains<T>(outer: readonly T[], inner: readonly T[]): boolean {
  if (inner.length > outer.length) return false;
  outer: for (let i = 0; i + inner.length <= outer.length; i++) {
    for (let k = 0; k < inner.length; k++) if (outer[i + k] !== inner[k]) continue outer;
    return true;
  }
  return false;
}

/**
 * A region both changed differently: when one side's text already holds the other's whole text (it typed the
 * same and more, or took the other's change in earlier), that side is the answer; otherwise it is a conflict.
 */
function settle<T>(r: Merge3Region<T>): T[] | null {
  if (contains(r.a, r.b)) return r.a;
  if (contains(r.b, r.a)) return r.b;
  return null;
}

const chars = (s: string) => Array.from(s);

/** Characters: a conflicting change of both is put as a's then b's. */
function mergeChars(base: string, a: string, b: string): { text: string; conflicts: number } {
  let conflicts = 0;
  const text = diff3Regions(chars(base), chars(a), chars(b))
    .map((r) => {
      if (r.kind !== "conflict") return (r.kind === "b" ? r.b : r.a).join("");
      const s = settle(r);
      if (s) return s.join("");
      conflicts++;
      return r.a.join("") + r.b.join("");
    })
    .join("");
  return { text, conflicts };
}

/**
 * Three-way merge of a note's text: by line first, then by character inside the lines both changed. When `a`
 * and `b` changed the very same characters differently, a's version comes first and b's follows.
 */
export function merge3Text(base: string, a: string, b: string): Merge3Result {
  if (a === b) return { text: a, conflicts: 0, changed: a !== base };
  if (a === base) return { text: b, conflicts: 0, changed: true };
  if (b === base) return { text: a, conflicts: 0, changed: true };
  let conflicts = 0;
  const lines: string[] = [];
  for (const r of diff3Regions(base.split("\n"), a.split("\n"), b.split("\n"))) {
    if (r.kind !== "conflict") {
      lines.push(...(r.kind === "b" ? r.b : r.a));
      continue;
    }
    const s = settle(r);
    if (s) {
      lines.push(...s);
      continue;
    }
    const m = mergeChars(r.base.join("\n"), r.a.join("\n"), r.b.join("\n"));
    conflicts += m.conflicts;
    lines.push(...m.text.split("\n"));
  }
  return { text: lines.join("\n"), conflicts, changed: true };
}

/**
 * Where a caret (an index into `before`) lands in `after`, when the text changed around it: before the change
 * it stays; after the change it moves with the text; inside the change it goes to the end of the change.
 */
export function mapCursor(before: string, after: string, cursor: number): number {
  if (before === after) return Math.min(cursor, after.length);
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head++;
  if (cursor <= head) return cursor;
  let tail = 0;
  while (tail < before.length - head && tail < after.length - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  if (cursor >= before.length - tail) return cursor + (after.length - before.length);
  return after.length - tail;
}
