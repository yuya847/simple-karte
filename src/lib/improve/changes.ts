// 最近の変更: what the app can do now, from the public repository's commits (GitHub's API, without a key; the
// first line of each commit says it in Japanese). Read only when the list is opened, kept for a few minutes, and
// asked again with the ETag (an unchanged answer does not count toward GitHub's limit). Offline or at the limit
// the list is what was read before, or empty, without a message; at the limit it is asked again only after the
// time GitHub gives.

import { addDays, isoDate, nowTimeInTokyo, todayInTokyo } from "../dates";

export const COMMITS_URL = "https://api.github.com/repos/yuya847/simple-karte/commits";

export interface ChangeRow {
  sha: string;
  /** When it went in (ISO). */
  iso: string;
  /** The first line of the message. */
  title: string;
}

export const commitUrl = (sha: string) => `https://github.com/yuya847/simple-karte/commit/${sha}`;

/** The rows of GitHub's answer, newest first (anything not like a commit is left out). */
export function readCommits(json: unknown): ChangeRow[] {
  if (!Array.isArray(json)) return [];
  return json
    .flatMap((x): ChangeRow[] => {
      const c = x as { sha?: unknown; commit?: { message?: unknown; committer?: { date?: unknown }; author?: { date?: unknown } } };
      const iso = c?.commit?.committer?.date ?? c?.commit?.author?.date;
      if (typeof c?.sha !== "string" || typeof c.commit?.message !== "string" || typeof iso !== "string" || Number.isNaN(Date.parse(iso))) return [];
      const title = c.commit.message.split("\n")[0].trim();
      return title ? [{ sha: c.sha.toLowerCase(), iso, title }] : [];
    })
    .sort((a, b) => Date.parse(b.iso) - Date.parse(a.iso));
}

/** The day in Japan of a moment ("2026-11-07"). */
export const tokyoDay = (iso: string) => isoDate(todayInTokyo(new Date(iso)));

/** 今日 N 件・昨日 N 件 (Japan time). */
export function dayCounts(rows: ChangeRow[], now: Date): { today: number; yesterday: number } {
  const t = todayInTokyo(now);
  const today = isoDate(t);
  const yesterday = isoDate(addDays(t, -1));
  let a = 0;
  let b = 0;
  for (const r of rows) {
    const d = tokyoDay(r.iso);
    if (d === today) a++;
    else if (d === yesterday) b++;
  }
  return { today: a, yesterday: b };
}

/** The rows in groups by day, newest first: 今日・昨日・11/5. */
export function byDay(rows: ChangeRow[], now: Date): { day: string; label: string; rows: ChangeRow[] }[] {
  const t = todayInTokyo(now);
  const names: Record<string, string> = { [isoDate(t)]: "今日", [isoDate(addDays(t, -1))]: "昨日" };
  const out: { day: string; label: string; rows: ChangeRow[] }[] = [];
  for (const r of rows) {
    const day = tokyoDay(r.iso);
    let g = out.find((x) => x.day === day);
    if (!g) {
      const [, m, d] = day.split("-").map(Number);
      g = { day, label: names[day] ?? `${m}/${d}`, rows: [] };
      out.push(g);
    }
    g.rows.push(r);
  }
  return out;
}

export const timeOf = (iso: string) => nowTimeInTokyo(new Date(iso));

/** Is the last row read still of today or yesterday (then the next page is needed for the counts)? */
export function needsMore(rows: ChangeRow[], now: Date): boolean {
  const last = rows.at(-1);
  return !!last && tokyoDay(last.iso) >= isoDate(addDays(todayInTokyo(now), -1));
}

interface Kept {
  at: number;
  rows: ChangeRow[];
  etag?: string;
  /** At GitHub's limit: not asked again before this moment (ms). */
  until?: number;
}

const KEY = "simple-karte:changes";
/** Asked again at most this often. */
export const FRESH_MS = 3 * 60_000;
const PER_PAGE = 100;
const PAGES = 5;
/** Kept in the browser: the newest this many. */
const KEEP = 600;

export interface ChangesStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function readKept(store: ChangesStore | null): Kept | null {
  try {
    const v = JSON.parse(store?.getItem(KEY) ?? "null") as Kept | null;
    return v && Array.isArray(v.rows) && typeof v.at === "number" ? { ...v, rows: readCommitsKept(v.rows) } : null;
  } catch {
    return null;
  }
}
const readCommitsKept = (rows: unknown[]): ChangeRow[] => rows.filter((r): r is ChangeRow => !!r && typeof (r as ChangeRow).sha === "string" && typeof (r as ChangeRow).iso === "string" && typeof (r as ChangeRow).title === "string");
function keep(store: ChangesStore | null, v: Kept) {
  try {
    store?.setItem(KEY, JSON.stringify(v));
  } catch {}
}

/** later: GitHub's limit was reached (the list is asked again later). */
export interface Changes {
  rows: ChangeRow[];
  later: boolean;
}

const newest = (rows: ChangeRow[]) => [...new Map(rows.map((r) => [r.sha, r])).values()].sort((a, b) => Date.parse(b.iso) - Date.parse(a.iso)).slice(0, KEEP);

/**
 * The newest commits: pages of 100 while they are of today or yesterday (for the counts), up to 5; after the first
 * time, only until the commits read before are reached (usually one page). `fetchFn` and `store` are the
 * browser's in the app and fakes in the tests.
 */
export async function loadChanges(fetchFn: typeof fetch, store: ChangesStore | null, now = Date.now()): Promise<Changes> {
  const kept = readKept(store);
  if (kept?.until && now < kept.until) return { rows: kept.rows, later: true };
  if (kept && now - kept.at < FRESH_MS) return { rows: kept.rows, later: false };
  const known = new Set(kept?.rows.map((r) => r.sha));
  const rows: ChangeRow[] = [];
  let etag = kept?.etag;
  let until: number | undefined;
  try {
    for (let page = 1; page <= PAGES; page++) {
      const headers: Record<string, string> = { accept: "application/vnd.github+json" };
      if (page === 1 && kept?.etag && kept.rows.length) headers["if-none-match"] = kept.etag;
      const res = await fetchFn(`${COMMITS_URL}?per_page=${PER_PAGE}&page=${page}`, { headers, cache: "no-store" });
      if (page === 1 && res.status === 304) break;
      if (res.status === 403 || res.status === 429) {
        const reset = Number(res.headers.get("x-ratelimit-reset"));
        until = Number.isFinite(reset) && reset > 0 ? reset * 1000 : now + 10 * 60_000;
        break;
      }
      if (!res.ok) throw new Error(String(res.status));
      if (page === 1) etag = res.headers.get("etag") ?? undefined;
      const got = readCommits(await res.json());
      rows.push(...got);
      if (got.length < PER_PAGE || got.some((r) => known.has(r.sha)) || !needsMore(got, new Date(now))) break;
    }
  } catch {
    // Offline (or GitHub not answering): what was read before, without a message.
    return { rows: kept?.rows ?? [], later: false };
  }
  const all = newest([...rows, ...(kept?.rows ?? [])]);
  keep(store, { at: until ? (kept?.at ?? 0) : now, rows: all, etag, ...(until ? { until } : {}) });
  return { rows: all, later: !!until };
}
