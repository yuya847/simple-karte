import { afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, effects: [] as (() => void)[], deps: [] as unknown[][], ec: 0 }));
vi.mock("react", () => ({
  useRef: (value: unknown) => { const i = h.cursor++; return h.slots[i] ??= { current: value }; },
  useState: (value: unknown) => { const i = h.cursor++; if (!(i in h.slots)) h.slots[i] = value; return [h.slots[i], (v: unknown) => { h.slots[i] = v; }]; },
  useEffect: (fn: () => void, deps?: unknown[]) => { const i = h.ec++; if (!deps || !h.deps[i] || deps.some((v, n) => v !== h.deps[i][n])) h.effects.push(fn); h.deps[i] = deps ?? []; },
}));
vi.mock("./presence", () => ({ thisTab: () => "me" }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); h.slots = []; h.deps = []; h.effects = []; });
it("無操作と取り込みでは保存せず、未保存入力は残し500を指数間隔で再試行する", async () => {
  vi.useFakeTimers();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.test"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test");
  vi.stubGlobal("window", { location: { search: "?scenarios=100" }, localStorage: { getItem: () => "00000000-0000-4000-8000-000000000000" } });
  let remote = { notes: { p: [] as { id: string }[] } }; let stamp = "1"; let fail = false;
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("load_workspace")) return new Response(JSON.stringify([{ version: 1, day: "today", data: remote, updated_at: stamp }]));
    if (fail) return new Response("", { status: 500 });
    remote = JSON.parse(String(init.body)).p_data;
    return new Response("true");
  }); vi.stubGlobal("fetch", fetcher);
  const { useWorkspace } = await import("./use-workspace");
  let notes: Record<string, { id: string }[]> = { p: [] };
  const WorkspaceHarness = () => { h.cursor = 0; h.ec = 0; const result = useWorkspace({ notes: [notes, v => { notes = v; }] }, "today"); const effects = h.effects.splice(0); effects.forEach(f => f()); return result; };
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  WorkspaceHarness(); await flush(); let api = WorkspaceHarness();
  await vi.advanceTimersByTimeAsync(30000); WorkspaceHarness();
  expect(fetcher.mock.calls.filter(([url]) => url.includes("save_workspace"))).toHaveLength(0);
  remote = { notes: { p: [{ id: "remote" }] } }; stamp = "2";
  await api.pull(); api = WorkspaceHarness(); await vi.advanceTimersByTimeAsync(15000);
  expect(fetcher.mock.calls.filter(([url]) => url.includes("save_workspace"))).toHaveLength(0);
  notes = { p: [...notes.p, { id: "local" }] }; api = WorkspaceHarness();
  remote = { notes: { p: [{ id: "remote" }, { id: "other" }] } }; stamp = "3";
  await api.pull(); WorkspaceHarness(); expect(notes.p.map(x => x.id)).toContain("local");
  fail = true; await vi.advanceTimersByTimeAsync(1000); expect(WorkspaceHarness().status).toBe("error");
  const count = () => fetcher.mock.calls.filter(([url]) => url.includes("save_workspace")).length;
  expect(count()).toBe(1); await vi.advanceTimersByTimeAsync(2000); expect(count()).toBe(2);
  await vi.advanceTimersByTimeAsync(3999); expect(count()).toBe(2);
  fail = false; await vi.advanceTimersByTimeAsync(1); expect(WorkspaceHarness().status).toBe("saved");
  expect(notes.p.map(x => x.id)).toContain("local");
});
