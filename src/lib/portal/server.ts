// 患者さんのページのサーバー側: reads the day's records of the workspace (the same row the chart saves; the
// patient's device never gets the workspace) and adds the patient's input to it. Without the Supabase settings,
// or with a token made without a workspace, the fictional records of the code are read and nothing can be sent.

import { isoDate, nowTimeInTokyo, todayInTokyo, type CalendarDate } from "../dates";
import { loadWorkspaceRow, saveMergedWorkspace, workspaceOn } from "../workspace";
import { INBOX_PER_PATIENT, readInbox, type PortalInboxEntry } from "./inbox";

type Obj = Record<string, unknown>;

export interface Records {
  data: Obj;
  /** The workspace was read (and can be written). */
  live: boolean;
  today: CalendarDate;
}

// The page asks every few seconds: one read of the row serves the requests of the next two seconds.
const CACHE_MS = 2000;
const cache = new Map<string, { at: number; data: Obj | null }>();

export async function readRecords(ws: string | null, now = Date.now()): Promise<Records> {
  const today = todayInTokyo(new Date(now));
  if (!ws || !workspaceOn()) return { data: {}, live: false, today };
  const day = isoDate(today);
  const key = `${ws}|${day}`;
  const hit = cache.get(key);
  let data: Obj | null;
  if (hit && now - hit.at < CACHE_MS) data = hit.data;
  else {
    const row = await loadWorkspaceRow(ws, day);
    data = row?.data ?? null;
    if (cache.size > 200) cache.clear();
    cache.set(key, { at: now, data });
  }
  // A row kept as differences from the test ward's starting records (?scenarios=100) cannot be read here.
  if (data && "__workspaceDelta" in data) return { data: {}, live: false, today };
  return { data: data ?? {}, live: true, today };
}

export class InboxFull extends Error {}

/** Add one entry to the day's records (merged with what is saved there; the other records stay as they are). */
export async function addToInbox(ws: string, entry: Omit<PortalInboxEntry, "id" | "at" | "iso">, now = new Date()): Promise<PortalInboxEntry> {
  const today = todayInTokyo(now);
  const day = isoDate(today);
  const row = await loadWorkspaceRow(ws, day);
  if (row && "__workspaceDelta" in row.data) throw new Error("この記録には足せません");
  if (readInbox(row?.data.portalInbox).filter((e) => e.patientId === entry.patientId).length >= INBOX_PER_PATIENT) throw new InboxFull();
  const full: PortalInboxEntry = { ...entry, id: crypto.randomUUID(), at: { day: 0, time: nowTimeInTokyo(now) }, iso: now.toISOString() };
  // __writer: the chart's tabs see that someone else saved, and read the records again.
  await saveMergedWorkspace(ws, day, { portalInbox: [full], __writer: { tab: "patient-portal", by: "患者さん", role: "患者" } }, null, { mine: ["__writer"] });
  cache.delete(`${ws}|${day}`);
  return full;
}
