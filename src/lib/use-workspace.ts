"use client";

import { workspaceRecords } from "./workspace-records";
import { useEffect, useRef, useState } from "react";
import { mergeWorkspace, sameJson, type MergeOptions } from "./merge-workspace";
import { thisTab } from "./presence";
import { loadWorkspaceRow, resetWorkspace, saveMergedWorkspace, workspaceId, workspaceOn, setWorkspaceSeed } from "./workspace";

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

/** A save goes out this long after the last change. */
const SAVE_MS = 1000;

/**
 * Keeps the given states in the workspace: reads them back once when the page opens (same day only), then
 * saves a second after any of them changes. When another tab or device saved in between, `pull` reads the
 * newer records and merges them in (several people on one chart at once), and the next save carries both.
 * `states` maps a name to [value, setter]; its keys must stay the same.
 */
export function useWorkspace(inputStates: Record<string, [unknown, (v: never) => void]>, day: string | null, opts: WorkspaceOptions = {}) {
  const states = workspaceRecords(inputStates);
  const [status, setStatus] = useState<WorkspaceStatus>("off");
  const [id, setId] = useState<string | null>(null);
  const loaded = useRef(false);
  // Just read back: putting the records into the states is not a change to save (nor to tell the other tabs).
  const echo = useRef<Record<string, unknown> | null>(null);
  // Something changed here since the last save.
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The records this page read or saved last (the base of a merge), and when the row was saved as last seen.
  const base = useRef<Record<string, unknown> | null>(null);
  const seenAt = useRef<string | null>(null);
  const pulling = useRef<Promise<Pulled | null> | null>(null);
  // The rendered records accepted from a load/save; receiving them alone is never a local edit.
  const accepted = useRef<Record<string, unknown> | null>(null);
  const failures = useRef(0);
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

  const warnConflicts = (paths: string[]) => {
    const labels: Record<string, string> = { calls: "パニック値の連絡", acks: "結果の確認", notes: "記事", revised: "記事の訂正", labDesk: "検査記録", charts: "カルテ" };
    const message = [...new Set(paths.map((p) => labels[p.split(".")[0]] ?? "記録"))].join("、");
    if (message) {
      window.alert(`同じ項目が別の端末でも変更されました。この端末の入力を保持しました。記録を確認してください。\n${message}`);
    }
  };
  const snapshot = () => ({ ...Object.fromEntries(Object.entries(statesRef.current).map(([k, [v]]) => [k, v])), ...(putting.current ?? {}) });
  const putBack = (data: Record<string, unknown>) => {
    data = workspaceRecords(data);
    echo.current = data;
    putting.current = data;
    for (const [k, v] of Object.entries(data)) statesRef.current[k]?.[1](v as never);
  };

  const saving = useRef<Promise<void> | null>(null);
  const saveAgain = useRef(false);
  const performSave = async () => {
    const ws = idRef.current;
    const d = dayRef.current;
    if (!ws || !d || !loaded.current) return;
    // Newer records are being read: they go into the states first, so that the save carries them too.
    if (pulling.current) await pulling.current.catch(() => null);
    if (sameJson(snapshot(), accepted.current)) { dirty.current = false; setStatus("saved"); return; }
    dirty.current = false;
    saveAgain.current = false;
    const data = snapshot();
    try {
      const saved = await saveMergedWorkspace(ws, d, data, base.current, optsRef.current.merge);
      // Include edits made while the request was in flight.
      const latest = mergeWorkspace(snapshot(), saved.data, data, optsRef.current.merge);
      warnConflicts(saved.conflicts);
      putBack(latest.data);
      base.current = saved.data;
      accepted.current = saved.data;
      failures.current = 0;
      if (latest.kept.length) { dirty.current = true; saveAgain.current = true; }
      setStatus(dirty.current ? "saving" : "saved");
      optsRef.current.onSaved?.();
    } catch {
      dirty.current = true;
      setStatus("error");
      failures.current++;
      if (!timer.current) timer.current = setTimeout(() => { timer.current = null; void save(); }, Math.min(60000, 2000 * 2 ** Math.min(failures.current - 1, 5)));
    }
  };
  const save = (): Promise<void> => {
    if (saving.current) return saving.current;
    saving.current = performSave().finally(() => {
      saving.current = null;
      if (dirty.current && saveAgain.current) schedule();
    });
    return saving.current;
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
    const initial = snapshot();
    setWorkspaceSeed(initial);
    accepted.current = initial;
    loadWorkspaceRow(ws, day)
      .then((row) => {
        if (row) {
          const merged = mergeWorkspace(snapshot(), row.data, initial, optsRef.current.merge);
          putBack(merged.data);
          accepted.current = mergeWorkspace(initial, row.data, initial, optsRef.current.merge).data;
          dirty.current = !sameJson(merged.data, accepted.current);
          base.current = row.data;
          seenAt.current = row.updatedAt;

        }
        if (!row) dirty.current = !sameJson(snapshot(), accepted.current);
        loaded.current = true;
        setStatus("saved");
        if (dirty.current) schedule();
      })
      .catch(() => {
        loaded.current = true;
        setStatus("error");
      });
    // One initial read per day; scheduling reads the current values from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  // Save a second after a change.
  const values = Object.values(states).map(([v]) => v);
  useEffect(() => {
    if (!day || !id || !loaded.current) return;
    // The records just read back (and what follows from them in the same moment) are not saved again.
    if (sameJson(snapshot(), accepted.current)) return;
    if (echo.current) {
      const incoming = echo.current;
      echo.current = null;
      if (sameJson(snapshot(), incoming)) return;
    }
    dirty.current = true;
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
    setStatus("saving");
    await save();
    if (dirty.current) throw new Error("not saved");
  };
  /**
   * Read the records saved since (by another tab or device) and merge them into this page's. Null when
   * nothing newer is saved, or the last save was this page's own. Runs once at a time.
   */
  const pull = (): Promise<Pulled | null> => {
    if (saving.current) return Promise.resolve(null);
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
      warnConflicts(r.conflicts);
      if (r.changed.length) putBack(r.data);
      base.current = row.data;
      // Only a local edit can request a save; receiving data never starts an echo.
      if (!dirty.current) accepted.current = r.data;
      return { by: writer?.by ?? null, role: writer?.role ?? null, changed: r.changed };
    })();
    pulling.current = p.finally(() => {
      pulling.current = null;
    });
    return pulling.current;
  };
  return { status, id, reset, saveNow, pull };
}
