import { describe, expect, it, vi } from "vitest";
import { byDay, commitUrl, dayCounts, FRESH_MS, loadChanges, needsMore, readCommits, timeOf, type ChangesStore } from "./changes";

// 2026-11-08 00:30 in Japan.
const now = new Date("2026-11-07T15:30:00.000Z");
const commit = (sha: string, date: string, message: string) => ({ sha, html_url: `https://github.com/yuya847/simple-karte/commit/${sha}`, commit: { message, committer: { date }, author: { date } } });
const page = [
  commit("a1", "2026-11-07T15:20:00Z", "要望から：体温の欄を広げた\n\nCo-Authored-By: x"),
  commit("b2", "2026-11-07T14:50:00Z", "字の大きさを3段階にした"), // 11/7 23:50 in Japan: yesterday
  commit("c3", "2026-11-06T15:10:00Z", "前の日の変更"), // 11/7 00:10: yesterday
  commit("d4", "2026-11-06T14:59:00Z", "前の前の日の変更"), // 11/6 23:59
];

describe("最近の変更：コミットの一覧", () => {
  it("1行目と時刻を新しい順に、変な行は落とす", () => {
    const rows = readCommits([page[2], page[0], { sha: 1 }, commit("e5", "bad", "x"), commit("f6", "2026-11-07T00:00:00Z", "\n"), ...page.slice(1, 2)]);
    expect(rows.map((r) => r.sha)).toEqual(["a1", "b2", "c3"]);
    expect(rows[0]).toEqual({ sha: "a1", iso: "2026-11-07T15:20:00Z", title: "要望から：体温の欄を広げた" });
    expect(commitUrl("a1")).toBe("https://github.com/yuya847/simple-karte/commit/a1");
    expect(readCommits({ message: "API rate limit exceeded" })).toEqual([]);
    expect(timeOf("2026-11-07T15:20:00Z")).toBe("00:20");
  });
  it("今日と昨日は日本の暦で数える", () => {
    const rows = readCommits(page);
    expect(dayCounts(rows, now)).toEqual({ today: 1, yesterday: 2 });
    expect(byDay(rows, now).map((g) => [g.label, g.rows.length])).toEqual([["今日", 1], ["昨日", 2], ["11/6", 1]]);
    expect(needsMore(rows.slice(0, 2), now)).toBe(true);
    expect(needsMore(rows, now)).toBe(false);
  });
});

function memoryStore(): ChangesStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, ...init });

describe("最近の変更：GitHub から読む", () => {
  it("読んだものを数分は覚え、次は ETag で聞く（変わっていなければそのまま）", async () => {
    const store = memoryStore();
    const fetchFn = vi.fn<Fetch>(async () => json(page, { headers: { etag: 'W/"e1"' } }));
    const first = await loadChanges(fetchFn as unknown as typeof fetch, store, now.getTime());
    expect(first.rows.map((r) => r.sha)).toEqual(["a1", "b2", "c3", "d4"]);
    expect(fetchFn.mock.calls[0][0]).toContain("/repos/yuya847/simple-karte/commits?per_page=100&page=1");
    await loadChanges(fetchFn as unknown as typeof fetch, store, now.getTime() + 1000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const unchanged = vi.fn<Fetch>(async () => new Response(null, { status: 304 }));
    const again = await loadChanges(unchanged as unknown as typeof fetch, store, now.getTime() + FRESH_MS + 1);
    expect((unchanged.mock.calls[0][1]?.headers as Record<string, string>)["if-none-match"]).toBe('W/"e1"');
    expect(again).toEqual({ rows: first.rows, later: false });
  });
  it("回数の上限ではあとで（GitHub の言う時刻まで聞かない）。オフラインは静かに空", async () => {
    const store = memoryStore();
    const reset = Math.floor(now.getTime() / 1000) + 600;
    const limited = vi.fn(async () => json({ message: "API rate limit exceeded" }, { status: 403, headers: { "x-ratelimit-reset": String(reset) } }));
    expect(await loadChanges(limited as unknown as typeof fetch, store, now.getTime())).toEqual({ rows: [], later: true });
    expect(await loadChanges(limited as unknown as typeof fetch, store, now.getTime() + FRESH_MS + 1)).toEqual({ rows: [], later: true });
    expect(limited).toHaveBeenCalledTimes(1);
    const offline = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    expect(await loadChanges(offline as unknown as typeof fetch, memoryStore(), now.getTime())).toEqual({ rows: [], later: false });
    expect(await loadChanges(offline as unknown as typeof fetch, null, now.getTime())).toEqual({ rows: [], later: false });
  });
  it("今日・昨日の行が続く間は次のページも読み、次からは前に読んだところまで", async () => {
    const many = (n: number, start: number) => Array.from({ length: n }, (_, i) => commit(`s${start + i}`, new Date(now.getTime() - (start + i) * 60_000).toISOString(), `変更 ${start + i}`));
    const pages: Record<string, ReturnType<typeof many>> = { "1": many(100, 0), "2": many(100, 100), "3": many(30, 200) };
    const fetchFn = vi.fn<Fetch>(async (url) => json(pages[url.split("&page=")[1]] ?? []));
    const store = memoryStore();
    const r = await loadChanges(fetchFn as unknown as typeof fetch, store, now.getTime());
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(r.rows).toHaveLength(230);
    // Five new commits later: one page, merged with what was read.
    const later = now.getTime() + FRESH_MS + 1;
    const newer = Array.from({ length: 5 }, (_, i) => commit(`n${i}`, new Date(later - i * 1000).toISOString(), `新しい変更 ${i}`));
    const next = vi.fn<Fetch>(async () => json([...newer, ...many(95, 0)]));
    const again = await loadChanges(next as unknown as typeof fetch, store, later);
    expect(next).toHaveBeenCalledTimes(1);
    expect(again.rows).toHaveLength(235);
    expect(again.rows[0].sha).toBe("n0");
  });
  it("途中で上限に当たっても、読めたページは残す", async () => {
    const reset = Math.floor(now.getTime() / 1000) + 600;
    const many = Array.from({ length: 100 }, (_, i) => commit(`s${i}`, new Date(now.getTime() - i * 60_000).toISOString(), `変更 ${i}`));
    const fetchFn = vi.fn<Fetch>(async (url) => url.endsWith("page=1") ? json(many) : json({ message: "limit" }, { status: 403, headers: { "x-ratelimit-reset": String(reset) } }));
    const r = await loadChanges(fetchFn as unknown as typeof fetch, memoryStore(), now.getTime());
    expect(r).toMatchObject({ later: true });
    expect(r.rows).toHaveLength(100);
  });
});
