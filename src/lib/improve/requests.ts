// その場で直す: the requests to change the app itself, sent from the top row (「直したい」) and kept in the workspace
// (key "improveRequests", one entry per request, with an id so saves from several places merge). Claude Code reads
// them through the MCP (list_requests) and writes back the fix (resolve_request: the commit and a word); the
// person who asked then sees 「直りました」 in やること until they open it.
//
// The text is redacted by code before it is kept (names, patient numbers, phones, dates, addresses, rooms:
// mcp/redact.ts), so what Claude Code reads never has them. The screen and the tool are names of the app only.

import { redact } from "../mcp/redact";
import { AREAS, WARD_TABS } from "../nav";
import { toolHelpLabels } from "../help/tool-labels";
import { referenceHelpLabels } from "../help/operations";
import { PATIENTS } from "../patients";
import { WARD_CHART_PATIENTS } from "../ward-charts";
import type { Patient } from "../types";

export type ImproveStatus = "受付" | "作業中" | "直った";
export const IMPROVE_STATUSES: ImproveStatus[] = ["受付", "作業中", "直った"];

export interface ImproveRequest {
  id: string;
  /** Who sent it (the name shown in the app) and their 職種. */
  by: string;
  role: string;
  /** When it was sent (ISO). */
  iso: string;
  /** Where it was sent from: 場所 › 画面 › 道具 (no patient). */
  screen: string;
  /** What to change, after redact(). */
  text: string;
  status: ImproveStatus;
  /** The commit that fixed it, and Claude Code's word on it. */
  commit?: string;
  note?: string;
  /** When it became 直った (ISO). */
  doneIso?: string;
  /** The person who asked opened 「直りました」. */
  seen?: boolean;
}

export const IMPROVE_TEXT_MAX = 500;
export const IMPROVE_NOTE_MAX = 200;
const COMMIT = /^[0-9a-f]{7,40}$/i;
/** The app's patients (names and numbers to replace) when the caller has no list of its own. */
export const KNOWN_PATIENTS: Patient[] = [...PATIENTS, ...WARD_CHART_PATIENTS];

/** A new request (null when there is nothing to send). The text is redacted here, before anything keeps it. */
export function newRequest(input: { id: string; by: string; role: string; screen: string; text: string; now: Date; patients?: Patient[] }): ImproveRequest | null {
  const text = redact(input.text.trim(), input.patients ?? KNOWN_PATIENTS).slice(0, IMPROVE_TEXT_MAX);
  if (!text) return null;
  return { id: input.id, by: input.by, role: input.role, iso: input.now.toISOString(), screen: input.screen.slice(0, 120), text, status: "受付" };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

/** The requests as saved (anything else in the key is left out). */
export function readImproveRequests(v: unknown): ImproveRequest[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x): ImproveRequest[] => {
    if (!x || typeof x !== "object") return [];
    const e = x as Record<string, unknown>;
    if (typeof e.id !== "string" || !e.id || typeof e.text !== "string" || typeof e.iso !== "string" || !IMPROVE_STATUSES.includes(e.status as ImproveStatus)) return [];
    const commit = typeof e.commit === "string" && COMMIT.test(e.commit) ? e.commit.toLowerCase() : undefined;
    const note = str(e.note, IMPROVE_NOTE_MAX);
    const doneIso = str(e.doneIso, 40);
    return [{
      id: e.id, by: str(e.by, 80) ?? "", role: str(e.role, 40) ?? "", iso: e.iso, screen: str(e.screen, 120) ?? "", text: e.text.slice(0, IMPROVE_TEXT_MAX),
      status: e.status as ImproveStatus,
      ...(commit ? { commit } : {}), ...(note ? { note } : {}), ...(doneIso ? { doneIso } : {}), ...(e.seen === true ? { seen: true } : {}),
    }];
  });
}

export class ImproveError extends Error {}

/**
 * The change Claude Code writes back. 直った needs the commit (7–40 hex) and shows anew to the person who
 * asked (also when it is fixed again); 作業中 only before it is fixed. The word is redacted like the request.
 */
export function advance(r: ImproveRequest, change: { status?: "作業中" | "直った"; commit?: string; note?: string }, now: Date, patients: Patient[] = KNOWN_PATIENTS): ImproveRequest {
  const to = change.status ?? "直った";
  const note = change.note?.trim() ? redact(change.note.trim(), patients).slice(0, IMPROVE_NOTE_MAX) : undefined;
  if (to === "作業中") {
    if (r.status === "直った") throw new ImproveError("この要望はもう直っています");
    return { ...r, status: "作業中", ...(note ? { note } : {}) };
  }
  if (!change.commit || !COMMIT.test(change.commit)) throw new ImproveError("直ったにするには、直したときのコミット（7〜40桁の16進）が要ります");
  // Not seen yet (again), and the word of this fix only.
  return { id: r.id, by: r.by, role: r.role, iso: r.iso, screen: r.screen, text: r.text, status: "直った", commit: change.commit.toLowerCase(), doneIso: now.toISOString(), ...(note ? { note } : {}) };
}

/** 「直りました」 for this person: their requests fixed and not opened yet, newest first. */
export const fixedFor = (requests: ImproveRequest[], by: string) =>
  requests.filter((r) => r.status === "直った" && r.by === by && !r.seen && r.commit).sort((a, b) => (b.doneIso ?? "").localeCompare(a.doneIso ?? ""));

export const fixSeen = (requests: ImproveRequest[], id: string) => requests.map((r) => (r.id === id ? { ...r, seen: true } : r));

/** This person's requests, newest first. */
export const mineOf = (requests: ImproveRequest[], by: string) => requests.filter((r) => r.by === by).sort((a, b) => b.iso.localeCompare(a.iso));

/** The request a commit fixed (the commit may be written short). */
export function requestOfCommit(requests: ImproveRequest[], sha: string): ImproveRequest | undefined {
  const s = sha.toLowerCase();
  return requests.find((r) => r.status === "直った" && r.commit && s.startsWith(r.commit));
}

/** The text cut for one line (やること). */
export const shortText = (text: string, max = 24) => (text.length > max ? `${text.slice(0, max)}…` : text);

/** 「直りました」 in やること: what was asked, then the commit and the word. */
export function fixedTodo(r: ImproveRequest) {
  return { key: `improve-${r.id}`, label: `直りました：${shortText(r.text)}`, detail: [r.commit?.slice(0, 7), r.note].filter(Boolean).join("、"), count: 1, tone: "ai" as const };
}

const TOOL_LABELS: Record<string, string> = { ...toolHelpLabels, ...referenceHelpLabels };

/** The screen as words: 場所 › 画面 › 道具 (the chart's tool only on a chart). Never the patient. */
export function screenLabel(screen: string, tool?: string | null): string {
  const chart = screen === "chart" ? "患者のカルテ" : screen === "visit" ? "受診のカルテ" : null;
  if (chart) {
    const t = tool ? TOOL_LABELS[tool] : undefined;
    return t ? `${chart} › ${t}` : chart;
  }
  if (screen === "wardmenu") return "病棟 › 画面を選ぶ";
  if (screen === "new") return "新しいタブ";
  const ward = WARD_TABS.find((t) => t.key === screen);
  if (ward) return `病棟 › ${ward.label}`;
  return AREAS.find((a) => a.key === screen)?.label ?? screen;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The workspace from what Claude Code was given: the id, or the app's 「ほかの端末で開くリンク」 (?ws=). */
export function workspaceArg(value: string): string | null {
  const t = value.trim();
  if (UUID.test(t)) return t;
  try {
    const ws = new URL(t).searchParams.get("ws");
    return ws && UUID.test(ws) ? ws : null;
  } catch {
    return null;
  }
}
