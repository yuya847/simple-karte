// ログインの仕組み（既定はオフ）: when it is turned on for this device, the app opens on a login screen (choose
// the person, enter the password), locks itself after some minutes without use (自動ログアウト・画面ロック), and
// the role follows the person who logged in. When it is off (the default, so that trying the app is not slowed),
// the role switch in 「自分」 works as before.
//
// No password is in this repository: each person sets one the first time on this device, and only a salted
// PBKDF2-SHA256 hash is kept in this browser (安全管理ガイドライン システム運用編 14 ⑥(3)). There is no second
// factor here (14 ⑤ asks for 二要素認証 in systems in use from 令和9年度), so the length follows the rule for a
// password without one (13文字以上、英字と数字を混ぜる, 14.1.1). The lock after failures and the minutes are the
// fictional hospital's rules (架空の病院の取り決め). Supabase Auth is not used (see README to turn on a real one).

import type { Role } from "./roles";

export const LOGIN_SOURCES = [
  {
    label: "厚生労働省・デジタル庁「中小病院向け電子カルテ及びレセプトコンピュータ標準仕様書（基本要件）第1.0版」第1章 別紙様式1 項番171〜173（ログイン・ログアウト、二要素認証）",
    url: "https://www.mhlw.go.jp/content/10800000/001683680.pdf",
  },
  {
    label: "厚生労働省「医療情報システムの安全管理に関するガイドライン 第7.0版 システム運用編」14 遵守事項①②⑤⑥・14.1.1（利用者の識別・認証、二要素認証、パスワード：二要素認証がないときは13桁以上・英数字の混在、ハッシュで保存、一定回数の失敗でログインを止める）",
    url: "https://www.mhlw.go.jp/content/10808000/001716295.pdf",
  },
  {
    label: "同 12 遵守事項⑥・12.3.2（長時間離席する際、自動での画面ロックアウト等）",
    url: "https://www.mhlw.go.jp/content/10808000/001716295.pdf",
  },
];

export interface LoginSettings {
  on: boolean;
  /** 自動ログアウト after this many minutes without a key press or a touch. */
  idleMinutes: number;
}
export const DEFAULT_LOGIN: LoginSettings = { on: false, idleMinutes: 15 };
export const IDLE_CHOICES = [5, 10, 15, 30];
/** 架空の病院の取り決め: after this many wrong passwords in a row, the person cannot log in for some minutes. */
export const LOCK_RULE = { tries: 5, minutes: 5 };
export const PASSWORD_RULE = { min: 13, max: 128 };
export const PBKDF2_ITER = 210_000;

/** The people who can log in (fictional). */
export interface LoginUser {
  name: string;
  role: Role;
}

const EASY = ["password", "simplekarte", "simple", "karte", "qwerty", "abcdef", "123456", "letmein"];

/** Why this password cannot be used, or null. */
export function passwordProblem(pw: string, again: string, user: string): string | null {
  if (pw.length < PASSWORD_RULE.min) return `${PASSWORD_RULE.min}文字以上にしてください（二要素認証がないため）。`;
  if (pw.length > PASSWORD_RULE.max) return `${PASSWORD_RULE.max}文字までにしてください。`;
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "英字と数字を混ぜてください。";
  if (/(.)\1{3,}/.test(pw)) return "同じ文字を4つ以上続けないでください。";
  const low = pw.toLowerCase();
  if (EASY.some((w) => low.includes(w))) return "推測されやすい言葉（password・karte・123456 など）を入れないでください。";
  if (user && pw.includes(user.replace(/\s|（.*）/g, ""))) return "名前を入れないでください。";
  if (pw !== again) return "確認のための2回目が合いません。";
  return null;
}

export interface PasswordRecord {
  salt: string;
  hash: string;
  iter: number;
  role: Role;
}

const enc = new TextEncoder();
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pw: string, salt: Uint8Array, iter: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iter }, key, 256);
  return b64(bits);
}

/** The hash kept for a new password (a new random salt each time). */
export async function hashPassword(pw: string, role: Role, iter = PBKDF2_ITER): Promise<PasswordRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: b64(salt), hash: await derive(pw, salt, iter), iter, role };
}

/** Whether the password fits the kept hash (compared in constant time). */
export async function checkPassword(pw: string, rec: PasswordRecord): Promise<boolean> {
  const got = await derive(pw, unb64(rec.salt), rec.iter);
  if (got.length !== rec.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ rec.hash.charCodeAt(i);
  return diff === 0;
}

export interface Fails {
  count: number;
  /** ms until which logging in is stopped. */
  until?: number;
}

/** Stopped for now after too many wrong passwords: the minutes left, or 0. */
export const lockedFor = (f: Fails | undefined, now: number) => (f?.until && f.until > now ? Math.ceil((f.until - now) / 60_000) : 0);

/** After one more wrong password: on the LOCK_RULE.tries-th, stop for LOCK_RULE.minutes and count again from 0. */
export function afterFail(f: Fails | undefined, now: number): Fails {
  const count = (f?.until && f.until > now ? 0 : (f?.count ?? 0)) + 1;
  return count >= LOCK_RULE.tries ? { count: 0, until: now + LOCK_RULE.minutes * 60_000 } : { count };
}

/** No key press or touch for the minutes set: the screen is locked. */
export const idleOver = (lastActive: number, now: number, minutes: number) => now - lastActive >= minutes * 60_000;

// ---------------------------------------------------------------------------
// Kept in this browser only (and only what is needed): the setting, the hashes, the failures.
// ---------------------------------------------------------------------------

const SETTINGS = "simple-karte:login-settings";
const PASSWORDS = "simple-karte:login-passwords";
const FAILS = "simple-karte:login-fails";
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const local = (): Store | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};
const read = <T>(key: string, fallback: T, store: Store | null): T => {
  try {
    const raw = store?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, v: unknown, store: Store | null) => {
  try {
    store?.setItem(key, JSON.stringify(v));
  } catch {}
};

export function loadLoginSettings(store = local()): LoginSettings {
  const v = read<Partial<LoginSettings>>(SETTINGS, {}, store);
  return { on: v.on === true, idleMinutes: IDLE_CHOICES.includes(v.idleMinutes ?? 0) ? v.idleMinutes! : DEFAULT_LOGIN.idleMinutes };
}
export const saveLoginSettings = (s: LoginSettings, store = local()) => write(SETTINGS, s, store);

export const loadPasswords = (store = local()): Record<string, PasswordRecord> => read(PASSWORDS, {}, store);
export function savePassword(name: string, rec: PasswordRecord, store = local()) {
  write(PASSWORDS, { ...loadPasswords(store), [name]: rec }, store);
}
/** パスワードを消す（デモ：この端末で決めたものを忘れたとき）. */
export function forgetPassword(name: string, store = local()) {
  const all = loadPasswords(store);
  delete all[name];
  write(PASSWORDS, all, store);
}

export const loadFails = (store = local()): Record<string, Fails> => read(FAILS, {}, store);
export const saveFails = (f: Record<string, Fails>, store = local()) => write(FAILS, f, store);
