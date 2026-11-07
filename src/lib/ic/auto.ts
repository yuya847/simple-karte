// IC を声で記録: when the lines go to Claude by themselves (文脈で自動に). While recording, every few new lines
// or seconds — and at once when recording stops or text is pasted — the lines nobody labelled are sent (after
// code replaced names and the rest) with the lines just before them as context, and Claude's guesses come back
// as 見立て. Only with the consent mark, and not when the person chose to see the text before it is sent.
// The limits keep the cost and the wait small: lines and characters in one call, calls in one window, and a
// gap between calls (a failed call waits longer before the next).

import type { IcLine } from "./transcript";

export const AUTO = {
  /** Send when this many lines are waiting … */
  everyLines: 6,
  /** … or when the oldest waiting line has waited this long (ms). */
  everyMs: 20_000,
  /** Never two calls closer than this (ms). */
  minGapMs: 8_000,
  /** Calls in one window; after that only the button sends. */
  maxCalls: 60,
  /** Lines before the first waiting one, sent as context (room for them is kept). */
  context: 12,
  /** Lines and characters in one call. */
  maxLines: 60,
  maxChars: 6000,
  /** After a failure, the next call waits this long times the failures in a row (ms); 3 in a row stop it. */
  backoffMs: 30_000,
  maxFails: 3,
} as const;

/** Lines still waiting for a guess: nobody labelled them, no guess yet, and not sent before. */
export const waitingLines = (lines: IcLine[], asked: ReadonlySet<number>) => lines.filter((l) => !l.said && !l.guess && !asked.has(l.id));

export interface AutoState {
  calls: number;
  /** When the last call was sent (or, after a failure, the time the wait counts from). */
  lastAt: number;
  /** When the oldest line now waiting was first seen. */
  firstWaitingAt: number | null;
  fails: number;
}
export const newAutoState = (): AutoState => ({ calls: 0, lastAt: 0, firstWaitingAt: null, fails: 0 });

/** Whether to send now. `flush` = recording just stopped or text was pasted (send what is waiting at once). */
export function dueNow(waiting: number, s: AutoState, now: number, flush: boolean): boolean {
  if (!waiting || s.calls >= AUTO.maxCalls || s.fails >= AUTO.maxFails) return false;
  if (now - s.lastAt < AUTO.minGapMs + AUTO.backoffMs * s.fails) return false;
  if (flush || waiting >= AUTO.everyLines) return true;
  return s.firstWaitingAt !== null && now - s.firstWaitingAt >= AUTO.everyMs;
}

/**
 * One call: from the first waiting line on (waiting lines and the labelled ones between them), up to the limits
 * less the room kept for context, then as many lines before it as context as still fit. `ask` = the waiting
 * lines in it (Claude guesses those). `textOf` is the text that is sent (names replaced), so the limit counts
 * what really goes.
 */
export function autoBatch(lines: IcLine[], asked: ReadonlySet<number>, textOf: (l: IcLine) => string): { send: IcLine[]; ask: number[] } {
  const isWaiting = (l: IcLine) => !l.said && !l.guess && !asked.has(l.id);
  const first = lines.findIndex(isWaiting);
  if (first < 0) return { send: [], ask: [] };
  const room = AUTO.maxLines - Math.min(AUTO.context, first);
  const body: IcLine[] = [];
  let chars = 0;
  for (let i = first; i < lines.length && body.length < room; i++) {
    const n = textOf(lines[i]).length;
    if (body.length && chars + n > AUTO.maxChars) break;
    body.push(lines[i]);
    chars += n;
  }
  const before: IcLine[] = [];
  for (let i = first - 1; i >= 0 && before.length < AUTO.context && body.length + before.length < AUTO.maxLines; i--) {
    const n = textOf(lines[i]).length;
    if (chars + n > AUTO.maxChars) break;
    before.unshift(lines[i]);
    chars += n;
  }
  return { send: [...before, ...body], ask: body.filter(isWaiting).map((l) => l.id) };
}
