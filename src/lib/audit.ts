// Audit log: who did what and when, with "AI copied" kept apart from "a person decided".
// Append-only. It lives in the browser's memory and, when the records are saved (Supabase), the newest
// AUDIT_KEEP events are saved with them, so a reload keeps them (the same day). A real system would send
// each event to storage that cannot be changed afterwards (e.g. a write-once log on the server; 安全管理
// ガイドライン 第7.0版 システム運用編 17 ② and 11.1 表11-1 の WORM).

import { useSyncExternalStore } from "react";
import type { Role } from "./roles";

export type AuditRole = "AI" | Role | "臨床工学技士" | "事務";

export interface AuditEvent {
  seq: number;
  /** Clock time "HH:MM:SS" (Japan) when it happened. */
  at: string;
  /** The day "YYYY-MM-DD" (Japan) when it happened (for the access log). */
  date?: string;
  role: AuditRole;
  actor: string;
  action: string;
  patient?: string;
  detail?: string;
  /** About a patient whose chart is limited (閲覧制限): shown apart in the access log. */
  restricted?: boolean;
}

let events: AuditEvent[] = [];
let seq = 0;
let restored = false;
const listeners = new Set<() => void>();

const clock = () => new Date().toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

const day = () => {
  const parts = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")}`;
};

/** Add an event (append only: events are never changed or removed). */
export function auditLog(e: Omit<AuditEvent, "seq" | "at" | "date">): void {
  events = [...events, { ...e, seq: ++seq, at: clock(), date: day() }];
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

/**
 * How many events go into the saved records (the newest ones). The saved row of a workspace holds at most
 * 5MB with every other record of the day, so the log saved there is capped; older events stay on screen
 * until the page is reloaded.
 */
export const AUDIT_KEEP = 2000;

/** The events to save: the newest AUDIT_KEEP (the same array when there are not more). */
export const auditForSave = (list: AuditEvent[]): AuditEvent[] => (list.length > AUDIT_KEEP ? list.slice(-AUDIT_KEEP) : list);

const ROLES_OK = new Set<string>(["AI", "医師", "看護師", "薬剤師", "臨床検査技師", "管理栄養士", "MSW", "医事課", "臨床工学技士", "事務"]);
const str = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
const isEvent = (v: unknown): v is AuditEvent => {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.seq === "number" &&
    str(e.at, 16) &&
    (e.date === undefined || str(e.date, 16)) &&
    typeof e.role === "string" &&
    ROLES_OK.has(e.role) &&
    str(e.actor, 200) &&
    str(e.action, 300) &&
    (e.patient === undefined || str(e.patient, 200)) &&
    (e.detail === undefined || str(e.detail, 2000)) &&
    (e.restricted === undefined || typeof e.restricted === "boolean")
  );
};

/**
 * Put back the events saved with the records, read once when the page opens: they come first, and the
 * events of this page so far follow them with their numbers continued (the order of what happened is
 * kept). Anything that is not an event is left out. A second call does nothing.
 */
export function auditRestore(saved: unknown): void {
  if (restored || !Array.isArray(saved)) return;
  restored = true;
  const kept = auditForSave(saved.filter(isEvent).sort((a, b) => a.seq - b.seq));
  if (!kept.length) return;
  const last = kept.at(-1)!.seq;
  events = [...kept, ...events.map((e, i) => ({ ...e, seq: last + i + 1 }))];
  seq = last + (events.length - kept.length);
  listeners.forEach((l) => l());
}

/** The AI's share: drafts written by Claude, and what people did with them. */
export function aiSummary(list: AuditEvent[]) {
  const drafted = list.filter((e) => e.role === "AI").length;
  const confirmed = list.filter((e) => e.role !== "AI" && e.action.startsWith("確定")).length;
  const removed = list.filter((e) => e.action === "下書きを消した").length;
  return { drafted, confirmed, removed };
}

export const CLAUDE = "Claude（claude-opus-5-5）";
