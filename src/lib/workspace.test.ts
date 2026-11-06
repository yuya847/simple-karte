import { afterEach, describe, expect, it, vi } from "vitest";

describe("記録の保存（Supabase）", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  it("is off without the two variables", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const { workspaceOn } = await import("./workspace");
    expect(workspaceOn()).toBe(false);
  });
  it("reads back only the same day's records of this version, through the RPC with the public key", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    const calls: { url: string; body: unknown; key: string | null }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)), key: new Headers(init.headers).get("apikey") });
        if (url.endsWith("save_workspace_checked")) return new Response("true");
        return new Response(JSON.stringify([{ version: 1, day: "2026-11-04", data: { mar: { a: 1 } }, updated_at: "2026-11-04T01:02:03+00:00" }]), { status: 200 });
      }),
    );
    const { loadWorkspace, loadWorkspaceRow, saveWorkspace, supabaseEnv, workspaceOn } = await import("./workspace");
    expect(workspaceOn()).toBe(true);
    expect(supabaseEnv()).toEqual({ url: "https://example.supabase.co", key: "sb_publishable_test" });
    expect(await loadWorkspaceRow("00000000-0000-4000-8000-000000000000", "2026-11-04")).toEqual({ data: { mar: { a: 1 } }, updatedAt: "2026-11-04T01:02:03+00:00" });
    calls.length = 0;
    expect(await loadWorkspace("00000000-0000-4000-8000-000000000000", "2026-11-04")).toEqual({ mar: { a: 1 } });
    expect(await loadWorkspace("00000000-0000-4000-8000-000000000000", "2026-11-05")).toBeNull();
    await saveWorkspace("00000000-0000-4000-8000-000000000000", "2026-11-04", { mar: {} });
    expect(calls[0].url).toBe("https://example.supabase.co/rest/v1/rpc/load_workspace");
    expect(calls[3]).toMatchObject({ url: "https://example.supabase.co/rest/v1/rpc/save_workspace_checked", key: "sb_publishable_test", body: { p_version: 1, p_day: "2026-11-04" } });
  });
});

it("2端末が同じ行を読んで同時保存しても競合を再試行して両方の記録を残す", async () => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test");
  let data: Record<string, unknown> = { notes: [], calls: {} };
  let revision = 0;
  let rejected = 0;
  const stamp = () => `2026-11-06T01:00:${String(revision).padStart(2, "0")}Z`;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (url.endsWith("load_workspace")) return new Response(JSON.stringify([{ version: 1, day: "2026-11-06", data, updated_at: stamp() }]));
    if (body.p_expected !== stamp()) { rejected++; return new Response("false"); }
    data = body.p_data;
    revision++;
    return new Response("true");
  }));
  try {
    const { saveMergedWorkspace } = await import("./workspace");
    const base = { notes: [], calls: {} };
    await Promise.all([
      saveMergedWorkspace("test", "2026-11-06", { notes: [{ id: "lab", text: "検査技師" }], calls: { blood: { readBack: true } } }, base),
      saveMergedWorkspace("test", "2026-11-06", { notes: [{ id: "pharmacy", text: "薬剤師" }], calls: {} }, base),
    ]);
    expect(rejected).toBeGreaterThan(0);
    expect((data.notes as { id: string }[]).map((n) => n.id).sort()).toEqual(["lab", "pharmacy"]);
    expect(data.calls).toEqual({ blood: { readBack: true } });
  } finally {
    vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules();
  }
});

it("404は一度だけ確認し、500でも手元の記録を変えず次に再試行できる", async () => {
  vi.resetModules();
  const calls: string[] = [];
  let fail = true;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(url);
    if (url.endsWith("load_workspace")) return new Response("[]");
    if (url.endsWith("save_workspace_checked")) return new Response("", { status: 404 });
    return fail ? new Response("", { status: 500 }) : new Response(null, { status: 204 });
  }));
  try {
    const { saveMergedWorkspace } = await import("./workspace");
    const mine = { notes: [{ id: "local" }] };
    await expect(saveMergedWorkspace("ws", "today", mine, null)).rejects.toThrow("500");
    fail = false;
    expect((await saveMergedWorkspace("ws", "today", mine, null)).data).toEqual(mine);
    expect(calls.filter(url => url.endsWith("save_workspace_checked"))).toHaveLength(1);
    expect(mine).toEqual({ notes: [{ id: "local" }] });
  } finally { vi.unstubAllGlobals(); vi.resetModules(); }
});
