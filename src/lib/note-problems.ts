// 全角＃だけを採番する。半角 #（冠動脈番号など）は書かれたまま残す。
// 字下げは半角2文字、タブ1文字、全角空白1文字で1段。
const FULL = /^([ \t　]*)＃[ \t]*(?:(\d+(?:-\d+)*)[.．)）:：]?(?=[ \t]|$))?[ \t]*(.*)$/;
const indentDepth = (indent: string) => Math.floor(indent.replace(/[\t　]/g, "  ").length / 2);
/** A SOAP mark line ends a problem's body (P) does not move with the problem written under A)). */
const SECTION = /^[SOAP]\)/i;

const problemMatch = (line: string) => line.match(FULL);

export const isProblemLine = (line: string) => problemMatch(line) !== null;

/** The line as "＃n title" (the indent and the title as written; an empty title keeps a space after the number). */
function numbered(line: string, n: string): { text: string; prefix: number } {
  const m = problemMatch(line)!;
  const text = `${m[1]}＃${n} ${m[3]}`;
  return { text, prefix: text.length - m[3].length };
}

export interface Renumbered {
  text: string;
  caret: number;
}

/**
 * Every "＃" line numbered by indent (1, 1-1, 1-1-1, 2 …), the caret kept on the same place of its line. A caret
 * inside the "＃2 " part lands just after the new "＃n ".
 */
export function renumberProblems(text: string, caret = text.length): Renumbered {
  const lines = text.split("\n");
  const counters: number[] = [];
  const indents: number[] = [];
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
    const indent = indentDepth(problemMatch(line)![1]);
    while (indents.length && indents.at(-1)! >= indent) indents.pop();
    const depth = indents.length;
    indents.push(indent);
    counters[depth] = (counters[depth] ?? 0) + 1;
    counters.length = depth + 1;
    const r = numbered(line, counters.join("-"));
    const oldPrefix = line.length - problemMatch(line)![3].length;
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
  /** First and last line (inclusive) of the block: the "＃" line and its body, without blank lines after it. */
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
      open = { number: out.length + 1, title: problemMatch(line)![3].trim(), from: i, to: i, segment };
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

export interface ProblemNode extends ProblemBlock {
  /** Display number, e.g. "1-2"; number remains the legacy flat index. */
  path: string;
  children: ProblemNode[];
}

/** Read the written numbers as a tree; unnumbered lines use the editor's numbering.
 * Missing parents become roots; SOAP boundaries never inherit a parent.
 * The legacy flat problemBlocks API and its numeric indices stay unchanged.
 */
export function problemTree(text: string): ProblemNode[] {
  const normalized = renumberProblems(text).text.split("\n");
  const lines = text.split("\n");
  const roots: ProblemNode[] = [];
  const stack: ProblemNode[] = [];
  for (const block of problemBlocks(text)) {
    const path = problemMatch(lines[block.from])![2] ?? problemMatch(normalized[block.from])![2]!;
    const parentPath = path.split("-").slice(0, -1).join("-");
    while (stack.length && (stack.at(-1)!.path !== parentPath || stack.at(-1)!.segment !== block.segment)) stack.pop();
    const node: ProblemNode = { ...block, path, children: [] };
    (stack.at(-1)?.children ?? roots).push(node);
    stack.push(node);
  }
  return roots;
}
