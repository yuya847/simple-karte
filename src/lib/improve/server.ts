// その場で直す、サーバー側（MCP の list_requests・resolve_request）: reads the requests of a workspace (the row the
// app saves, as the patient's page does: portal/server.ts) and writes a request's state back, merged into the
// latest row with the version checked (saveMergedWorkspace), so the other records stay as they are. The store is
// passed in, so the tests run without Supabase.

import { isoDate, nowTimeInTokyo, todayInTokyo } from "../dates";
import { loadWorkspaceRow, saveMergedWorkspace, workspaceOn } from "../workspace";
import { redact } from "../mcp/redact";
import type { Patient } from "../types";
import { advance, ImproveError, readImproveRequests, type ImproveRequest } from "./requests";

type Obj = Record<string, unknown>;

export interface ImproveStore {
  /** The day's records of the workspace (null: nothing saved yet). */
  read(ws: string): Promise<Obj | null>;
  /** Merge these records into the saved ones, three-way from what was read (the version checked; the others stay). */
  save(ws: string, mine: Obj, base: Obj): Promise<void>;
}

const today = () => isoDate(todayInTokyo());

export const workspaceStore: ImproveStore = {
  async read(ws) {
    if (!workspaceOn()) throw new ImproveError("記録の保存先が設定されていません");
    const row = await loadWorkspaceRow(ws, today());
    // The test ward of 100 (?scenarios=100) keeps its records as differences from its starting records.
    if (row && "__workspaceDelta" in row.data) throw new ImproveError("試験用の100人の病棟の記録は読めません");
    return row?.data ?? null;
  },
  async save(ws, mine, base) {
    if (!workspaceOn()) throw new ImproveError("記録の保存先が設定されていません");
    // __writer: the app's tabs see that someone else saved, and read the records again.
    await saveMergedWorkspace(ws, today(), { ...mine, __writer: { tab: "claude-code", by: "Claude Code", role: "Claude Code" } }, base, { mine: ["__writer"] });
  },
};

const at = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${isoDate(todayInTokyo(d))} ${nowTimeInTokyo(d)}`;
};

/** One request as Claude Code reads it: no name of the person (the 職種 only), the text redacted once more. */
export function forClaude(r: ImproveRequest, patients: Patient[]) {
  return {
    id: r.id,
    role: r.role,
    at: at(r.iso),
    screen: redact(r.screen, patients),
    text: redact(r.text, patients),
    status: r.status,
    ...(r.commit ? { commit: r.commit } : {}),
    ...(r.note ? { note: redact(r.note, patients) } : {}),
  };
}

const order: Record<ImproveRequest["status"], number> = { 受付: 0, 作業中: 1, 直った: 2 };

/** The workspace's requests: not fixed first, then oldest first (the newest 100). */
export async function listRequests(store: ImproveStore, ws: string, patients: Patient[]) {
  const all = readImproveRequests((await store.read(ws))?.improveRequests);
  const shown = all.sort((a, b) => b.iso.localeCompare(a.iso)).slice(0, 100);
  return { requests: shown.sort((a, b) => order[a.status] - order[b.status] || a.iso.localeCompare(b.iso)).map((r) => forClaude(r, patients)) };
}

/** Write a request's new state (直った with the commit, or 作業中) into the workspace. */
export async function resolveRequest(store: ImproveStore, ws: string, change: { id: string; status?: "作業中" | "直った"; commit?: string; note?: string }, patients: Patient[], now = new Date()) {
  const all = readImproveRequests((await store.read(ws))?.improveRequests);
  const r = all.find((x) => x.id === change.id);
  if (!r) throw new ImproveError("その id の要望が見つかりません");
  const next = advance(r, change, now, patients);
  // The entry as read is the base: what is gone from it (seen, the last word) goes from the saved one too.
  await store.save(ws, { improveRequests: [next] }, { improveRequests: [r] });
  return forClaude(next, patients);
}
