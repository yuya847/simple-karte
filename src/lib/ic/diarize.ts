// IC を声で記録, 声での分離: telling speakers apart by the voice (話者分離, speaker diarization) inside this
// browser, so the voice never leaves the device. The person turns 声でも分ける on (only then is the model
// fetched); the window records the voice in pieces of a few minutes next to the browser's speech recognition,
// and a Web Worker (public/diarize/) runs the open-source sherpa-onnx diarization (WebAssembly) on each piece.
// What comes back is stretches of time with a speaker number. Here they are lined up with the window's lines
// by time, and Claude then says who each number is from the replaced text — one person per number — shown as
// 見立て. A person's choice still wins. Why this one and the other choices: docs/ic-voice.md.

import type { IcLine } from "./transcript";

/** The sample rate the diarization model takes (Hz). */
export const SAMPLE_RATE = 16_000;
/** A piece of the recording is diarized when it reaches this length (ms), so the wait after 止める stays short. */
export const PIECE_MS = 5 * 60_000;

/** One stretch of speech: its speaker number and when (ms from the start of the piece). */
export interface DiarizedSegment {
  speaker: string;
  startMs: number;
  endMs: number;
}

/** sherpa-onnx's result (seconds, speaker 0, 1, …) as stretches; nonsense entries are dropped. */
export function fromSherpa(segments: unknown): DiarizedSegment[] {
  if (!Array.isArray(segments)) return [];
  return segments
    .filter((s): s is { start: number; end: number; speaker: number } => !!s && Number.isFinite(s.start) && Number.isFinite(s.end) && Number.isInteger(s.speaker) && s.speaker >= 0 && s.end > s.start)
    .map((s) => ({ speaker: `s${s.speaker}`, startMs: Math.round(s.start * 1000), endMs: Math.round(s.end * 1000) }))
    .sort((a, b) => a.startMs - b.startMs);
}

/** One piece of the recording, diarized: which piece, when it began (ms since 1970), and its stretches. */
export interface VoicePiece {
  take: number;
  startedAt: number;
  segments: DiarizedSegment[];
}

/** Chrome writes the first words a moment after they were said: a line is taken to begin this much earlier (ms). */
export const LEAD_MS = 1500;
/**
 * "2-s0": piece 2, speaker 0. The model numbers speakers in each piece on its own, so a number holds only within
 * a piece (Claude names each one).
 */
export const voiceId = (take: number, speaker: string) => `${take}-${speaker}`;

/**
 * The voice number of each line: the stretches its time touches (from LEAD_MS before it began to when it
 * ended), counted by how long they overlap; the number with the most wins. Lines without times (pasted text)
 * and lines no stretch touches get none.
 */
export function voicesForLines(lines: IcLine[], pieces: VoicePiece[]): Map<number, string> {
  const spans = pieces.flatMap((p) => p.segments.map((s) => ({ id: voiceId(p.take, s.speaker), a: p.startedAt + s.startMs, b: p.startedAt + s.endMs })));
  const out = new Map<number, string>();
  for (const l of lines) {
    if (l.t0 === undefined) continue;
    const a = l.t0 - LEAD_MS;
    const b = Math.max(l.t1 ?? l.t0, l.t0);
    const score = new Map<string, number>();
    for (const s of spans) {
      const overlap = Math.min(b, s.b) - Math.max(a, s.a);
      if (overlap > 0) score.set(s.id, (score.get(s.id) ?? 0) + overlap);
    }
    let best = "";
    let most = 0;
    for (const [id, n] of score) if (n > most) [best, most] = [id, n];
    if (best) out.set(l.id, best);
  }
  return out;
}

/** The voice numbers in the order they first speak. */
export const voicesOf = (lines: IcLine[]): string[] => [...new Set(lines.flatMap((l) => (l.voice ? [l.voice] : [])))];

/**
 * The lines sent for Claude to say who each voice number is: every line with a number, or — when that is more
 * than `maxChars` of sent text — up to `per` lines of each number.
 */
export function voiceSample(lines: IcLine[], textOf: (l: IcLine) => string, maxChars = 12000, per = 8): IcLine[] {
  const voiced = lines.filter((l) => l.voice);
  if (voiced.reduce((n, l) => n + textOf(l).length, 0) <= maxChars) return voiced;
  const count = new Map<string, number>();
  return voiced.filter((l) => {
    const n = count.get(l.voice!) ?? 0;
    count.set(l.voice!, n + 1);
    return n < per;
  });
}
