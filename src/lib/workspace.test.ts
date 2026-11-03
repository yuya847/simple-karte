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
        return new Response(JSON.stringify([{ version: 1, day: "2026-11-04", data: { mar: { a: 1 } } }]), { status: 200 });
      }),
    );
    const { loadWorkspace, saveWorkspace, workspaceOn } = await import("./workspace");
    expect(workspaceOn()).toBe(true);
    expect(await loadWorkspace("00000000-0000-4000-8000-000000000000", "2026-11-04")).toEqual({ mar: { a: 1 } });
    expect(await loadWorkspace("00000000-0000-4000-8000-000000000000", "2026-11-05")).toBeNull();
    await saveWorkspace("00000000-0000-4000-8000-000000000000", "2026-11-04", { mar: {} });
    expect(calls[0].url).toBe("https://example.supabase.co/rest/v1/rpc/load_workspace");
    expect(calls[2]).toMatchObject({ url: "https://example.supabase.co/rest/v1/rpc/save_workspace", key: "sb_publishable_test", body: { p_version: 1, p_day: "2026-11-04" } });
  });
});
