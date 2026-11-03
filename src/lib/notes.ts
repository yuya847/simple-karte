// Chart notes: confirmed with who and when, and corrected only by adding a new version.
// The earlier versions stay, so anyone can see what was written first, what changed, who changed it,
// when and why (真正性: the record is not overwritten). 厚生労働省「医療情報システムの安全管理に関する
// ガイドライン 第7.0版」（令和8年6月）システム運用編 14章：入力者・確定者・日時を残し、確定後の更新は
// 履歴を残して前後を比べられ、更新の順序が分かること。

import type { DayOffset, NoteEntry, NoteVersion } from "./types";

export type { NoteVersion };

const KEYS = ["s", "o", "a", "p"] as const;

/** "S) … O) … A) … P) …" becomes SOAP sections; anything else stays one body of text. */
export function parseNote(raw: string): Pick<NoteEntry, "soap" | "text"> {
  const text = raw.replace(/\s+$/, "");
  const marks = [...text.matchAll(/^([SOAP])\)\s?/gim)];
  if (marks.length === 0) return { text: text.trim() };
  const before = text.slice(0, marks[0].index).trim();
  const soap: NonNullable<NoteEntry["soap"]> = {};
  marks.forEach((m, i) => {
    const k = m[1].toLowerCase() as (typeof KEYS)[number];
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    const body = text.slice(m.index! + m[0].length, end).trim();
    if (body) soap[k] = soap[k] ? `${soap[k]}\n${body}` : body;
  });
  if (before) soap.s = soap.s ? `${before}\n${soap.s}` : before;
  return Object.keys(soap).length ? { soap } : { text: "" };
}

/** The note back as editable text. */
export function noteText(n: Pick<NoteEntry, "soap" | "text">): string {
  if (n.soap) return KEYS.filter((k) => n.soap?.[k]).map((k) => `${k.toUpperCase()}) ${n.soap![k]}`).join("\n");
  return n.text ?? "";
}

/** Nothing written yet besides the template. */
export function isBlankNote(raw: string): boolean {
  const p = parseNote(raw);
  return p.soap ? Object.values(p.soap).every((v) => !v?.trim()) : !p.text?.trim();
}

/** A stable key for a note (notes from the stored record have no id). */
export const noteKey = (e: NoteEntry) => e.id ?? `${e.day}|${e.time}|${e.author}`;

/** All versions of a note, oldest first; the last one is what the chart shows. */
export function versionsOf(e: NoteEntry): NoteVersion[] {
  return e.versions ?? [{ day: e.day, time: e.time, author: e.author, soap: e.soap, text: e.text }];
}

/** Only the person who wrote a note corrects it; others write a new note. */
export const canRevise = (e: NoteEntry, me: string) => e.author === me;

/** A corrected note: same place in the record, new content, every earlier version kept. */
export function reviseNote(e: NoteEntry, raw: string, by: string, at: { day: DayOffset; time: string }, reason: string): NoteEntry {
  const next = parseNote(raw);
  const v: NoteVersion = { ...at, author: by, ...next, reason: reason.trim() };
  return { ...e, soap: next.soap, text: next.text, versions: [...versionsOf(e), v] };
}

export type DiffLine = { kind: "same" | "removed" | "added"; text: string };

/** Line-by-line difference between two versions (longest common subsequence). */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push({ kind: "removed", text: a[i++] });
    else out.push({ kind: "added", text: b[j++] });
  }
  while (i < n) out.push({ kind: "removed", text: a[i++] });
  while (j < m) out.push({ kind: "added", text: b[j++] });
  return out;
}

/** The note template for a role: SOAP for doctors, nurses and pharmacists; free text otherwise. */
export const noteTemplate = (role: string) => (role === "医師" || role === "看護師" || role === "薬剤師" ? "S)\nO)\nA)\nP)\n" : "");
