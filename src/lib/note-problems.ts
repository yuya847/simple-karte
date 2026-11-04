// プロブレム（#）: a line starting with a half-width "#" (after any indent) names a problem (or a nurse's
// focus); the lines under it, up to the next "#" line or a SOAP mark (S) O) A) P)), are its body. The numbers
// ("#1 尿路感染症") are given by code, from the top, so whatever a person types or moves ends up numbered
// 1, 2, 3 … A "#" inside a line (LAD #7 90%狭窄, a tooth number) and a full-width "＃" at the start of a line
// (＃7 に90%狭窄) are not problems and are left as written. The note stays one string (nothing changes in
// how it is stored); the doctor names the problems, nothing is suggested.

/** Indent, "#", an optional number (only when a space or the end follows it), then the title. */
const PROBLEM = /^([ \t\u3000]*)#[ \t]*(?:(\d+)[.．)）:：]?(?=[ \t]|$))?[ \t]*(.*)$/;
/** A SOAP mark line ends a problem's body (P) does not move with the problem written under A)). */
const SECTION = /^[SOAP]\)/i;

export const isProblemLine = (line: string) => /^[ \t\u3000]*#/.test(line);

/** The line as "#n title" (the indent and the title as written; an empty title keeps a space after the number). */
function numbered(line: string, n: number): { text: string; prefix: number } {
  const m = line.match(PROBLEM)!;
  const text = `${m[1]}#${n} ${m[3]}`;
  return { text, prefix: text.length - m[3].length };
}

export interface Renumbered {
  text: string;
  caret: number;
}

/**
 * Every "#" line numbered from the top (1, 2, 3 …), the caret kept on the same place of its line. A caret
 * inside the "#2 " part lands just after the new "#n ".
 */
export function renumberProblems(text: string, caret = text.length): Renumbered {
  const lines = text.split("\n");
  let n = 0;
  let pos = 0;
  let newCaret = caret;
  let shift = 0;
  const out = lines.map((line, i) => {
    const start = pos;
    pos += line.length + 1;
    const inLine = caret >= start && (caret <= start + line.length || i === lines.length - 1);
    if (!isProblemLine(line)) {
      if (inLine) newCaret = caret + shift;
      return line;
    }
    n++;
    const r = numbered(line, n);
    const oldPrefix = line.length - line.match(PROBLEM)![3].length;
    if (inLine) newCaret = start + shift + (caret - start <= oldPrefix ? r.prefix : r.prefix + (caret - start - oldPrefix));
    shift += r.text.length - line.length;
    return r.text;
  });
  const joined = out.join("\n");
  return { text: joined, caret: Math.max(0, Math.min(newCaret, joined.length)) };
}

export interface ProblemBlock {
  /** 1, 2, 3 … from the top. */
  number: number;
  title: string;
  /** First and last line (inclusive) of the block: the "#" line and its body, without blank lines after it. */
  from: number;
  to: number;
  /** Problems between the same SOAP marks can change places with each other. */
  segment: number;
}

/** The problems of a note, in order, with the lines each one covers. */
export function problemBlocks(text: string): ProblemBlock[] {
  const lines = text.split("\n");
  const out: ProblemBlock[] = [];
  let segment = 0;
  let open: ProblemBlock | null = null;
  const close = (before: number) => {
    if (!open) return;
    let to = before - 1;
    while (to > open.from && !lines[to].trim()) to--;
    open.to = to;
    out.push(open);
    open = null;
  };
  lines.forEach((line, i) => {
    if (SECTION.test(line)) {
      close(i);
      segment++;
      return;
    }
    if (isProblemLine(line)) {
      close(i);
      const m = line.match(PROBLEM)!;
      open = { number: out.length + 1, title: m[3].trim(), from: i, to: i, segment };
    }
  });
  close(lines.length);
  return out;
}

/**
 * The problem at `from` (0-based, in the order of problemBlocks) moved to `to`, the lines between the blocks
 * staying where they are, and the numbers given again. Unchanged when the two are in different SOAP sections.
 */
export function moveProblem(text: string, from: number, to: number): string {
  const blocks = problemBlocks(text);
  if (from === to || !blocks[from] || !blocks[to] || blocks[from].segment !== blocks[to].segment) return text;
  const lines = text.split("\n");
  const same = blocks.filter((b) => b.segment === blocks[from].segment);
  const order = [...same];
  const [moved] = order.splice(same.indexOf(blocks[from]), 1);
  order.splice(same.indexOf(blocks[to]), 0, moved);
  // Put the reordered blocks back into the slots of the original ones (slot k gets order[k]).
  const out: string[] = [];
  let cursor = 0;
  same.forEach((slot, k) => {
    out.push(...lines.slice(cursor, slot.from));
    out.push(...lines.slice(order[k].from, order[k].to + 1));
    cursor = slot.to + 1;
  });
  out.push(...lines.slice(cursor));
  return renumberProblems(out.join("\n")).text;
}
