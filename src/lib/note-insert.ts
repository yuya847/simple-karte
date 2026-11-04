// Putting text into the note being written: at the cursor, or in place of an empty frame
// (S)O)A)P) with nothing written yet).

import { isBlankNote } from "./notes";

export interface Placed {
  text: string;
  /** Where the cursor goes afterwards (just after what was put in). */
  caret: number;
}

/** Text put in place of the selection (start..end). */
export function insertAt(text: string, start: number, end: number, add: string): Placed {
  const s = Math.max(0, Math.min(start, text.length));
  const e = Math.max(s, Math.min(end, text.length));
  return { text: text.slice(0, s) + add + text.slice(e), caret: s + add.length };
}

/**
 * A block of lines (a filled template): it replaces the note while nothing is written yet; otherwise it
 * goes in at the cursor, on lines of its own.
 */
export function placeBlock(note: string, start: number, end: number, block: string): Placed {
  const body = block.replace(/\s+$/, "");
  if (isBlankNote(note)) return { text: `${body}\n`, caret: body.length + 1 };
  const s = Math.max(0, Math.min(start, note.length));
  const e = Math.max(s, Math.min(end, note.length));
  const before = s > 0 && note[s - 1] !== "\n" ? "\n" : "";
  const after = note[e] === "\n" ? "" : "\n";
  return insertAt(note, s, e, `${before}${body}${after}`);
}
