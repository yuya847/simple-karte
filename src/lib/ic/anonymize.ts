// IC を声で記録: before anything goes to Claude, code replaces names, the patient number, phone numbers,
// dates, addresses and room numbers with ［氏名］ and the like — redact() of the MCP (src/lib/mcp/redact.ts),
// plus the people of this chart: the patient's name and reading (also in hiragana, as speech recognition may
// write it), the family and contacts, and the hospital's staff. The person sees the replaced text before it
// is sent. What Claude sends back is mapped onto the original words by code, so the record keeps the real
// words and Claude never sees them.

import { redact } from "../mcp/redact";
import { INITIAL_CONTACTS } from "../patient-contacts";
import { DOCTORS } from "../doctors";
import { NURSES } from "../nurses";
import { STAFF } from "../roles";
import type { Patient } from "../types";

/** The placeholders put in (redact's and this file's). */
export const PLACEHOLDER = /［(?:氏名|患者番号|電話|日付|住所|部屋)］/g;

/** What is known about the patient whose IC this is (the chart may pass more or less of it). */
export type IcPatient = Pick<Patient, "name"> & Partial<Pick<Patient, "id" | "kana" | "attending" | "history">>;

const ROLE_WORD = /(?:医|師|士|課|科|棟|室|員|者)$/;
const JAPANESE_NAME = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]+$/u;
const toHiragana = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const parts = (n: string) => [n, ...n.split(/[\s　（()）]+/)].map((x) => x.trim()).filter(Boolean);

/**
 * The names to replace for this patient, longest first. `names` are replaced wherever they appear: written
 * names of two or more characters, the reading (katakana) and the reading in hiragana of three or more.
 * `short` only before さん・様 …: a one-character written name (修) and a two-character hiragana reading
 * (「とめ」 alone is also a word).
 */
export function icNames(patient: IcPatient, extra: string[] = []): { names: string[]; short: string[] } {
  const contacts = patient.id ? INITIAL_CONTACTS[patient.id] : undefined;
  const people = [
    patient.name,
    patient.attending ?? "",
    ...(patient.history ?? []).map((e) => e.author),
    ...(contacts?.family.map((f) => f.name) ?? []),
    ...(contacts?.contacts.map((c) => c.name) ?? []),
    ...Object.values(STAFF).map((s) => s.name),
    ...DOCTORS.map((d) => d.name),
    ...NURSES.map((n) => n.name),
    ...extra,
  ];
  const written = people.flatMap(parts).filter((n) => JAPANESE_NAME.test(n) && !ROLE_WORD.test(n));
  const kana = patient.kana ? parts(patient.kana) : [];
  const hira = kana.map(toHiragana);
  const names = new Set([...written, ...kana, ...hira].filter((n) => n.length >= 3 || (n.length === 2 && !hira.includes(n))));
  const short = new Set([...patient.name.split(/[\s　]+/), ...hira].filter((n) => n && !names.has(n) && n.length <= 2));
  const byLength = (a: string, b: string) => b.length - a.length;
  return { names: [...names].sort(byLength), short: [...short].sort(byLength) };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const HONORIFIC = "(?=さん|さま|様|ちゃん|くん|君|殿)";
const NO_PATIENTS: Patient[] = [];

/** One line after the replacement: the text sent, and the pieces that tie it to the original words. */
export interface Redacted {
  text: string;
  /** The line in pieces; a piece is either unchanged (orig === anon) or replaced (anon has placeholders). */
  parts: { orig: string; anon: string }[];
}

/** Replace the names and the rest in one line, keeping how each piece maps to the original. */
export function redactLine(original: string, who: { names: string[]; short: string[]; ids?: string[] }): Redacted {
  let t = original;
  for (const id of who.ids ?? []) if (id) t = t.split(id).join("［患者番号］");
  if (who.names.length) t = t.replace(new RegExp(who.names.map(esc).join("|"), "g"), "［氏名］");
  if (who.short.length) t = t.replace(new RegExp(`(?:${who.short.map(esc).join("|")})${HONORIFIC}`, "g"), "［氏名］");
  const text = redact(t, NO_PATIENTS);
  return { text, parts: align(original, text) };
}

/**
 * The pieces of a replaced line against the original: the words between placeholders are unchanged, so the
 * original is matched with them as fixed text and each placeholder (or run of placeholders) as "something".
 * If the two cannot be matched, the whole line is one replaced piece (an excerpt then maps to the whole line).
 */
export function align(original: string, anon: string): Redacted["parts"] {
  const tokens: { lit: string; ph: string }[] = [];
  let last = 0;
  for (const m of anon.matchAll(PLACEHOLDER)) {
    const lit = anon.slice(last, m.index);
    const prev = tokens.at(-1);
    if (prev && !lit) prev.ph += m[0];
    else tokens.push({ lit, ph: m[0] });
    last = m.index! + m[0].length;
  }
  const tail = anon.slice(last);
  if (!tokens.length) return [{ orig: original, anon }];
  const re = new RegExp(`^${tokens.map((t) => `${esc(t.lit)}([\\s\\S]+?)`).join("")}${esc(tail)}$`);
  const m = original.match(re);
  if (!m) return [{ orig: original, anon }];
  const out: Redacted["parts"] = [];
  tokens.forEach((t, i) => {
    if (t.lit) out.push({ orig: t.lit, anon: t.lit });
    out.push({ orig: m[i + 1], anon: t.ph });
  });
  if (tail) out.push({ orig: tail, anon: tail });
  return out;
}

/** The original words for a span of the replaced text; a placeholder touched by the span comes back whole. */
export function toOriginal(r: Redacted, start: number, end: number): string {
  let pos = 0;
  let out = "";
  for (const p of r.parts) {
    const a = pos;
    const b = pos + p.anon.length;
    pos = b;
    if (b <= start || a >= end) continue;
    out += p.orig === p.anon ? p.orig.slice(Math.max(0, start - a), Math.min(p.anon.length, end - a)) : p.orig;
  }
  return out;
}
