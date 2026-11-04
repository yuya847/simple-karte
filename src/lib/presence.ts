// 排他制御・同時利用の警告: who else has the same chart open (another tab of this browser, or another device of
// the same workspace), and whether this page's records are older than the ones saved since. The day's records
// are saved as one row (workspace.ts), so the tab that saved last holds the newest records; a page that is
// behind stops saving and asks to read the newest records before a note or an order is confirmed, instead of
// overwriting them. 標準仕様書 様式1 項番174 asks for 排他制御 of simultaneous operations.

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
  | { t: "saved"; tab: string; who: string; role: string; at: string; changes: { patient: string; what: string }[] };

export interface PresenceState {
  peers: Record<string, Peer>;
  stale: Stale | null;
}
export const EMPTY_PRESENCE: PresenceState = { peers: {}, stale: null };

/** A tab says it is here every 5 seconds; one not heard of for this long has gone. */
export const TAB_TTL = 15_000;
/** Another device is asked about every 10 seconds (when the workspace has the presence table). */
export const DEVICE_TTL = 40_000;

const s64 = (v: unknown, max = 80): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const sOrNull = (v: unknown) => v === null || s64(v);

/** A message from another tab, checked (anything else is ignored). */
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
  return false;
}

const addChanges = (base: Record<string, string[]>, changes: { patient: string; what: string }[]) => {
  const out = { ...base };
  for (const c of changes) out[c.patient] = [...new Set([...(out[c.patient] ?? []), c.what])];
  return out;
};

/**
 * Take in a message from another tab. `shared`: the records are saved for the workspace (another tab's save
 * makes this page's records older); without saving, each tab keeps its own records and only who is here counts.
 */
export function receive(s: PresenceState, m: PresenceMsg, now: number, shared: boolean): PresenceState {
  if (m.t === "bye") {
    if (!s.peers[m.tab]) return s;
    const peers = { ...s.peers };
    delete peers[m.tab];
    return { ...s, peers };
  }
  if (m.t === "here") return { ...s, peers: { ...s.peers, [m.tab]: { tab: m.tab, who: m.who, role: m.role, patient: m.patient, editing: m.editing, where: "タブ", seen: now } } };
  if (!shared) return s;
  return { ...s, stale: { by: m.who, role: m.role, at: m.at, where: "タブ", patients: addChanges(s.stale?.patients ?? {}, m.changes) } };
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

/** "看護師 佐藤（別のタブ・記事を書いています）" */
export const peerLine = (p: Peer): string => `${p.who}（${p.who.includes(p.role) ? "" : `${p.role}・`}別の${p.where}${p.editing ? "・記事か下書きを書いています" : ""}）`;

/** Why a note or an order is not confirmed now, for the patient. */
export function staleText(st: Stale, patientId: string | null, name?: string): string {
  const whatHere = patientId ? st.patients[patientId] : undefined;
  const who = `別の${st.where}（${st.by}）`;
  const head = whatHere?.length ? `${name ? `${name}さん` : "この患者"}の記録は、${who}で ${st.at} に変わりました（${whatHere.join("・")}）。` : `${who}で ${st.at} に記録が保存されました。`;
  return `${head}このページの記録はそれより古いので、このまま確定すると、あちらの記録を上書きするおそれがあります。最新の記録を読み込んでから、確かめて確定してください。書いている記事と下書きは残します。`;
}

/** A stable id of this tab (made once per page). */
let tabId: string | null = null;
export const thisTab = (): string => (tabId ??= typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `tab-${Math.random().toString(36).slice(2)}`);
