// 定型文・単語登録: sentences a person uses often, kept under a short reading (読み) and put into the note
// at the cursor — picked from the list, or by typing 「;読み」 and pressing Tab. 電子カルテ標準仕様研究会
// 「電子カルテシステム標準仕様書 v1.0」1.03 の 5（定型文入力）. Kept per person in this browser.

import { searchKey } from "./kana";

export const PHRASE_SOURCES = [{ name: "電子カルテ標準仕様研究会「電子カルテシステム標準仕様書 v1.0」1.03 診療記録の 5 定型文入力", url: "http://hci-bc.com/pdf/StandardSpec_v1body_c.pdf" }];

export interface Phrase {
  id: string;
  /** The reading or short word it is called up by (例：ふくぶ). */
  key: string;
  text: string;
}

/** Examples for someone who has not registered any yet (fictional; each can be removed). */
export const EXAMPLE_PHRASES: Phrase[] = [
  { id: "ex-abd", key: "ふくぶ", text: "腹部平坦・軟、圧痛なし、腸蠕動音正常。" },
  { id: "ex-chest", key: "きょうぶ", text: "呼吸音清、ラ音なし。心音整、雑音なし。" },
  { id: "ex-same", key: "かわりなし", text: "前回と変わりなし。経過観察を続ける。" },
];

/** Phrases whose reading or text matches what was typed (kana and katakana alike), readings first. */
export function findPhrases(list: Phrase[], typed: string): Phrase[] {
  const q = searchKey(typed.trim());
  if (!q) return list;
  const byKey = list.filter((p) => searchKey(p.key).startsWith(q));
  const rest = list.filter((p) => !byKey.includes(p) && (searchKey(p.key).includes(q) || searchKey(p.text).includes(q)));
  return [...byKey, ...rest];
}

/** Why a phrase cannot be registered yet (empty when it can). */
export function phraseProblems(key: string, text: string, list: Phrase[]): string[] {
  const out: string[] = [];
  if (!key.trim()) out.push("読み（呼び出す言葉）を入れてください。");
  else if (/[\s;；]/.test(key.trim())) out.push("読みに空白や「;」は使えません。");
  else if (list.some((p) => searchKey(p.key) === searchKey(key.trim()))) out.push("同じ読みの定型文があります。");
  if (!text.trim()) out.push("文を入れてください。");
  return out;
}

/**
 * 「;読み」 just before the cursor becomes the phrase (Tab). Returns null when the word before the cursor
 * is not a registered reading.
 */
export function expandAt(note: string, caret: number, list: Phrase[]): { text: string; caret: number; phrase: Phrase } | null {
  const before = note.slice(0, caret);
  const m = before.match(/[;；]([^\s;；]+)$/);
  if (!m) return null;
  const p = list.find((x) => searchKey(x.key) === searchKey(m[1]));
  if (!p) return null;
  const start = caret - m[0].length;
  return { text: note.slice(0, start) + p.text + note.slice(caret), caret: start + p.text.length, phrase: p };
}

const storeKey = (user: string) => `simple-karte:phrases:${user}`;

/** The person's phrases; the examples until they register their own. */
export function loadPhrases(user: string): Phrase[] {
  try {
    const v = typeof window === "undefined" ? null : window.localStorage.getItem(storeKey(user));
    if (v === null) return EXAMPLE_PHRASES;
    const o: unknown = JSON.parse(v);
    return Array.isArray(o) ? (o as Phrase[]).filter((p) => p && typeof p.id === "string" && typeof p.key === "string" && typeof p.text === "string") : EXAMPLE_PHRASES;
  } catch {
    return EXAMPLE_PHRASES;
  }
}

export function savePhrases(user: string, list: Phrase[]): boolean {
  try {
    window.localStorage.setItem(storeKey(user), JSON.stringify(list));
    return true;
  } catch {
    // Storage blocked (private window): the phrases last until the page is closed.
    return false;
  }
}
