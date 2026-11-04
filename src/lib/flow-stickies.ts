// 付箋 on the flow sheet's graph (経過表): a short note at a time point, with who wrote it and when — what
// a pencil note on a paper temperature chart was. Kept with the chart's records; only its author removes it.

import type { DayOffset } from "./types";

export interface GraphNote {
  id: string;
  patientId: string;
  /** The time on the graph it is put at (absolute minutes from today 00:00). */
  at: number;
  text: string;
  by: string;
  role: string;
  /** When it was written. */
  written: { day: DayOffset; time: string };
}

export const GRAPH_NOTE_MAX = 120;

/** The text as kept: trimmed, at most GRAPH_NOTE_MAX characters; empty means nothing to put. */
export const cleanNote = (text: string) => text.trim().replace(/\s+/g, " ").slice(0, GRAPH_NOTE_MAX);

/** Only the person who wrote it takes it off. */
export const canRemoveNote = (n: Pick<GraphNote, "by">, me: string) => n.by === me;

/** The notes inside a period, in time order. */
export const notesIn = (notes: GraphNote[], lo: number, hi: number) => notes.filter((n) => n.at >= lo && n.at <= hi).sort((a, b) => a.at - b.at);

/** Notes close together on the screen share one marker (within `px` pixels), so none hides another. */
export function clusterNotes(notes: GraphNote[], x: (at: number) => number, px = 10): { x: number; notes: GraphNote[] }[] {
  const out: { x: number; notes: GraphNote[] }[] = [];
  for (const n of [...notes].sort((a, b) => a.at - b.at)) {
    const nx = x(n.at);
    const last = out.at(-1);
    if (last && nx - last.x < px) last.notes.push(n);
    else out.push({ x: nx, notes: [n] });
  }
  return out;
}
