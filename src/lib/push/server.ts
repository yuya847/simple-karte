// スマートフォンへの通知のサーバー側: reads the day's records of the workspace (the row the chart saves), adds or
// stops a device in pushSubs, and sends the new results to the devices of the people concerned. Each change is
// merged with what is saved (the other records stay as they are). A result is sent once (pushSent).

import { isoDate, todayInTokyo } from "../dates";
import { pseudonym } from "../mcp/anonymize";
import { loadWorkspaceRow, saveMergedWorkspace, workspaceOn } from "../workspace";
import { activeSubs, planPush, readPrefs, readSent, readSubs, shortId, type PushItem, type PushKeys, type PushRole, type PushSub } from "./push";
import { vapid, type PushSender } from "./send";

/** Devices that may receive in one workspace at a time. */
export const MAX_SUBS = 100;
/** How long a push service keeps a notification for a device that is off (seconds). */
const TTL = 6 * 60 * 60;

export class PushUnavailable extends Error {}
export class PushFull extends Error {}

/** Why notifications cannot be used on this server (null: they can). */
export function pushUnavailable(): string | null {
  if (!vapid()) return "通知の鍵（VAPID）が設定されていません";
  if (!workspaceOn()) return "記録の保存先（Supabase）が設定されていません";
  return null;
}

const dayOf = (now: Date) => isoDate(todayInTokyo(now));

async function rowOf(ws: string, day: string) {
  const row = await loadWorkspaceRow(ws, day);
  // A row kept as differences from the test ward's starting records (?scenarios=100) cannot be read here.
  if (row && "__workspaceDelta" in row.data) throw new PushUnavailable("この記録では使えません");
  return row;
}

const writer = (by: string, role: string) => ({ tab: "push", by, role });

/** The person registered for this browser's subscription in the workspace (null: none). */
export async function registeredName(ws: string, endpoint: string, now = new Date()): Promise<string | null> {
  const row = await rowOf(ws, dayOf(now));
  return activeSubs(readSubs(row?.data.pushSubs)).find((s) => s.sub?.endpoint === endpoint)?.name ?? null;
}

/** Register a device; the same browser registered before (by anyone) stops its earlier line. */
export async function addSub(ws: string, input: { name: string; role: PushRole; device: string; sub: PushKeys }, now = new Date()): Promise<PushSub> {
  const day = dayOf(now);
  const row = await rowOf(ws, day);
  const subs = readSubs(row?.data.pushSubs);
  const iso = now.toISOString();
  const earlier = activeSubs(subs).filter((s) => s.sub?.endpoint === input.sub.endpoint);
  if (activeSubs(subs).length - earlier.length >= MAX_SUBS) throw new PushFull();
  const entry: PushSub = { id: crypto.randomUUID(), name: input.name, role: input.role, device: input.device, sub: input.sub, iso };
  const stopped = earlier.map((s) => ({ ...s, sub: null, stopped: { iso, by: input.name } }));
  await saveMergedWorkspace(ws, day, { pushSubs: [...stopped, entry], __writer: writer(input.name, input.role) }, null, { mine: ["__writer"] });
  return entry;
}

/** Stop this browser's subscription (false: it was not registered). */
export async function stopSub(ws: string, endpoint: string, by: string, now = new Date()): Promise<boolean> {
  const day = dayOf(now);
  const row = await rowOf(ws, day);
  const iso = now.toISOString();
  const mine = activeSubs(readSubs(row?.data.pushSubs)).filter((s) => s.sub?.endpoint === endpoint);
  if (!mine.length) return false;
  await saveMergedWorkspace(ws, day, { pushSubs: mine.map((s) => ({ ...s, sub: null, stopped: { iso, by } })), __writer: writer(by, mine[0].role) }, null, { mine: ["__writer"] });
  return true;
}

// Keys sent from this server instance in the last minutes (two pages confirming at once send once).
const recent = new Map<string, number>();
const RECENT_MS = 10 * 60 * 1000;

/** Send the results not sent before to the devices of their doctors (and a panic value to the bed's nurse). */
export async function notify(ws: string, items: PushItem[], send: PushSender, now = new Date()): Promise<{ sent: number; stopped: number }> {
  const day = dayOf(now);
  const row = await rowOf(ws, day);
  if (!row) return { sent: 0, stopped: 0 };
  const at = now.getTime();
  for (const [k, t] of recent) if (at - t > RECENT_MS) recent.delete(k);
  const before = readSent(row.data.pushSent);
  const fresh = items.filter((i) => !before[i.key] && !recent.has(`${ws}|${i.key}`));
  if (!fresh.length) return { sent: 0, stopped: 0 };
  for (const i of fresh) recent.set(`${ws}|${i.key}`, at);
  const iso = now.toISOString();
  // Kept first, so a second call for the same results sends nothing.
  await saveMergedWorkspace(ws, day, { pushSent: Object.fromEntries(fresh.map((i) => [i.key, iso])) }, null);
  const subs = readSubs(row.data.pushSubs);
  const messages = planPush(subs, fresh, readPrefs(row.data.pushPrefs).detail, (pid) => shortId(pseudonym(pid)));
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    messages.map(async (m) => {
      try {
        await send(m.sub, JSON.stringify({ title: m.title, body: m.body }), { urgency: m.urgent ? "high" : "normal", TTL });
        sent++;
      } catch (e) {
        // The device's subscription ended (unsubscribed, app removed): it stops here too.
        const code = (e as { statusCode?: unknown } | null)?.statusCode;
        if (code === 404 || code === 410) gone.push(m.subId);
      }
    }),
  );
  if (gone.length) await saveMergedWorkspace(ws, day, { pushSubs: subs.filter((s) => gone.includes(s.id)).map((s) => ({ ...s, sub: null, stopped: { iso, by: "送れない端末（購読の終了）" } })) }, null);
  return { sent, stopped: gone.length };
}
