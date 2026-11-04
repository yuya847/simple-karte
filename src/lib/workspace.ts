// 記録の保存 (Supabase): the page's records, kept per workspace and per day. Without the two
// NEXT_PUBLIC_SUPABASE_* variables nothing is saved (as before). Records are fictional test patients only.
//
// The demo's patients are written relative to "today", so records are read back only on the same day; the
// next day starts from the beginning again.

export const WORKSPACE_VERSION = 1;
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const workspaceOn = () => !!URL_ && !!KEY;
/** The project's address and publishable key (for the realtime channel), or null when not configured. */
export const supabaseEnv = () => (workspaceOn() ? { url: URL_, key: KEY } : null);

const rpc = async <T>(fn: string, body: Record<string, unknown>): Promise<T> => {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`保存先の応答 ${res.status}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
};

const STORE = "simple-karte:workspace";
const isId = (s: string | null): s is string => !!s && /^[0-9a-f-]{36}$/i.test(s);

/** This browser's workspace: ?ws=<id> in the address (to open the same records elsewhere), else the one kept here. */
export function workspaceId(): string {
  const fromUrl = new URLSearchParams(window.location.search).get("ws");
  if (isId(fromUrl)) {
    try {
      window.localStorage.setItem(STORE, fromUrl);
    } catch {}
    return fromUrl;
  }
  try {
    const kept = window.localStorage.getItem(STORE);
    if (isId(kept)) return kept;
    const made = crypto.randomUUID();
    window.localStorage.setItem(STORE, made);
    return made;
  } catch {
    return crypto.randomUUID();
  }
}

/** The saved records of the day with when they were saved (null: nothing of this day and version). */
export async function loadWorkspaceRow(id: string, day: string): Promise<{ data: Record<string, unknown>; updatedAt: string | null } | null> {
  const rows = await rpc<{ version: number; day: string; data: Record<string, unknown>; updated_at?: string }[]>("load_workspace", { p_id: id });
  const r = rows?.[0];
  return r && r.version === WORKSPACE_VERSION && r.day === day ? { data: r.data, updatedAt: r.updated_at ?? null } : null;
}

export async function loadWorkspace(id: string, day: string): Promise<Record<string, unknown> | null> {
  return (await loadWorkspaceRow(id, day))?.data ?? null;
}

export const saveWorkspace = (id: string, day: string, data: Record<string, unknown>) => rpc<null>("save_workspace", { p_id: id, p_version: WORKSPACE_VERSION, p_day: day, p_data: data });
export const resetWorkspace = (id: string) => rpc<null>("reset_workspace", { p_id: id });

/** One row of touch_presence: another tab of the workspace seen in the last 30 seconds (or nulls), and the workspace's last save. */
export interface PresenceRow {
  tab: string | null;
  who: string | null;
  role: string | null;
  patient: string | null;
  editing: boolean | null;
  ws_updated: string | null;
  ws_writer: string | null;
  ws_by: string | null;
}

/**
 * 同時利用 across devices (supabase/schema.sql, the part 「同時利用」): say that this tab is here and which
 * chart it has open, and hear about the others and the last save. Fails when the table was not made.
 */
export const touchPresence = (ws: string, me: { tab: string; who: string; role: string; patient: string | null; editing: boolean }) =>
  rpc<PresenceRow[]>("touch_presence", { p_ws: ws, p_tab: me.tab, p_who: me.who, p_role: me.role, p_patient: me.patient, p_editing: me.editing });
