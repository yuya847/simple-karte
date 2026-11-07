import { scenarioStorageKey } from "./scenarios/mode";

type Records = Record<string, unknown>;
export interface PendingWorkspace { data: Records; base: Records | null }
const key = (ws: string, day: string) => scenarioStorageKey(`simple-karte:pending:${ws}:${day}`);

/** Best effort only: blocked storage or a full device must never block chart entry. */
export function readPending(ws: string, day: string): PendingWorkspace | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(key(ws, day)) ?? "null");
    return value && typeof value.data === "object" && value.data !== null && !Array.isArray(value.data) &&
      (value.base === null || typeof value.base === "object" && !Array.isArray(value.base)) ? value : null;
  } catch { return null; }
}
export function writePending(ws: string, day: string, data: Records, base: Records | null) {
  try { window.localStorage.setItem(key(ws, day), JSON.stringify({ data, base })); } catch {}
}
export function clearPending(ws: string, day: string) {
  try { window.localStorage.removeItem(key(ws, day)); } catch {}
}
