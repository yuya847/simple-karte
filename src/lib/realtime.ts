"use client";

// 端末のあいだのやりとり (Supabase Realtime Broadcast): one channel per workspace carries the small messages of
// presence.ts (who is here, who saved, who is typing which note) to the other devices. Nothing is stored:
// Broadcast only passes messages between the connected clients, so no table or SQL is needed; the project's
// Realtime service must be on and public channels allowed (both are the defaults). The client library is
// loaded only here and only when the workspace is configured (the records themselves go through the RPCs of
// workspace.ts). Docs: https://supabase.com/docs/guides/realtime/broadcast and /realtime/settings .

import { supabaseEnv } from "./workspace";

export type LiveStatus = "unknown" | "on" | "off";

export interface LiveChannel {
  send(payload: Record<string, unknown>): void;
  close(): void;
}

/** The channel name of a workspace ('realtime' alone is reserved by Supabase). */
export const channelName = (wsId: string) => `simple-karte:ws:${wsId}`;

/**
 * Join the workspace's channel. `onMsg` gets every payload the other devices send; `onStatus` says whether the
 * channel is working ("off" after an error or a timeout: the caller then polls instead). Resolves to null when
 * the workspace is not configured or the library cannot be loaded.
 */
export async function openLive(wsId: string, onMsg: (payload: unknown) => void, onStatus: (s: LiveStatus) => void): Promise<LiveChannel | null> {
  const env = supabaseEnv();
  if (!env) return null;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
    const channel = client.channel(channelName(wsId), { config: { broadcast: { self: false, ack: false } } });
    channel.on("broadcast", { event: "msg" }, (e: { payload?: unknown }) => onMsg(e.payload));
    channel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") onStatus("on");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onStatus("off");
    });
    return {
      send: (payload) => {
        void channel.send({ type: "broadcast", event: "msg", payload }).catch(() => undefined);
      },
      close: () => {
        void client.removeChannel(channel).catch(() => undefined);
      },
    };
  } catch {
    // The caller takes null as "off".
    return null;
  }
}
