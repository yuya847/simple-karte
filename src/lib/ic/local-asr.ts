// IC を声で記録 — the adapter for a speech-recognition server inside the hospital (院内のサーバー), e.g.
// Haas-ja-v1.0 (Japanese speech recognition, Apache-2.0) with an open-source diarization model, on Linux with an
// NVIDIA GPU. It does not run on Vercel or in the browser. When NEXT_PUBLIC_IC_LOCAL_ASR_URL names that server,
// the window does not use the browser's speech recognition (Chrome sends the voice to Google): it records the
// voice in pieces, turns each piece into 16 kHz WAV in the browser and sends it from the browser straight to
// that server, so the voice stays in the hospital's network. The server answers with stretches of speech: start
// and end (seconds from the start of the piece), a speaker number and the words. They become the window's lines,
// each with its voice number, and Claude then says who each number is from the replaced text — as with the
// voice told apart in the browser. The contract and how to set up the server: docs/ic-voice.md.

import { addLine, clockNow, type IcLine } from "./transcript";
import { voiceId } from "./diarize";

/** The server's address, from NEXT_PUBLIC_IC_LOCAL_ASR_URL (set when the app is built; not a secret). Else null. */
export function localAsrUrl(raw: string | undefined = process.env.NEXT_PUBLIC_IC_LOCAL_ASR_URL): string | null {
  const v = raw?.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** A piece goes to the server every this long (ms) while recording, so lines come about once a minute. */
export const LOCAL_PIECE_MS = 60_000;

/** One stretch from the server: when (ms from the start of the piece), the speaker number, and the words. */
export interface LocalSegment {
  startMs: number;
  endMs: number;
  speaker: string;
  text: string;
}

/**
 * The server's answer: `{ "segments": [{ "start": 0.8, "end": 3.1, "speaker": 0, "text": "…" }] }` — seconds,
 * a speaker number (or a short name such as "speaker_1"), the words. Entries that do not fit are dropped.
 */
export function readLocalAsr(json: unknown): LocalSegment[] {
  const segs = (json as { segments?: unknown } | null)?.segments;
  if (!Array.isArray(segs)) return [];
  const out: LocalSegment[] = [];
  for (const s of segs) {
    const x = s as { start?: unknown; end?: unknown; speaker?: unknown; text?: unknown } | null;
    if (!x || typeof x.start !== "number" || typeof x.end !== "number" || !(x.end >= x.start) || typeof x.text !== "string" || !x.text.trim()) continue;
    const sp = typeof x.speaker === "number" && Number.isInteger(x.speaker) && x.speaker >= 0 ? `s${x.speaker}` : typeof x.speaker === "string" ? x.speaker.replace(/[^A-Za-z0-9_]/g, "").slice(0, 20) : "";
    if (!sp) continue;
    out.push({ startMs: Math.round(x.start * 1000), endMs: Math.round(x.end * 1000), speaker: sp, text: x.text.trim().slice(0, 1000) });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/** The piece's stretches as new lines after `lines`: clock time, times for lining up, the words, the voice number. */
export function linesFromLocal(lines: IcLine[], piece: { take: number; startedAt: number }, segs: LocalSegment[]): IcLine[] {
  let out = lines;
  for (const s of segs) {
    const t0 = piece.startedAt + s.startMs;
    const next = addLine(out, s.text, clockNow(new Date(t0)), null, { t0, t1: piece.startedAt + s.endMs });
    if (next === out) continue;
    out = [...next.slice(0, -1), { ...next.at(-1)!, voice: voiceId(piece.take, s.speaker) }];
  }
  return out;
}

/** 16 kHz mono samples (−1〜1) as a 16-bit PCM WAV file, which the server reads without converting. */
export function wavBytes(samples: Float32Array, rate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((x, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 0x7fff, true));
  return buf;
}
