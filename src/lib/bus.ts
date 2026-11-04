"use client";

// The messages of presence.ts go two ways at once: to the other tabs of this browser (BroadcastChannel, always)
// and to the other devices of the workspace (Supabase Realtime Broadcast, when configured; realtime.ts). A tab
// of this browser hears a message on both ways, so each message carries a key and the second copy is dropped.

import { isMsg, Seen, type PresenceMsg, type Where } from "./presence";
import { openLive, type LiveChannel, type LiveStatus } from "./realtime";

export interface Bus {
  post(m: PresenceMsg): void;
  close(): void;
}

interface Envelope {
  k: string;
  m: PresenceMsg;
}

const isEnvelope = (v: unknown): v is Envelope => !!v && typeof v === "object" && typeof (v as Envelope).k === "string" && (v as Envelope).k.length <= 120 && isMsg((v as Envelope).m);

/**
 * Open the ways to the other tabs and devices of a workspace (`wsId` null: this browser's tabs only).
 * `onMsg(m, where)`: a message from someone else; `onLive`: whether the devices' channel works.
 */
export function openBus(wsId: string | null, tab: string, onMsg: (m: PresenceMsg, where: Where) => void, onLive: (s: LiveStatus) => void): Bus {
  const seen = new Seen();
  let n = 0;
  let closed = false;
  let live: LiveChannel | null = null;
  const take = (v: unknown, where: Where) => {
    if (!isEnvelope(v) || v.m.tab === tab || !seen.fresh(v.k)) return;
    onMsg(v.m, where);
  };
  const chan = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(`simple-karte:presence:${wsId ?? "local"}`);
  if (chan) chan.onmessage = (e: MessageEvent) => take(e.data, "タブ");
  if (wsId) {
    void openLive(wsId, (p) => take(p, "端末"), onLive).then((c) => {
      if (!c) return onLive("off");
      if (closed) return c.close();
      live = c;
    });
  } else onLive("off");
  return {
    post: (m) => {
      const env: Envelope = { k: `${tab}:${++n}`, m };
      try {
        chan?.postMessage(env);
      } catch {}
      live?.send(env as unknown as Record<string, unknown>);
    },
    close: () => {
      closed = true;
      chan?.close();
      live?.close();
      live = null;
    },
  };
}
