// 同時利用: who else has the same chart open (another tab of this browser, or another device of the same
// workspace), who is correcting which past note and what they have typed so far, and whether records were
// saved elsewhere after this page read them. The day's records are saved as one row (workspace.ts); a page
// that hears of a newer save reads it and merges it into its own records (merge-workspace.ts) instead of
// stopping, so several people can work on one chart at the same time. 標準仕様書 様式1 項番174 asks for
// 排他制御 of simultaneous operations: here it is done by merging record by record and by showing who is
// writing what, not by locking.

export const EXCLUSIVE_SOURCE = {
  label: "厚生労働省・デジタル庁「中小病院向け電子カルテ及びレセプトコンピュータ標準仕様書（基本要件）第1.0版」第1章 別紙様式1 項番174（排他制御：同時操作に対し排他制御ができること）",
  url: "https://www.mhlw.go.jp/content/10800000/001683680.pdf",
};

export type Where = "タブ" | "端末";

/** Someone else with the chart open. */
export interface Peer {
  tab: string;
  who: string;
  role: string;
  /** The chart open in front (patient id), or null. */
  patient: string | null;
  /** Writing a note or has drafts in that chart. */
  editing: boolean;
  where: Where;
  /** When last heard of (ms). */
  seen: number;
}

/** Someone correcting a past note now, with the text as they have it. */
export interface NoteEditor {
  tab: string;
  who: string;
  role: string;
  patient: string;
  /** The note (noteKey of notes.ts). */
  note: string;
  /** "10:32 の記事" for the strip. */
  label: string;
  text: string;
  /** Caret position in `text` (code units). */
  cursor: number;
  seen: number;
}

/** Records saved elsewhere after this page read them: by whom, when, and what changed for which patient. */
export interface Stale {
  by: string;
  role: string;
  at: string;
  where: Where;
  /** Patient id → what was confirmed there (記事の確定・オーダの確定…). Empty when not known (another device). */
  patients: Record<string, string[]>;
}

export type PresenceMsg =
  | { t: "here"; tab: string; who: string; role: string; patient: string | null; editing: boolean; hello?: boolean }
  | { t: "bye"; tab: string }
  | { t: "saved"; tab: string; who: string; role: string; at: string; changes: { patient: string; what: string }[] }
  | { t: "edit"; tab: string; who: string; role: string; patient: string; note: string; label: string; text: string; cursor: number }
  | { t: "edit-end"; tab: string; note: string };

export interface PresenceState {
  peers: Record<string, Peer>;
  editors: Record<string, NoteEditor>;
  stale: Stale | null;
}
export const EMPTY_PRESENCE: PresenceState = { peers: {}, editors: {}, stale: null };

/** A tab says it is here every 5 seconds; one not heard of for this long has gone. */
export const TAB_TTL = 15_000;
/** Another device is asked about every 10 seconds (when the workspace has the presence table). */
export const DEVICE_TTL = 40_000;
/** Someone editing a note says so every 5 seconds while the editor is open. */
export const EDITOR_TTL = 20_000;
/** The longest note text sent while typing. */
export const EDIT_TEXT_MAX = 20_000;

const s64 = (v: unknown, max = 80): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const sOrNull = (v: unknown) => v === null || s64(v);

/** A message from another tab or device, checked (anything else is ignored). */
export function isMsg(v: unknown): v is PresenceMsg {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  if (!s64(m.tab)) return false;
  if (m.t === "bye") return true;
  if (m.t === "here") return s64(m.who) && s64(m.role, 16) && sOrNull(m.patient) && typeof m.editing === "boolean";
  if (m.t === "saved")
    return (
      s64(m.who) &&
      s64(m.role, 16) &&
      s64(m.at, 8) &&
      Array.isArray(m.changes) &&
      m.changes.length <= 50 &&
      m.changes.every((c) => !!c && typeof c === "object" && s64((c as Record<string, unknown>).patient) && s64((c as Record<string, unknown>).what, 40))
    );
  if (m.t === "edit")
    return s64(m.who) && s64(m.role, 16) && s64(m.patient) && s64(m.note, 120) && s64(m.label, 40) && typeof m.text === "string" && m.text.length <= EDIT_TEXT_MAX && typeof m.cursor === "number" && m.cursor >= 0;
  if (m.t === "edit-end") return s64(m.note, 120);
  return false;
}

const addChanges = (base: Record<string, string[]>, changes: { patient: string; what: string }[]) => {
  const out = { ...base };
  for (const c of changes) out[c.patient] = [...new Set([...(out[c.patient] ?? []), c.what])];
  return out;
};

const without = <T>(rec: Record<string, T>, key: string): Record<string, T> => {
  if (!(key in rec)) return rec;
  const out = { ...rec };
  delete out[key];
  return out;
};

/**
 * Take in a message from another tab or device. `shared`: the records are saved for the workspace (another
 * page's save brings newer records to merge); without saving, each tab keeps its own records and only who is
 * here and who is typing counts. `where` tells how it came (another tab of this browser, or another device).
 */
export function receive(s: PresenceState, m: PresenceMsg, now: number, shared: boolean, where: Where = "タブ"): PresenceState {
  if (m.t === "bye") {
    if (!s.peers[m.tab] && !s.editors[m.tab]) return s;
    return { ...s, peers: without(s.peers, m.tab), editors: without(s.editors, m.tab) };
  }
  if (m.t === "here") return { ...s, peers: { ...s.peers, [m.tab]: { tab: m.tab, who: m.who, role: m.role, patient: m.patient, editing: m.editing, where, seen: now } } };
  if (m.t === "edit") return { ...s, editors: { ...s.editors, [m.tab]: { tab: m.tab, who: m.who, role: m.role, patient: m.patient, note: m.note, label: m.label, text: m.text, cursor: m.cursor, seen: now } } };
  if (m.t === "edit-end") return s.editors[m.tab]?.note === m.note ? { ...s, editors: without(s.editors, m.tab) } : s;
  if (!shared) return s;
  return { ...s, stale: { by: m.who, role: m.role, at: m.at, where, patients: addChanges(s.stale?.patients ?? {}, m.changes) } };
}

/** The other devices as the workspace answered (they replace the devices known before). */
export function withDevices(s: PresenceState, rows: { tab: string; who: string; role: string; patient: string | null; editing: boolean }[], now: number): PresenceState {
  const peers = Object.fromEntries(Object.entries(s.peers).filter(([, p]) => p.where === "タブ"));
  for (const r of rows) if (!peers[r.tab]) peers[r.tab] = { ...r, where: "端末", seen: now };
  return { ...s, peers };
}

/** Another device saved the records (what changed is not known). */
export const savedElsewhere = (s: PresenceState, by: string, role: string, at: string): PresenceState => ({ ...s, stale: { by, role, at, where: "端末", patients: s.stale?.patients ?? {} } });

/** The people heard of recently. */
export const livePeers = (s: PresenceState, now: number): Peer[] => Object.values(s.peers).filter((p) => now - p.seen < (p.where === "タブ" ? TAB_TTL : DEVICE_TTL));

/** The others with this chart open. */
export const onPatient = (s: PresenceState, patientId: string, now: number): Peer[] => livePeers(s, now).filter((p) => p.patient === patientId);

/** Who is correcting a note now (heard of recently), in a stable order. */
export const liveEditors = (s: PresenceState, now: number): NoteEditor[] =>
  Object.values(s.editors)
    .filter((e) => now - e.seen < EDITOR_TTL)
    .sort((a, b) => (a.tab < b.tab ? -1 : a.tab > b.tab ? 1 : 0));

/** Who is correcting this note. */
export const editorsOf = (s: PresenceState, note: string, now: number): NoteEditor[] => liveEditors(s, now).filter((e) => e.note === note);

/** Who is correcting a note of this patient. */
export const editorsOn = (s: PresenceState, patientId: string, now: number): NoteEditor[] => liveEditors(s, now).filter((e) => e.patient === patientId);

/** "看護師 佐藤（別のタブ・記事を書いています）" */
export const peerLine = (p: Peer): string => `${p.who}（${p.who.includes(p.role) ? "" : `${p.role}・`}別の${p.where}${p.editing ? "・記事か下書きを書いています" : ""}）`;

/** "看護師 佐藤（10:32 の記事を修正中）" */
export const editorLine = (e: NoteEditor): string => `${e.who}（${e.who.includes(e.role) ? "" : `${e.role}・`}${e.label}を修正中）`;

/** "看護師 佐藤さんの変更を取り込みました" */
export const mergedText = (by: string, where: Where, at: string): string => `${by}さんの変更を取り込みました（別の${where}・${at} の保存）。`;

/** The people who wrote a corrected version together: "医師 山本・看護師 佐藤". */
export const coAuthors = (me: string, others: readonly { who: string }[]): string => [me, ...others.map((o) => o.who)].filter((v, i, a) => a.indexOf(v) === i).join("・");

/** A stable id of this tab (made once per page). */
let tabId: string | null = null;
export const thisTab = (): string => (tabId ??= typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `tab-${Math.random().toString(36).slice(2)}`);

/**
 * The same message can arrive twice (through the tabs' channel and through the workspace's channel): each
 * carries a key, and one seen before is dropped. Keeps the newest keys only.
 */
export class Seen {
  private keys = new Set<string>();
  constructor(private readonly max = 2000) {}
  /** True the first time a key is seen. */
  fresh(key: string): boolean {
    if (this.keys.has(key)) return false;
    if (this.keys.size >= this.max) this.keys.clear();
    this.keys.add(key);
    return true;
  }
}
