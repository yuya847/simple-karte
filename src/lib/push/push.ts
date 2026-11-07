// スマートフォンへの通知（Web Push）: what is kept in the workspace and what a notification says.
// pushSubs: the devices that receive (who, 職種, the device, the browser's subscription, when). Entries are only
// added; one that stops keeps its line with `stopped` and loses its subscription (so saves from several places merge).
// pushPrefs: the hospital's choice to put a pseudonym and the value in the text (off by default).
// pushSent (server only): the results already sent today, so one result is sent once.
// By default a notification carries no patient information: only counts (「新しい結果 2件・パニック値 1件」).

import type { ResultItem } from "../results";
import type { Patient } from "../types";

export interface PushKeys {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export type PushRole = "医師" | "看護師";
export const PUSH_ROLES: readonly PushRole[] = ["医師", "看護師"];

export interface PushSub {
  id: string;
  name: string;
  role: PushRole;
  /** 端末の名前 (from the browser: iPhone, Android スマートフォン, Mac …). */
  device: string;
  /** The browser's subscription; null once stopped. */
  sub: PushKeys | null;
  /** When it was registered (ISO). */
  iso: string;
  stopped?: { iso: string; by: string };
}

export interface PushPrefs {
  /** 通知に仮の ID と値を入れる. */
  detail: boolean;
  /** Who changed it last, and when (ISO). */
  by?: string;
  iso?: string;
  /** Turned on after checking the hospital's rules (院内の決まりを確かめた). */
  rulesChecked?: boolean;
}
export const DEFAULT_PUSH_PREFS: PushPrefs = { detail: false };

/** One new result as the confirming screen sends it to /api/push/notify. */
export interface PushItem {
  key: string;
  patientId: string;
  panic: boolean;
  /** Doctors who look after the patient (主治医のチーム・担当医・コンサルト医). */
  doctors: string[];
  /** The nurse in charge of the bed now (told of a panic value). */
  nurse?: string;
  /** Only with 通知に仮の ID と値を入れる: 「70代男性」 and 「CRP 11.8↑」. */
  who?: string;
  line?: string;
}

export interface PushMessage {
  subId: string;
  sub: PushKeys;
  title: string;
  body: string;
  urgent: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);
const plain = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, " ");

/** Push services the server may send to (the endpoint is a URL the browser gave; nothing else is called). */
const PUSH_HOSTS = ["fcm.googleapis.com", "android.googleapis.com", "push.apple.com", "push.services.mozilla.com", "notify.windows.com"];
const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/** A browser subscription as sent by the page, or null when it is not one (or not to a known push service). */
export function readKeys(v: unknown): PushKeys | null {
  if (!isObj(v) || !isObj(v.keys)) return null;
  const endpoint = str(v.endpoint, 1000);
  const p256dh = str(v.keys.p256dh, 200);
  const auth = str(v.keys.auth, 100);
  if (!endpoint || !p256dh || !auth || !B64URL.test(p256dh) || !B64URL.test(auth)) return null;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))) return null;
  return { endpoint, keys: { p256dh, auth } };
}

/** The devices as saved (anything else in the key is left out). */
export function readSubs(v: unknown): PushSub[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x): PushSub[] => {
    if (!isObj(x)) return [];
    const id = str(x.id, 80);
    const name = str(x.name, 60);
    const device = str(x.device, 40);
    const iso = str(x.iso, 40);
    const role = PUSH_ROLES.find((r) => r === x.role);
    if (!id || !name || !device || !iso || !role) return [];
    const stopped = isObj(x.stopped) && typeof x.stopped.iso === "string" && typeof x.stopped.by === "string" ? { iso: x.stopped.iso, by: x.stopped.by } : undefined;
    return [{ id, name, role, device, iso, sub: stopped ? null : readKeys(x.sub), ...(stopped ? { stopped } : {}) }];
  });
}

/** The devices that still receive. */
export const activeSubs = (subs: PushSub[]) => subs.filter((s) => !s.stopped && s.sub);

export function readPrefs(v: unknown): PushPrefs {
  if (!isObj(v)) return DEFAULT_PUSH_PREFS;
  return { detail: v.detail === true, ...(typeof v.by === "string" ? { by: v.by } : {}), ...(typeof v.iso === "string" ? { iso: v.iso } : {}), ...(v.rulesChecked === true ? { rulesChecked: true } : {}) };
}

/** Result keys already sent today → when. */
export function readSent(v: unknown): Record<string, string> {
  if (!isObj(v)) return {};
  return Object.fromEntries(Object.entries(v).filter(([, at]) => typeof at === "string")) as Record<string, string>;
}

/** The new results as sent by a page (at most 50; anything malformed is left out). */
export function readItems(v: unknown): PushItem[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 50).flatMap((x): PushItem[] => {
    if (!isObj(x)) return [];
    const key = str(x.key, 200);
    const patientId = str(x.patientId, 60);
    if (!key || !patientId) return [];
    const doctors = Array.isArray(x.doctors) ? [...new Set(x.doctors.flatMap((d) => (str(d, 60) ? [String(d).trim()] : [])))].slice(0, 20) : [];
    const nurse = str(x.nurse, 60);
    const who = str(x.who, 20);
    const line = str(x.line, 80);
    return [{ key, patientId, panic: x.panic === true, doctors, ...(nurse ? { nurse } : {}), ...(who ? { who: plain(who) } : {}), ...(line ? { line: plain(line) } : {}) }];
  });
}

/** The results this person is told of: a doctor, every new result of their patients; a nurse, panic values of the beds in their charge. */
export const itemsFor = (s: Pick<PushSub, "name" | "role">, items: PushItem[]) =>
  items.filter((i) => (s.role === "医師" ? i.doctors.includes(s.name) : i.panic && i.nurse === s.name));

/** 「新しい結果 2件・パニック値 1件」 (a nurse is told of panic values only). */
export function countLine(role: PushRole, items: PushItem[]): string {
  const panic = items.filter((i) => i.panic).length;
  if (role === "看護師") return `パニック値 ${panic}件`;
  return `新しい結果 ${items.length}件${panic ? `・パニック値 ${panic}件` : ""}`;
}

/** Lines shown under the count when the hospital puts the pseudonym and the value in: 「A3F9（70代男性）CRP 11.8↑」. */
export function detailLines(items: PushItem[], idOf: (patientId: string) => string, most = 3): string[] {
  const sorted = [...items].sort((a, b) => Number(b.panic) - Number(a.panic));
  const lines = sorted.slice(0, most).map((i) => `${idOf(i.patientId)}${i.who ? `（${i.who}）` : " "}${i.line ?? ""}`.trimEnd());
  return sorted.length > most ? [...lines, `ほか ${sorted.length - most}件`] : lines;
}

/** One notification per device with something for its person; the text has counts only unless `detail`. */
export function planPush(subs: PushSub[], items: PushItem[], detail: boolean, idOf: (patientId: string) => string): PushMessage[] {
  return activeSubs(subs).flatMap((s): PushMessage[] => {
    const mine = itemsFor(s, items);
    if (!mine.length) return [];
    const head = countLine(s.role, mine);
    const body = detail ? [head, ...detailLines(mine, idOf)].join("\n") : head;
    return [{ subId: s.id, sub: s.sub!, title: "Simple Karte", body, urgent: mine.some((i) => i.panic) }];
  });
}

/** 仮の ID in a notification: the first four of the MCP pseudonym (P-XXXXXXXXXXXX → XXXX). */
export const shortId = (pseudonym: string) => pseudonym.replace(/^P-/, "").slice(0, 4);

/** 「70代男性」: the age by tens and the sex (under 10 and 90 and over are grouped). */
export function whoOf(p: Pick<Patient, "age" | "sex">): string {
  const age = p.age < 10 ? "10歳未満" : p.age >= 90 ? "90歳以上" : `${Math.floor(p.age / 10) * 10}代`;
  return `${age}${p.sex === "男" ? "男性" : "女性"}`;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/** The value of a result in one short line: panic values first, then out-of-range values (at most three). */
export function resultLine(i: Pick<ResultItem, "kind" | "detail" | "panic" | "title">): string {
  if (i.kind === "検査") {
    const panic = i.panic.map((h) => `${h.name} ${fmt(h.value)}${h.side === "高" ? "↑" : "↓"}`);
    const names = new Set(i.panic.map((h) => h.name));
    const out = (/^基準範囲の外：(.*)$/.exec(i.detail)?.[1] ?? "")
      .split("、")
      .flatMap((s) => {
        const m = /^(.+) (-?[\d.]+)([HL])$/.exec(s.trim());
        return m && !names.has(m[1]) ? [`${m[1]} ${m[2]}${m[3] === "H" ? "↑" : "↓"}`] : [];
      });
    const all = [...panic, ...out];
    return all.length ? all.slice(0, 3).join("・") : "基準範囲の中";
  }
  if (i.panic.length) return i.panic.map((h) => h.name).join("・");
  return i.kind === "培養" ? i.title : `${i.kind}の報告`;
}

/** 端末の名前 from the browser (an iPad says Macintosh; it has touch). */
export function deviceName(ua: string, touch = 0): string {
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch > 1)) return "iPad";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android スマートフォン" : "Android タブレット";
  if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/CrOS/.test(ua)) return "Chromebook";
  return "端末";
}
