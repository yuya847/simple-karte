// 患者さんの入力の受け箱 (workspace key "portalInbox"): what came from the patient's page or the ward's iPad —
// the answers to the admission questions, and 「検査の結果を見る」 given or taken back. Entries are only added
// (each has an id, so saves from several places merge); a nurse's confirmation is written into the entry.

import { cleanIntake, type IntakeAnswers } from "./intake";

export type PortalVia = "スマートフォン" | "病棟の iPad";

export interface PortalInboxEntry {
  id: string;
  /** An inpatient's id, or "card:" and the 診察券番号. */
  patientId: string;
  kind: "intake" | "labs";
  at: { day: number; time: string };
  /** When it was sent (ISO), for the order. */
  iso: string;
  via: PortalVia;
  answers?: IntakeAnswers;
  /** 検査の結果を見る: given (true) or taken back (false). */
  agree?: boolean;
  /** The nurse confirmed it into 入院時の情報収集 (edited: changed before confirming). */
  done?: { by: string; at: { day: number; time: string }; edited: boolean };
}

/** How many entries one patient may send in a day (the records are one row per workspace). */
export const INBOX_PER_PATIENT = 30;

const isAt = (v: unknown): v is { day: number; time: string } => !!v && typeof v === "object" && typeof (v as { day?: unknown }).day === "number" && typeof (v as { time?: unknown }).time === "string";

/** The entries as saved (anything else in the key is left out). */
export function readInbox(v: unknown): PortalInboxEntry[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x): PortalInboxEntry[] => {
    if (!x || typeof x !== "object") return [];
    const e = x as Partial<PortalInboxEntry>;
    if (typeof e.id !== "string" || typeof e.patientId !== "string" || (e.kind !== "intake" && e.kind !== "labs") || !isAt(e.at) || typeof e.iso !== "string") return [];
    const answers = e.kind === "intake" ? cleanIntake(e.answers) : null;
    return [{ id: e.id, patientId: e.patientId, kind: e.kind, at: e.at, iso: e.iso, via: e.via === "病棟の iPad" ? "病棟の iPad" : "スマートフォン", ...(answers ? { answers } : {}), ...(e.kind === "labs" ? { agree: e.agree === true } : {}), ...(e.done && isAt(e.done.at) && typeof e.done.by === "string" ? { done: { by: e.done.by, at: e.done.at, edited: !!e.done.edited } } : {}) }];
  });
}

const byTime = (a: PortalInboxEntry, b: PortalInboxEntry) => a.iso.localeCompare(b.iso);

/** Answers not confirmed yet (of one patient, or of all), oldest first. */
export const pendingIntakes = (inbox: PortalInboxEntry[], patientId?: string) => inbox.filter((e) => e.kind === "intake" && !e.done && (!patientId || e.patientId === patientId)).sort(byTime);

/** The patient's answers, oldest first. */
export const intakesOf = (inbox: PortalInboxEntry[], patientId: string) => inbox.filter((e) => e.kind === "intake" && e.patientId === patientId).sort(byTime);

/** 検査の結果を見る: the patient's last word (none: not given). */
export function labsAgreed(inbox: PortalInboxEntry[], patientId: string): { agree: boolean; at?: PortalInboxEntry["at"] } {
  const last = inbox.filter((e) => e.kind === "labs" && e.patientId === patientId).sort(byTime).at(-1);
  return last ? { agree: !!last.agree, at: last.at } : { agree: false };
}

/** The entry confirmed by the nurse. */
export const confirmEntry = (inbox: PortalInboxEntry[], id: string, by: string, at: { day: number; time: string }, edited: boolean): PortalInboxEntry[] =>
  inbox.map((e) => (e.id === id && !e.done ? { ...e, done: { by, at, edited } } : e));
