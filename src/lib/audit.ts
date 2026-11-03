// Audit log: who did what and when, with "AI copied" kept apart from "a person decided".
// Append-only. In this prototype it lives in the browser's memory; a real system would send each
// event to storage that cannot be changed afterwards (e.g. a write-once log on the server).

import { useSyncExternalStore } from "react";

export type AuditRole = "AI" | "医師" | "看護師" | "薬剤師" | "臨床工学技士" | "事務";

export interface AuditEvent {
  seq: number;
  /** Clock time "HH:MM:SS" (Japan) when it happened. */
  at: string;
  role: AuditRole;
  actor: string;
  action: string;
  patient?: string;
  detail?: string;
}

let events: AuditEvent[] = [];
let seq = 0;
const listeners = new Set<() => void>();

const clock = () => new Date().toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

/** Add an event (append only: events are never changed or removed). */
export function auditLog(e: Omit<AuditEvent, "seq" | "at">): void {
  events = [...events, { ...e, seq: ++seq, at: clock() }];
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
/** The events so far (a new array after each event; never changed in place). */
export const auditSnapshot = () => events;
const snapshot = auditSnapshot;
const empty: AuditEvent[] = [];

export function useAudit(): AuditEvent[] {
  return useSyncExternalStore(subscribe, snapshot, () => empty);
}

/** The AI's share: drafts written by Claude, and what people did with them. */
export function aiSummary(list: AuditEvent[]) {
  const drafted = list.filter((e) => e.role === "AI").length;
  const confirmed = list.filter((e) => e.role !== "AI" && e.action.startsWith("確定")).length;
  const removed = list.filter((e) => e.action === "下書きを消した").length;
  return { drafted, confirmed, removed };
}

export const CLAUDE = "Claude（claude-opus-5-5）";
