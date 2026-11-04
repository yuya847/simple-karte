// 記事の同時編集: several people correct the same past note at once. Each types from the same base (the note as
// it was confirmed) and sends what they have; every page merges all the texts in the same order (by tab id,
// diff3.ts), so all of them see the same text while typing, and each caret is placed in that merged text.

import { mapCursor, merge3Text } from "./diff3";

export interface Typed {
  tab: string;
  text: string;
  cursor?: number;
}

const byTab = (a: Typed, b: Typed) => (a.tab < b.tab ? -1 : a.tab > b.tab ? 1 : 0);

/** All the texts typed from the same base, merged in a fixed order so that every page gets the same result. */
export function mergeTyping(base: string, parts: readonly Typed[]): string {
  const sorted = [...parts].sort(byTab);
  let out = sorted[0]?.text ?? base;
  for (const p of sorted.slice(1)) out = merge3Text(base, out, p.text).text;
  return out;
}

export type CaretPiece = { text: string } | { caret: string };

/** The merged text cut where each person's caret is: pieces of text with the carets (by tab) between them. */
export function withCarets(merged: string, parts: readonly Typed[]): CaretPiece[] {
  const carets = parts
    .filter((p) => p.cursor !== undefined)
    .map((p) => ({ tab: p.tab, at: mapCursor(p.text, merged, p.cursor!) }))
    .sort((a, b) => a.at - b.at || byTab({ tab: a.tab, text: "" }, { tab: b.tab, text: "" }));
  const out: CaretPiece[] = [];
  let i = 0;
  for (const c of carets) {
    if (c.at > i) out.push({ text: merged.slice(i, c.at) });
    out.push({ caret: c.tab });
    i = Math.max(i, c.at);
  }
  if (i < merged.length) out.push({ text: merged.slice(i) });
  return out;
}
