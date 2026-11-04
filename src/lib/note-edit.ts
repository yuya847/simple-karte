// Keys in the note box: Tab puts two spaces at the start of the selected lines (Shift+Tab takes them away),
// ⌘B / Ctrl+B wraps the selection in **…** (bold) and ⌘I / Ctrl+I in *…* (italic), the way Markdown writes
// them. The note stays one string; the marks are drawn in the record (note-marks.ts).

export const INDENT = "  ";

export interface Range {
  text: string;
  start: number;
  end: number;
}

const lineStartOf = (text: string, at: number) => text.lastIndexOf("\n", at - 1) + 1;

/** Two spaces at the start of every line the selection touches; Shift+Tab removes up to two (or one 全角). */
export function indentLines(text: string, start: number, end: number, out = false): Range {
  const s = Math.max(0, Math.min(start, end, text.length));
  const e = Math.max(s, Math.min(Math.max(start, end), text.length));
  const first = lineStartOf(text, s);
  // A selection ending just after a line break does not take the next line.
  const lastLineStart = lineStartOf(text, e > s && text[e - 1] === "\n" ? e - 1 : e);
  const stop = text.indexOf("\n", lastLineStart);
  const blockEnd = stop === -1 ? text.length : stop;
  const lines = text.slice(first, blockEnd).split("\n");
  let firstDelta = 0;
  let total = 0;
  const changed = lines.map((line, i) => {
    const next = out ? line.replace(/^(?: {1,2}|　|\t)/, "") : INDENT + line;
    const d = next.length - line.length;
    if (i === 0) firstDelta = d;
    total += d;
    return next;
  });
  const result = text.slice(0, first) + changed.join("\n") + text.slice(blockEnd);
  const newStart = Math.max(first, s + firstDelta);
  const newEnd = s === e ? newStart : Math.max(newStart, e + total);
  return { text: result, start: newStart, end: newEnd };
}

export type Mark = "**" | "*";

/**
 * The selection wrapped in the mark (the inner text stays selected); already wrapped — by the selection
 * itself or by the marks just around it — the marks come off. With nothing selected, a pair of marks goes in
 * and the caret between them; a caret just before a closing mark steps over it (the end of the bold text).
 */
export function toggleMark(text: string, start: number, end: number, mark: Mark): Range {
  const s = Math.max(0, Math.min(start, end, text.length));
  const e = Math.max(s, Math.min(Math.max(start, end), text.length));
  const m = mark.length;
  if (s === e) {
    if (text.slice(s, s + m) === mark && text.slice(s + m, s + m + 1) !== "*") return { text, start: s + m, end: s + m };
    return { text: text.slice(0, s) + mark + mark + text.slice(s), start: s + m, end: s + m };
  }
  const sel = text.slice(s, e);
  const around = text.slice(s - m, s) === mark && text.slice(e, e + m) === mark;
  // Bold marks around an italic toggle (or the reverse) are a different mark, not this one.
  const outerIsOther = mark === "*" ? text.slice(s - 2, s) === "**" && text.slice(e, e + 2) === "**" : false;
  if (sel.length >= 2 * m && sel.startsWith(mark) && sel.endsWith(mark) && !(mark === "*" && sel.startsWith("**"))) {
    const inner = sel.slice(m, -m);
    return { text: text.slice(0, s) + inner + text.slice(e), start: s, end: s + inner.length };
  }
  if (around && !outerIsOther && s >= m) {
    return { text: text.slice(0, s - m) + sel + text.slice(e + m), start: s - m, end: s - m + sel.length };
  }
  return { text: text.slice(0, s) + mark + sel + mark + text.slice(e), start: s + m, end: s + m + sel.length };
}
