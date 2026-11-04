"use client";

import { useEffect, useRef, useState } from "react";
import { loadWorkspace, resetWorkspace, saveWorkspace, workspaceId, workspaceOn } from "./workspace";

export type WorkspaceStatus = "off" | "loading" | "saved" | "saving" | "error";

export interface WorkspaceOptions {
  /**
   * While it says true, nothing is saved: another tab or device saved newer records of the same workspace, and
   * this page (which has the older ones) would overwrite them (排他制御). Read at the time of each save.
   */
  hold?: () => boolean;
  /** Called after each save of this page's records (to tell the other tabs). */
  onSaved?: () => void;
}

/** How long after the records are read back their own echo is not saved again (they did not change). */
const ECHO_MS = 1500;

/**
 * Keeps the given states in the workspace: reads them back once when the page opens (same day only), then
 * saves a second after any of them changes. `states` maps a name to [value, setter]; its keys must stay the same.
 */
export function useWorkspace(states: Record<string, [unknown, (v: never) => void]>, day: string | null, opts: WorkspaceOptions = {}) {
  const [status, setStatus] = useState<WorkspaceStatus>("off");
  const [id, setId] = useState<string | null>(null);
  const loaded = useRef(false);
  // Just read back: putting the records into the states is not a change to save (nor to tell the other tabs).
  const echo = useRef(false);
  const statesRef = useRef(states);
  const optsRef = useRef(opts);
  useEffect(() => {
    statesRef.current = states;
    optsRef.current = opts;
  });

  const putBack = (data: Record<string, unknown>) => {
    echo.current = true;
    setTimeout(() => (echo.current = false), ECHO_MS);
    for (const [k, v] of Object.entries(data)) statesRef.current[k]?.[1](v as never);
  };

  // Read back once.
  useEffect(() => {
    if (!day || !workspaceOn() || loaded.current) return;
    const ws = workspaceId();
    setId(ws);
    setStatus("loading");
    loadWorkspace(ws, day)
      .then((data) => {
        if (data) putBack(data);
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
    if (echo.current || optsRef.current.hold?.()) return;
    setStatus("saving");
    const t = setTimeout(() => {
      if (optsRef.current.hold?.()) return setStatus("saved");
      const data = Object.fromEntries(Object.entries(statesRef.current).map(([k, [v]]) => [k, v]));
      saveWorkspace(id, day, data).then(
        () => {
          setStatus("saved");
          optsRef.current.onSaved?.();
        },
        () => setStatus("error"),
      );
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, id, ...values]);

  const reset = async () => {
    if (id) await resetWorkspace(id).catch(() => undefined);
    window.location.reload();
  };
  /** Save now (before the page is reloaded), without waiting for the second after a change. Held: nothing is saved. */
  const saveNow = async () => {
    if (!day || !id || !loaded.current) throw new Error("not saved");
    if (optsRef.current.hold?.()) return;
    const data = Object.fromEntries(Object.entries(statesRef.current).map(([k, [v]]) => [k, v]));
    await saveWorkspace(id, day, data);
    setStatus("saved");
    optsRef.current.onSaved?.();
  };
  /** Read the records saved now (by another tab or device) into this page, without reloading it. */
  const refresh = async (): Promise<boolean> => {
    if (!day || !id) return false;
    setStatus("loading");
    try {
      const data = await loadWorkspace(id, day);
      if (data) putBack(data);
      setStatus("saved");
      return true;
    } catch {
      setStatus("error");
      return false;
    }
  };
  return { status, id, reset, saveNow, refresh };
}
