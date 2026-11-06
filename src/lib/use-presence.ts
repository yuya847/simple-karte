"use client";

// 同時利用 in the browser: the other tabs of this browser and, when the workspace is configured, the other
// devices (bus.ts: BroadcastChannel and Supabase Realtime Broadcast; and the presence table of
// supabase/schema.sql when it was made). When someone else saved, the newer records are read and merged in
// at once (useWorkspace.pull); when the devices' channel is not available, the saved records are checked
// every 30 seconds instead. See presence.ts for the rules.

import { useEffect, useRef, useState, type RefObject } from "react";
import { openBus, type Bus } from "./bus";
import { editorsOf, editorsOn, EMPTY_PRESENCE, livePeers, receive, savedElsewhere, thisTab, withDevices, type NoteEditor, type Peer, type PresenceMsg, type PresenceState, type Where } from "./presence";
import type { LiveStatus } from "./realtime";
import type { Pulled } from "./use-workspace";
import { touchPresence, workspaceOn } from "./workspace";

/** How long after the last keystroke a chart counts as being written in. */
const EDIT_MS = 120_000;
/** Without the devices' channel, the saved records are checked this often. */
const POLL_MS = 30_000;
const hhmm = (d = new Date()) => d.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false });

export type DeviceWatch = "unknown" | "on" | "off";

/** Newer records of someone else were merged into this page. */
export interface Merged {
  by: string;
  role: string;
  at: string;
  where: Where;
  changed: string[];
}

/** For the notes on the left: who else is correcting a note, and telling them what this page types. */
export interface Coedit {
  myTab: string;
  editors: (noteKey: string) => NoteEditor[];
  typing: (m: { patient: string; note: string; label: string; text: string; cursor: number }) => void;
  done: (noteKey: string) => void;
}

interface Args {
  /** The workspace (null: the records are not saved). */
  wsId: string | null;
  /** The records are saved for the workspace and read back (another page's save brings newer records). */
  shared: boolean;
  me: { name: string; role: string };
  /** The chart in front. */
  patientId: string | null;
  /** That chart's note and number of drafts (to tell whether it is being written in). */
  note: string;
  drafts: number;
  /** Filled with what to do after each save of this page (tell the other tabs and devices). */
  savedRef: RefObject<(() => void) | null>;
  /** Read and merge the records saved elsewhere (useWorkspace.pull). */
  pull: () => Promise<Pulled | null>;
  /** After newer records were merged in. */
  onMerged?: (m: Merged) => void;
}

export function usePresence({ wsId, shared, me, patientId, note, drafts, savedRef, pull, onMerged }: Args) {
  const [tab] = useState(thisTab);
  const [state, setState] = useState<PresenceState>(EMPTY_PRESENCE);
  const [now, setNow] = useState(0);
  const [devices, setDevices] = useState<DeviceWatch>("unknown");
  const [live, setLive] = useState<LiveStatus>("unknown");
  const [merged, setMerged] = useState<Merged | null>(null);
  const bus = useRef<Bus | null>(null);
  const pending = useRef<{ patient: string; what: string }[]>([]);
  // The workspace's last save as this page last knew it (other devices), and whether to take the next one as it is.
  const base = useRef<string | null>(null);

  const liveRef = useRef({ me, patientId, drafts, shared, pull, onMerged });
  useEffect(() => {
    liveRef.current = { me, patientId, drafts, shared, pull, onMerged };
  });
  // Writing: the note of the same chart changed in the last two minutes, or the chart has drafts.
  const editAt = useRef(0);
  const prev = useRef({ patientId, note });
  useEffect(() => {
    if (prev.current.patientId === patientId && prev.current.note !== note) editAt.current = Date.now();
    prev.current = { patientId, note };
  }, [patientId, note]);
  const editingNow = () => !!liveRef.current.patientId && (liveRef.current.drafts > 0 || Date.now() - editAt.current < EDIT_MS);
  const hereMsg = (hello = false): PresenceMsg => ({ t: "here", tab, who: liveRef.current.me.name, role: liveRef.current.me.role, patient: liveRef.current.patientId, editing: editingNow(), ...(hello ? { hello: true } : {}) });

  // The other tabs of this browser and the other devices.
  useEffect(() => {
    const b = openBus(
      wsId,
      tab,
      (m, where) => {
        setState((s) => receive(s, m, Date.now(), liveRef.current.shared, where));
        setNow(Date.now());
        // A tab that just opened says hello; answer so that it sees this one at once.
        if (m.t === "here" && m.hello) b.post(hereMsg());
      },
      setLive,
    );
    bus.current = b;
    b.post(hereMsg(true));
    const tick = setInterval(() => {
      b.post(hereMsg());
      setNow(Date.now());
    }, 5000);
    const bye = () => b.post({ t: "bye", tab });
    window.addEventListener("pagehide", bye);
    return () => {
      bye();
      clearInterval(tick);
      window.removeEventListener("pagehide", bye);
      b.close();
      bus.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId, tab]);

  // Say at once when the chart in front, its drafts or the person change (writing is told with the next tick).
  useEffect(() => {
    bus.current?.post(hereMsg());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, drafts > 0, me.name]);

  // After each save: tell the other tabs and devices what this page confirmed since the last save.
  useEffect(() => {
    savedRef.current = () => {
      const changes = pending.current.splice(0, 50);
      base.current = null;
      bus.current?.post({ t: "saved", tab, who: liveRef.current.me.name, role: liveRef.current.me.role, at: hhmm(), changes });
    };
  });

  // Someone else saved: read the newer records and merge them in, then say whose changes came in.
  const stale = state.stale;
  useEffect(() => {
    if (!stale) return;
    let gone = false;
    liveRef.current
      .pull()
      .then((r) => {
        if (gone) return;
        setState((s) => (s.stale === stale ? { ...s, stale: null } : s));
        if (!r) return;
        const m: Merged = { by: r.by ?? stale.by, role: r.role ?? stale.role, at: stale.at, where: stale.where, changed: r.changed };
        setMerged(m);
        liveRef.current.onMerged?.(m);
      })
      .catch(() => {
        if (!gone) setState((s) => (s.stale === stale ? { ...s, stale: null } : s));
      });
    return () => {
      gone = true;
    };
  }, [stale]);
  // The notice goes away by itself.
  useEffect(() => {
    if (!merged) return;
    const t = setTimeout(() => setMerged(null), 8000);
    return () => clearTimeout(t);
  }, [merged]);

  // Without the devices' channel: look for records saved elsewhere every 30 seconds.
  useEffect(() => {
    if (!wsId || !shared || live !== "off") return;
    const t = setInterval(() => {
      void liveRef.current.pull().then((r) => {
        if (!r) return;
        const m: Merged = { by: r.by ?? "誰か", role: r.role ?? "", at: hhmm(), where: "端末", changed: r.changed };
        setMerged(m);
        liveRef.current.onMerged?.(m);
      });
    }, POLL_MS);
    return () => clearInterval(t);
  }, [wsId, shared, live]);

  // The other devices (only when the workspace has the presence table; stops at the first failure).
  useEffect(() => {
    if (!wsId || !shared || !workspaceOn()) return;
    let stopped = false;
    const poll = async () => {
      try {
        const rows = await touchPresence(wsId, { tab, who: liveRef.current.me.name, role: liveRef.current.me.role, patient: liveRef.current.patientId, editing: editingNow() });
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
  const coedit: Coedit = {
    myTab: tab,
    editors: (noteKey) => (now ? editorsOf(state, noteKey, now) : []),
    typing: (m) => bus.current?.post({ t: "edit", tab, who: liveRef.current.me.name, role: liveRef.current.me.role, ...m }),
    done: (noteKey) => bus.current?.post({ t: "edit-end", tab, note: noteKey }),
  };
  return {
    tab,
    devices,
    /** Whether the devices' channel works ("off": the saved records are checked every 30 seconds instead). */
    live,
    /** Newer records of someone else were just merged in (shown for a few seconds). */
    merged,
    dismiss: () => setMerged(null),
    /** The others with this chart open. */
    on: (pid: string) => peers.filter((p) => p.patient === pid && !(p.who === me.name && p.role === me.role)),
    /** Who is correcting a note of this patient. */
    editorsOn: (pid: string) => (now ? editorsOn(state, pid, now) : []),
    coedit,
    /** Confirm a note or an order: remember what for the other pages, then do it. */
    guard: (pid: string, what: string, run: () => void) => {
      pending.current.push({ patient: pid, what });
      run();
    },
  };
}
