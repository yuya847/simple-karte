// The note as blocks (lines) for editing one line at a time, the way Notion does: the stored text stays one
// string (lines joined with "\n" — nothing changes in how a note is saved or read), and the editor splits it
// into lines, moves the caret between them, and puts them back together. A "＃" line (a problem) and the
// body under it move as one block; any other line moves alone. The numbers of the "＃" lines are given again
// by renumberProblems after every move (note-problems.ts).

import { indentLines, INDENT } from "./note-edit";
import { isProblemLine, moveProblem, problemBlocks, problemMarkerEnd, renumberProblems } from "./note-problems";

/** The lines of a note; joining them with "\n" gives the text back exactly (a trailing "\n" is a last empty line). */
export const toLines = (text: string) => text.split("\n");
export const fromLines = (lines: string[]) => lines.join("\n");

export interface Pos {
  line: number;
  col: number;
}

/** The line and column of an offset in the text (clamped to the text). */
export function posOf(text: string, offset: number): Pos {
  const at = Math.max(0, Math.min(offset, text.length));
  const line = text.slice(0, at).split("\n").length - 1;
  const col = at - (text.lastIndexOf("\n", at - 1) + 1);
  return { line, col };
}

/** The offset of a line and column in the text (clamped to the line). */
export function offsetOf(text: string, pos: Pos): number {
  const lines = toLines(text);
  const line = Math.max(0, Math.min(pos.line, lines.length - 1));
  let start = 0;
  for (let i = 0; i < line; i++) start += lines[i].length + 1;
  return start + Math.max(0, Math.min(pos.col, lines[line].length));
}

export interface Edited {
  text: string;
  /** Where the caret goes (an offset in the new text). */
  caret: number;
}

const leadingSpace = (line: string) => line.match(/^[ \t　]*/)![0];

/**
 * Enter: the line split at the caret into two. The new line keeps the indent of the line above; under a "＃"
 * line it is indented one step more (the body of the problem). A line that is only indent loses it instead
 * (Enter on an empty indented line steps back out).
 */
export function splitLine(text: string, line: number, col: number): Edited {
  const lines = toLines(text);
  const cur = lines[line] ?? "";
  const c = Math.max(0, Math.min(col, cur.length));
  const head = cur.slice(0, c);
  const tail = cur.slice(c);
  // Problems behave like a numbered list in Word or Notion: Enter on a problem makes the next "＃" at the same
  // level (renumbered afterwards); Enter on an empty "＃n" ends the list — the marker goes and the line becomes
  // the body of the problem above.
  const markerEnd = problemMarkerEnd(cur);
  if (markerEnd !== null && c >= markerEnd) {
    if (!cur.slice(markerEnd).trim()) {
      const body = leadingSpace(cur) + INDENT;
      const out = fromLines([...lines.slice(0, line), body, ...lines.slice(line + 1)]);
      return { text: out, caret: offsetOf(out, { line, col: body.length }) };
    }
    const marker = `${leadingSpace(cur)}＃ `;
    const out = fromLines([...lines.slice(0, line), head.replace(/[ \t　]+$/, ""), marker + tail.replace(/^[ \t　]*/, ""), ...lines.slice(line + 1)]);
    return { text: out, caret: offsetOf(out, { line: line + 1, col: marker.length }) };
  }
  let indent: string;
  if (!head.trim() && !tail.trim()) indent = "";
  else if (isProblemLine(head)) indent = leadingSpace(head) + INDENT;
  else indent = leadingSpace(head);
  const next = [...lines.slice(0, line), head.trim() || tail.trim() ? head : "", indent + tail.replace(/^[ \t　]*/, ""), ...lines.slice(line + 1)];
  const out = fromLines(next);
  return { text: out, caret: offsetOf(out, { line: line + 1, col: indent.length }) };
}

/** Backspace at the start of a line: the line joins the end of the line above (the caret at the join). */
export function joinWithPrevious(text: string, line: number): Edited {
  const lines = toLines(text);
  if (line <= 0 || line >= lines.length) return { text, caret: offsetOf(text, { line, col: 0 }) };
  const prev = lines[line - 1];
  const next = [...lines.slice(0, line - 1), prev + lines[line], ...lines.slice(line + 1)];
  const out = fromLines(next);
  return { text: out, caret: offsetOf(out, { line: line - 1, col: prev.length }) };
}

/** Delete at the end of a line: the line below joins it. */
export const joinWithNext = (text: string, line: number): Edited => {
  const lines = toLines(text);
  if (line + 1 >= lines.length) return { text, caret: offsetOf(text, { line, col: lines[line]?.length ?? 0 }) };
  const r = joinWithPrevious(text, line + 1);
  return r;
};

/** The line replaced by what was typed into it (a pasted "\n" makes more lines); the caret after it. */
export function replaceLine(text: string, line: number, value: string, caretInLine = value.length): Edited {
  const lines = toLines(text);
  const next = [...lines.slice(0, line), ...value.split("\n").map((line) => isDividerLine(line) ? "---" : line), ...lines.slice(line + 1)];
  const out = fromLines(next);
  const before = value.slice(0, caretInLine);
  const added = before.split("\n");
  return { text: out, caret: offsetOf(out, { line: line + added.length - 1, col: added[added.length - 1].length }) };
}

export interface Unit {
  /** First and last line (inclusive). */
  from: number;
  to: number;
  /** A "＃" line with its body (true) or a single line (false). */
  problem: boolean;
  /** The problem's index (in problemBlocks' order) when it is one. */
  index: number;
}

/** What moves with a line's grip: a "＃" line takes its body; any other line goes alone. */
export function unitAt(text: string, line: number): Unit {
  const blocks = problemBlocks(text);
  const i = blocks.findIndex((b) => b.from === line);
  if (i >= 0) return { from: blocks[i].from, to: blocks[i].to, problem: true, index: i };
  return { from: line, to: line, problem: false, index: -1 };
}

/**
 * The lines from..to (inclusive) taken out and put back before the line `at` (counted in the original
 * lines; `at` = the number of lines puts them at the end). The "＃" numbers are given again. Dropping a
 * block onto itself changes nothing.
 */
export function moveLines(text: string, from: number, to: number, at: number): string {
  const lines = toLines(text);
  const a = Math.max(0, Math.min(from, to));
  const b = Math.min(lines.length - 1, Math.max(from, to));
  const target = Math.max(0, Math.min(at, lines.length));
  if (target >= a && target <= b + 1) return text;
  const block = lines.slice(a, b + 1);
  const rest = [...lines.slice(0, a), ...lines.slice(b + 1)];
  const k = target > b ? target - block.length : target;
  rest.splice(k, 0, ...block);
  return renumberProblems(fromLines(rest)).text;
}

/** Where the caret lands after a move: the first line of the moved block, in its new place. */
export function movedLine(from: number, to: number, at: number): number {
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  if (at >= a && at <= b + 1) return a;
  return at > b ? at - (b - a + 1) : at;
}

/**
 * Alt+↑ / Alt+↓: the line's unit one step up or down. A "＃" block changes places with the problem next to it
 * (moveProblem: the gaps stay, and it does not cross a SOAP mark); any other line swaps with the line next to
 * it. The caret keeps its column on the moved line.
 */
export function nudgeLine(text: string, line: number, col: number, dir: -1 | 1): Edited {
  const lines = toLines(text);
  const u = unitAt(text, line);
  const keep = { text, caret: offsetOf(text, { line, col }) };
  if (u.problem) {
    const blocks = problemBlocks(text);
    const other = u.index + dir;
    if (!blocks[other] || blocks[other].segment !== blocks[u.index].segment) return keep;
    const out = moveProblem(text, u.index, other);
    const after = problemBlocks(out);
    // The moved problem is now where the other one was (in the order of blocks).
    const mine = after[other];
    return { text: out, caret: offsetOf(out, { line: mine.from, col }) };
  }
  const at = dir < 0 ? line - 1 : line + 2;
  if (at < 0 || at > lines.length) return keep;
  const out = moveLines(text, line, line, at);
  return { text: out, caret: offsetOf(out, { line: movedLine(line, line, at), col }) };
}

/** A whole line of three hyphens or horizontal bars, allowing indentation. */
export const isDividerLine = (line: string): boolean => /^(---|―――)$/.test(line.trim());

/** Section labels get rules; problem headings and individual timestamps do not. */
export function isSectionHeadingLine(line: string): boolean {
  const t = line.trim();
  return SOAP.test(t) || DAR.test(t) || t === "【経時記録】";
}

const SOAP = /^[SOAP]\)/i;
const DAR = /^(D|Act|R)\)/;
const TIME = /^\d{1,2}:\d{2}(\s|$)/;
const FOCUS_BLANK = /^[ \t　]*#\s*$/;

/**
 * Lines drawn a little bolder while writing: a "＃" problem (or "# 見出し" of a nurse's focus, even still
 * empty), the SOAP marks S) O) A) P), a focus's D) Act) R), the head of a 経時記録 and its "hh:mm" lines.
 */
export function isHeadingLine(line: string): boolean {
  const t = line.trim();
  return isProblemLine(line) || /^[ \t　]*#[ \t]*(?=[^\d\s])/.test(line) || FOCUS_BLANK.test(line) || SOAP.test(t) || DAR.test(t) || TIME.test(t) || t === "【経時記録】";
}

/** Tab / Shift+Tab, preserving both ends of the selection through renumbering. */
export function indentBlock(text: string, line: number, start: number, end = start, out = false) {
  const r = indentLines(toLines(text)[line] ?? "", start, end, out);
  const changed = replaceLine(text, line, r.text).text;
  const base = offsetOf(changed, { line, col: 0 });
  return {
    text: renumberProblems(changed).text,
    start: renumberProblems(changed, base + r.start).caret,
    end: renumberProblems(changed, base + r.end).caret,
  };
}
