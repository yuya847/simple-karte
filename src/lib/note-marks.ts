// Drawing a note for reading: **…** is bold and *…* italic (as Markdown writes them), and a line starting
// with "#" (a problem, "#1 尿路感染症") is a heading. The stored text keeps the marks as typed; searching,
// copying and printing use the plain string.

import { isProblemLine } from "./note-problems";

export type MarkKind = "text" | "b" | "i" | "bi";

export interface MarkPart {
  kind: MarkKind;
  text: string;
}

export interface MarkLine {
  /** A "#" line: the name of a problem. */
  heading: boolean;
  parts: MarkPart[];
}

const MARKS = /\*\*\*([^*\n]+?)\*\*\*|\*\*([^\n]+?)\*\*|\*([^*\n]+?)\*/g;

/** One line split into plain, bold and italic pieces. */
export function markParts(line: string): MarkPart[] {
  const out: MarkPart[] = [];
  let last = 0;
  for (const m of line.matchAll(MARKS)) {
    if (m.index > last) out.push({ kind: "text", text: line.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: "bi", text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "b", text: m[2] });
    else out.push({ kind: "i", text: m[3] });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ kind: "text", text: line.slice(last) });
  return out;
}

/** The lines of a note with their marks read, for drawing. */
export function markLines(text: string): MarkLine[] {
  return text.split("\n").map((line) => ({ heading: isProblemLine(line), parts: markParts(line) }));
}

/** Whether the text has anything to draw differently (no marks: the plain string is drawn as it is). */
export const hasMarks = (text: string) => /\*[^*\n]+\*/.test(text) || /^[ \t\u3000]*\uff03/m.test(text);
