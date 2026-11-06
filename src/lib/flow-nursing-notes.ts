import { minutesOf } from "./dates";
import { noteKey, noteText } from "./notes";
import type { HistoryEntry, NoteEntry } from "./types";

export type NoteRoleFilter = "nurse" | "all";
const head = (s: string) => s.trim().split("\n")[0];
const short = (s: string, max: number) => Array.from(s).length > max ? Array.from(s).slice(0, max).join("") + "…" : s;

/** 本文の変換や推測をせず、各欄の冒頭だけを並べる。 */
export function nursingPreview(n: NoteEntry): [string, string] {
  if (n.focus?.length) {
    const f = n.focus[0];
    return [short(`＃${f.title || "フォーカス"}`, 36), [f.d && `D) ${short(head(f.d), 16)}`, f.act && `Act) ${short(head(f.act), 16)}`, f.r && `R) ${short(head(f.r), 16)}`].filter(Boolean).join(" / ")];
  }
  if (n.soap) return ["＃SOAP", Object.entries(n.soap).filter(([, v]) => v?.trim()).map(([k, v]) => `${k.toUpperCase()}) ${short(head(v!), 16)}`).join(" / ")];
  if (n.timeline?.length) return ["＃経時記録", n.timeline.map(t => `${t.time} ${head(t.text)}`).join(" / ")];
  const lines = noteText(n).trim().split("\n");
  return [short(lines[0] || "看護記録", 36), lines.slice(1).map(head).join(" / ")];
}

/** 時間位置を保ち、横に重なるものだけ別の段へ置く。右端は表示枠内で切る。 */
export function nursingNoteLayout(entries: HistoryEntry[], filter: NoteRoleFilter, lo: number, hi: number, xAbs: (at: number) => number, plotW: number) {
  const ends: number[] = [];
  return entries.filter((n): n is NoteEntry => n.kind === "note" && (filter === "all" || n.role === "看護師"))
    .map(n => ({ n, at: n.day * 1440 + minutesOf(n.time) }))
    .filter(n => n.at >= lo && n.at < hi)
    .sort((a, b) => a.at - b.at)
    .map(({ n, at }) => {
      const left = Math.max(0, xAbs(at));
      const width = Math.max(1, Math.min(240, plotW - left));
      let lane = ends.findIndex(end => end + 4 <= left);
      if (lane < 0) lane = ends.length;
      ends[lane] = left + width;
      return { key: noteKey(n), n, at, left, width, lane, preview: nursingPreview(n), full: noteText(n) };
    });
}
