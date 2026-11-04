"use client";

import { useEffect, useRef, useState } from "react";
import { mergeWorkspace, type MergeOptions } from "./merge-workspace";
import { thisTab } from "./presence";
import { loadWorkspaceRow, resetWorkspace, saveWorkspace, workspaceId, workspaceOn } from "./workspace";

export type WorkspaceStatus = "off" | "loading" | "saved" | "saving" | "error";

export interface WorkspaceOptions {
  /** Called after each save of this page's records (to tell the other tabs and devices). */
  onSaved?: () => void;
  /** How the records saved elsewhere are merged into this page's (merge-workspace.ts). */
  merge?: MergeOptions;
}

/** What `pull` found: whose newer records came in, and which records changed here. */
export interface Pulled {
  by: string | null;
  role: string | null;
  changed: string[];
}

/** How long after the records are read back their own echo is not saved again (they did not change). */
const ECHO_MS = 1500;
/** A save goes out this long after the last change. */
const SAVE_MS = 1000;

/**
 * Keeps the given states in the workspace: reads them back once when the page opens (same day only), then
 * saves a second after any of them changes. When another tab or device saved in between, `pull` reads the
 * newer records and merges them in (several people on one chart at once), and the next save carries both.
 * `states` maps a name to [value, setter]; its keys must stay the same.
 */
export function useWorkspace(states: Record<string, [unknown, (v: never) => void]>, day: string | null, opts: WorkspaceOptions = {}) {
  const [status, setStatus] = useState<WorkspaceStatus>("off");
  const [id, setId] = useState<string | null>(null);
  const loaded = useRef(false);
  // Just read back: putting the records into the states is not a change to save (nor to tell the other tabs).
  const echo = useRef(false);
  // Something changed here since the last save.
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The records this page read or saved last (the base of a merge), and when the row was saved as last seen.
  const base = useRef<Record<string, unknown> | null>(null);
  const seenAt = useRef<string | null>(null);
  const pulling = useRef<Promise<Pulled | null> | null>(null);
  // Saves made only because a merge kept something the saved side lacked, since the last change here (capped, so two pages never save back and forth).
  const mergeSaves = useRef(0);
  const statesRef = useRef(states);
  // Records just put into the states, until the page has rendered with them (a save in between takes these).
  const putting = useRef<Record<string, unknown> | null>(null);
  const optsRef = useRef(opts);
  const dayRef = useRef(day);
  const idRef = useRef(id);
  useEffect(() => {
    statesRef.current = states;
    putting.current = null;
    optsRef.current = opts;
    dayRef.current = day;
    idRef.current = id;
  });

  const snapshot = () => ({ ...Object.fromEntries(Object.entries(statesRef.current).map(([k, [v]]) => [k, v])), ...(putting.current ?? {}) });
  const putBack = (data: Record<string, unknown>) => {
    echo.current = true;
    setTimeout(() => (echo.current = false), ECHO_MS);
    putting.current = data;
    for (const [k, v] of Object.entries(data)) statesRef.current[k]?.[1](v as never);
  };

  const save = async () => {
    const ws = idRef.current;
    const d = dayRef.current;
    if (!ws || !d || !loaded.current) return;
    // Newer records are being read: they go into the states first, so that the save carries them too.
    if (pulling.current) await pulling.current.catch(() => null);
    dirty.current = false;
    const data = snapshot();
    try {
      await saveWorkspace(ws, d, data);
      base.current = data;
      setStatus("saved");
      optsRef.current.onSaved?.();
    } catch {
      dirty.current = true;
      setStatus("error");
    }
  };
  const schedule = () => {
    if (timer.current) return;
    setStatus("saving");
    timer.current = setTimeout(() => {
      timer.current = null;
      void save();
    }, SAVE_MS);
  };

  // Read back once.
  useEffect(() => {
    if (!day || !workspaceOn() || loaded.current) return;
    const ws = workspaceId();
    setId(ws);
    setStatus("loading");
    loadWorkspaceRow(ws, day)
      .then((row) => {
        if (row) {
          putBack(row.data);
          base.current = row.data;
          seenAt.current = row.updatedAt;
        }
        loaded.current = true;
        setStatus("saved");
      })
      .catch(() => {
        loaded.current = true;
        setStatus("error");
      });
  }, [day]);

  // Save a second after a change.
  const values = Object.values(states).map(([v]) => v);
  useEffect(() => {
    if (!day || !id || !loaded.current) return;
    // The records just read back (and what follows from them in the same moment) are not saved again.
    if (echo.current) return;
    dirty.current = true;
    mergeSaves.current = 0;
    schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, id, ...values]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const reset = async () => {
    if (id) await resetWorkspace(id).catch(() => undefined);
    window.location.reload();
  };
  /** Save now (before the page is reloaded), without waiting for the second after a change. */
  const saveNow = async () => {
    if (!day || !id || !loaded.current) throw new Error("not saved");
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    await save();
    if (dirty.current) throw new Error("not saved");
  };
  /**
   * Read the records saved since (by another tab or device) and merge them into this page's. Null when
   * nothing newer is saved, or the last save was this page's own. Runs once at a time.
   */
  const pull = (): Promise<Pulled | null> => {
    if (pulling.current) return pulling.current;
    const ws = idRef.current;
    const d = dayRef.current;
    if (!ws || !d || !loaded.current) return Promise.resolve(null);
    const p = (async (): Promise<Pulled | null> => {
      const row = await loadWorkspaceRow(ws, d);
      if (!row || (row.updatedAt !== null && row.updatedAt === seenAt.current)) return null;
      seenAt.current = row.updatedAt;
      const writer = (row.data.__writer ?? null) as { tab?: string; by?: string; role?: string } | null;
      if (writer?.tab === thisTab()) return null;
      const r = mergeWorkspace(snapshot(), row.data, base.current, optsRef.current.merge);
      if (r.changed.length) putBack(r.data);
      base.current = r.data;
      // This page holds records the saved side lacks (it saved before hearing of them): the merged records go out.
      if (r.kept.length && !dirty.current && mergeSaves.current < 3) {
        mergeSaves.current++;
        dirty.current = true;
        schedule();
      }
      return { by: writer?.by ?? null, role: writer?.role ?? null, changed: r.changed };
    })();
    pulling.current = p.finally(() => {
      pulling.current = null;
    });
    return pulling.current;
  };
  return { status, id, reset, saveNow, pull };
}
