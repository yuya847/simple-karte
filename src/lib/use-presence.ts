"use client";

// 同時利用の警告と排他制御 in the browser: the other tabs of this browser (BroadcastChannel) and, when the
// workspace has the presence table (supabase/schema.sql), the other devices. See presence.ts for the rules.

import { useEffect, useRef, useState, type RefObject } from "react";
import { EMPTY_PRESENCE, isMsg, livePeers, receive, savedElsewhere, thisTab, withDevices, type Peer, type PresenceMsg, type PresenceState } from "./presence";
import { touchPresence, workspaceOn } from "./workspace";

/** How long after the last keystroke a chart counts as being written in. */
const EDIT_MS = 120_000;
const hhmm = (d = new Date()) => d.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false });

export type DeviceWatch = "unknown" | "on" | "off";

interface Args {
  /** The workspace (null: the records are not saved). */
  wsId: string | null;
  /** The records are saved for the workspace and read back (another tab's save makes this page's older). */
  shared: boolean;
  me: { name: string; role: string };
  /** The chart in front. */
  patientId: string | null;
  /** That chart's note and number of drafts (to tell whether it is being written in). */
  note: string;
  drafts: number;
  /** Set to true while this page's records are older than the saved ones (useWorkspace stops saving). */
  holdRef: RefObject<boolean>;
  /** Filled with what to do after each save of this page (tell the other tabs). */
  savedRef: RefObject<(() => void) | null>;
}

export function usePresence({ wsId, shared, me, patientId, note, drafts, holdRef, savedRef }: Args) {
  const [tab] = useState(thisTab);
  const [state, setState] = useState<PresenceState>(EMPTY_PRESENCE);
  const [now, setNow] = useState(0);
  const [devices, setDevices] = useState<DeviceWatch>("unknown");
  const [ask, setAsk] = useState<{ patientId: string; what: string } | null>(null);
  const chan = useRef<BroadcastChannel | null>(null);
  const pending = useRef<{ patient: string; what: string }[]>([]);
  // The workspace's last save as this page last knew it (other devices), and whether to take the next one as it is.
  const base = useRef<string | null>(null);

  const live = useRef({ me, patientId, drafts, shared });
  useEffect(() => {
    live.current = { me, patientId, drafts, shared };
  });
  // Writing: the note of the same chart changed in the last two minutes, or the chart has drafts.
  const editAt = useRef(0);
  const prev = useRef({ patientId, note });
  useEffect(() => {
    if (prev.current.patientId === patientId && prev.current.note !== note) editAt.current = Date.now();
    prev.current = { patientId, note };
  }, [patientId, note]);
  const editingNow = () => !!live.current.patientId && (live.current.drafts > 0 || Date.now() - editAt.current < EDIT_MS);
  const hereMsg = (hello = false): PresenceMsg => ({ t: "here", tab, who: live.current.me.name, role: live.current.me.role, patient: live.current.patientId, editing: editingNow(), ...(hello ? { hello: true } : {}) });

  // The other tabs of this browser.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const c = new BroadcastChannel(`simple-karte:presence:${wsId ?? "local"}`);
    chan.current = c;
    c.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (!isMsg(m) || m.tab === tab) return;
      setState((s) => receive(s, m, Date.now(), live.current.shared));
      setNow(Date.now());
      // A tab that just opened says hello; answer so that it sees this one at once.
      if (m.t === "here" && m.hello) c.postMessage(hereMsg());
    };
    c.postMessage(hereMsg(true));
    const tick = setInterval(() => {
      c.postMessage(hereMsg());
      setNow(Date.now());
    }, 5000);
    const bye = () => c.postMessage({ t: "bye", tab } satisfies PresenceMsg);
    window.addEventListener("pagehide", bye);
    return () => {
      bye();
      clearInterval(tick);
      window.removeEventListener("pagehide", bye);
      c.close();
      chan.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId, tab]);

  // Say at once when the chart in front, its drafts or the person change (writing is told with the next tick).
  useEffect(() => {
    chan.current?.postMessage(hereMsg());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, drafts > 0, me.name]);

  // After each save: tell the other tabs what this page confirmed since the last save.
  useEffect(() => {
    savedRef.current = () => {
      const changes = pending.current.splice(0, 50);
      base.current = null;
      chan.current?.postMessage({ t: "saved", tab, who: live.current.me.name, role: live.current.me.role, at: hhmm(), changes } satisfies PresenceMsg);
    };
  });

  // While the saved records are newer than this page's, useWorkspace does not save.
  useEffect(() => {
    holdRef.current = !!state.stale;
  }, [state.stale, holdRef]);

  // The other devices (only when the workspace has the presence table; stops at the first failure).
  useEffect(() => {
    if (!wsId || !shared || !workspaceOn()) return;
    let stopped = false;
    const poll = async () => {
      try {
        const rows = await touchPresence(wsId, { tab, who: live.current.me.name, role: live.current.me.role, patient: live.current.patientId, editing: editingNow() });
        if (stopped) return;
        const others = rows.filter((r) => r.tab && r.who && r.role).map((r) => ({ tab: r.tab!, who: r.who!, role: r.role!, patient: r.patient, editing: !!r.editing }));
        setState((s) => {
          let next = withDevices(s, others, Date.now());
          const stamp = rows[0];
          if (stamp?.ws_updated) {
            const mine = stamp.ws_writer === tab;
            // Another tab of this browser is heard of through the channel already.
            const knownTab = !!stamp.ws_writer && s.peers[stamp.ws_writer]?.where === "タブ";
            if (base.current === null || mine || knownTab) base.current = stamp.ws_updated;
            else if (stamp.ws_updated !== base.current) {
              base.current = stamp.ws_updated;
              next = savedElsewhere(next, stamp.ws_by ?? "誰か", "", hhmm(new Date(stamp.ws_updated)));
            }
          }
          return next;
        });
        setDevices("on");
        setNow(Date.now());
      } catch {
        stopped = true;
        setDevices("off");
      }
    };
    void poll();
    const t = setInterval(() => !stopped && void poll(), 10_000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [wsId, shared, tab]);

  const peers: Peer[] = now ? livePeers(state, now) : [];
  return {
    tab,
    devices,
    stale: state.stale,
    /** The others with this chart open. */
    on: (pid: string) => peers.filter((p) => p.patient === pid),
    /** Confirm a note or an order: at once when this page's records are the newest; else ask to read them first. */
    guard: (pid: string, what: string, run: () => void) => {
      if (state.stale && shared) return setAsk({ patientId: pid, what });
      pending.current.push({ patient: pid, what });
      run();
    },
    ask,
    cancelAsk: () => setAsk(null),
    /** The newest records were read into this page. */
    caughtUp: () => {
      base.current = null;
      setAsk(null);
      setState((s) => ({ ...s, stale: null }));
    },
  };
}
