"use client";

import { useEffect, useRef, useState } from "react";
import { loadWorkspace, resetWorkspace, saveWorkspace, workspaceId, workspaceOn } from "./workspace";

export type WorkspaceStatus = "off" | "loading" | "saved" | "saving" | "error";

/**
 * Keeps the given states in the workspace: reads them back once when the page opens (same day only), then
 * saves a second after any of them changes. `states` maps a name to [value, setter]; its keys must stay the same.
 */
export function useWorkspace(states: Record<string, [unknown, (v: never) => void]>, day: string | null) {
  const [status, setStatus] = useState<WorkspaceStatus>("off");
  const [id, setId] = useState<string | null>(null);
  const loaded = useRef(false);
  const statesRef = useRef(states);
  useEffect(() => {
    statesRef.current = states;
  });

  // Read back once.
  useEffect(() => {
    if (!day || !workspaceOn() || loaded.current) return;
    const ws = workspaceId();
    setId(ws);
    setStatus("loading");
    loadWorkspace(ws, day)
      .then((data) => {
        if (data) for (const [k, v] of Object.entries(data)) statesRef.current[k]?.[1](v as never);
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
    setStatus("saving");
    const t = setTimeout(() => {
      const data = Object.fromEntries(Object.entries(statesRef.current).map(([k, [v]]) => [k, v]));
      saveWorkspace(id, day, data).then(
        () => setStatus("saved"),
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
  return { status, id, reset };
}
