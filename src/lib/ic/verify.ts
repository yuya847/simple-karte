// IC を声で記録: the check that Claude added nothing. Each piece Claude places must be found, as it is (spaces
// aside), in the line it names of the text that was sent; anything else is dropped and counted. Used by the
// server (/api/ic-transcript) and again by the window.

/** Where a piece of text is in a line, ignoring spaces (speech recognition and copying may differ in them). */
export function locate(hay: string, needle: string): [number, number] | null {
  const want = needle.replace(/\s+/g, "");
  if (!want) return null;
  const idx: number[] = [];
  let flat = "";
  for (let i = 0; i < hay.length; i++) {
    if (/\s/.test(hay[i])) continue;
    idx.push(i);
    flat += hay[i];
  }
  const at = flat.indexOf(want);
  if (at < 0) return null;
  return [idx[at], idx[at + want.length - 1] + 1];
}

export interface Quote {
  line: number;
  /** Copied from the line; "" = the whole line. */
  text: string;
}
export interface Placement {
  explained: Quote[];
  response: Quote[];
  attendees: Quote[];
}
export const PLACEMENT_FIELDS = ["explained", "response", "attendees"] as const;

/** A piece found in its line: where it is in the text that was sent. */
export interface Found {
  line: number;
  start: number;
  end: number;
}

/**
 * Keep only the pieces that are in the line they name (the text sent to Claude). Pieces not found there — words
 * Claude added or changed — and pieces of unknown lines are returned apart, never placed.
 */
export function verifyQuotes(quotes: Quote[], sent: Map<number, string>): { found: Found[]; added: Quote[] } {
  const found: Found[] = [];
  const added: Quote[] = [];
  for (const q of quotes) {
    const hay = sent.get(q.line);
    if (hay === undefined) {
      added.push(q);
      continue;
    }
    if (!q.text.trim()) {
      found.push({ line: q.line, start: 0, end: hay.length });
      continue;
    }
    const at = locate(hay, q.text);
    if (at) found.push({ line: q.line, start: at[0], end: at[1] });
    else added.push(q);
  }
  return { found, added };
}

/** Verify every field of a placement against the sent lines. */
export function verifyPlacement(p: Placement, sent: Map<number, string>): { found: Record<keyof Placement, Found[]>; added: Quote[] } {
  const found = {} as Record<keyof Placement, Found[]>;
  const added: Quote[] = [];
  for (const k of PLACEMENT_FIELDS) {
    const r = verifyQuotes(p[k] ?? [], sent);
    found[k] = r.found;
    added.push(...r.added);
  }
  return { found, added };
}

