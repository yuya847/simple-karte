"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { workspaceOn } from "../workspace";
import { scenarioStorageKey } from "../scenarios/mode";
import type { SessionChanges } from "../record";
import type { Patient } from "../types";
import type { IcuRecords, Infusion } from "./types";

type Changes = Pick<SessionChanges, "added" | "stopped" | "stopTimes" | "stopDays">;
interface Snapshot { day: string; infusions: Infusion[]; charts: Record<string, Changes> }
export function infusionSnapshot(day: string, infusions: Infusion[], charts: Record<string, SessionChanges>, patients: Patient[]): Snapshot {
  const ids = new Set([...patients.flatMap(p => p.history), ...Object.values(charts).flatMap(c => c.added)].flatMap(e => e.kind === "order" && e.order.type === "injection" && e.order.continuous ? [e.id] : []));
  return { day, infusions, charts: Object.fromEntries(Object.entries(charts).filter(([id]) => !id.includes("|")).map(([id, c]) => {
    const stopped = c.stopped.filter(id => ids.has(id));
    return [id, { added: c.added.filter(e => e.order.type === "injection" && e.order.continuous), stopped,
      stopTimes: Object.fromEntries(stopped.flatMap(id => c.stopTimes?.[id] ? [[id, c.stopTimes[id]]] : [])),
      stopDays: Object.fromEntries(stopped.flatMap(id => c.stopDays?.[id] !== undefined ? [[id, c.stopDays[id]]] : [])) }];
  }).filter(([, c]) => (c as Changes).added.length || (c as Changes).stopped.length)) };
}
export function readInfusionSnapshot(raw: string | null, day: string): Snapshot | null {
  try { const s = JSON.parse(raw ?? "null"); return s?.day === day && Array.isArray(s.infusions) && s.charts && typeof s.charts === "object" ? s : null; }
  catch { return null; }
}
export function restoreInfusionChanges<T extends SessionChanges>(all: Record<string, T>, saved: Snapshot, blank: () => T): Record<string, T> {
  const next = { ...all };
  for (const [id, changes] of Object.entries(saved.charts)) {
    const c = next[id] ?? blank();
    next[id] = { ...c, added: [...c.added.filter(e => !changes.added.some(x => x.id === e.id)), ...changes.added], stopped: [...new Set([...c.stopped, ...changes.stopped])], stopTimes: { ...c.stopTimes, ...changes.stopTimes }, stopDays: { ...c.stopDays, ...changes.stopDays } };
  }
  return next;
}
/** Shared storage stays authoritative. Standalone demos restore only the pump records and their orders, on the same day. */
export function useInfusionPersistence<T extends SessionChanges>(icu: IcuRecords, charts: Record<string, T>, patients: Patient[], day: string | null, setIcu: Dispatch<SetStateAction<IcuRecords>>, setCharts: Dispatch<SetStateAction<Record<string, T>>>, blank: () => T) {
  const initial = useRef({ setIcu, setCharts, blank });
  const skip = useRef(true);
  const key = scenarioStorageKey("simple-karte:infusion-orders");
  useEffect(() => {
    if (workspaceOn() || !day) return;
    skip.current = true;
    try {
      const s = readInfusionSnapshot(localStorage.getItem(key), day);
      if (!s) return;
      initial.current.setIcu(all => ({ ...all, infusions: [...all.infusions.filter(i => !s.infusions.some(x => x.id === i.id)), ...s.infusions] }));
      initial.current.setCharts(all => restoreInfusionChanges(all, s, initial.current.blank));
    } catch { /* Keep the session usable if browser storage is unavailable. */ }
  }, [key, day]);
  useEffect(() => {
    if (workspaceOn() || !day) return;
    if (skip.current) { skip.current = false; return; }
    try { localStorage.setItem(key, JSON.stringify(infusionSnapshot(day, icu.infusions, charts, patients))); }
    catch { /* Keep the session usable if browser storage is unavailable. */ }
  }, [icu.infusions, charts, patients, day, key]);
}
