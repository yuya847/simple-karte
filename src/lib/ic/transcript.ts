// IC を声で記録: the lines of what was said, each with the clock time and who said it. A person chooses the
// speaker while recording (医師・患者・家族・看護師, keys 1〜4) or afterwards; Claude may add a guess (見立て) for
// a line nobody labelled, and a person's choice always wins over a guess. The words of a line are what the
// speech recognition wrote; nothing here changes them.

/** The speakers a person can choose while recording (keys 1〜4, in this order). */
export const SPEAKERS = ["医師", "患者", "家族", "看護師"] as const;
export type Speaker = (typeof SPEAKERS)[number] | "不明";
/** What Claude may guess for a line (the request's four: 医師・患者・家族・不明). */
export const GUESSES = ["医師", "患者", "家族", "不明"] as const;
export type Guess = (typeof GUESSES)[number];
export const ALL_SPEAKERS: Speaker[] = [...SPEAKERS, "不明"];

export interface IcLine {
  /** 1, 2, 3 … in the order spoken (the number sent with the line). */
  id: number;
  /** Clock time "HH:MM:SS" (Japan) when the line began. */
  at: string;
  text: string;
  /** Chosen by a person (while recording, or corrected afterwards). */
  said?: Speaker;
  /** Claude's guess, kept apart and shown as 見立て until a person chooses. */
  guess?: Guess;
}

export const speakerOf = (l: IcLine): Speaker => l.said ?? l.guess ?? "不明";
export const isGuess = (l: IcLine) => !l.said && !!l.guess;

/** A finished piece of speech becomes a line (blank pieces are left out). */
export function addLine(lines: IcLine[], text: string, at: string, said?: Speaker | null): IcLine[] {
  const t = text.trim();
  if (!t) return lines;
  const id = (lines.at(-1)?.id ?? 0) + 1;
  return [...lines, { id, at, text: t, ...(said ? { said } : {}) }];
}

/** A person chooses the speaker of one line (this replaces a guess). */
export const setSpeaker = (lines: IcLine[], id: number, s: Speaker): IcLine[] => lines.map((l) => (l.id === id ? { ...l, said: s } : l));

/** Claude's guesses go only to lines no person labelled; unknown line numbers are ignored. */
export function applyGuesses(lines: IcLine[], guesses: { n: number; speaker: Guess }[]): IcLine[] {
  const by = new Map(guesses.filter((g) => (GUESSES as readonly string[]).includes(g.speaker)).map((g) => [g.n, g.speaker]));
  return lines.map((l) => (l.said || !by.has(l.id) ? l : { ...l, guess: by.get(l.id) }));
}

/** The person accepts every guess as it is (they become the person's choice). */
export const confirmGuesses = (lines: IcLine[]): IcLine[] => lines.map((l) => (isGuess(l) ? { ...l, said: l.guess } : l));

/** Keys 1〜4 choose the speaker (no modifier keys). */
export const speakerKey = (key: string): Speaker | null => (/^[1-4]$/.test(key) ? SPEAKERS[Number(key) - 1] : null);

/** Lines next to each other with the same speaker, as one turn (for reading; the lines themselves stay). */
export interface Turn {
  speaker: Speaker;
  guess: boolean;
  at: string;
  ids: number[];
  text: string;
}
export function turns(lines: IcLine[]): Turn[] {
  const out: Turn[] = [];
  for (const l of lines) {
    const s = speakerOf(l);
    const last = out.at(-1);
    if (last && last.speaker === s && last.guess === isGuess(l)) {
      last.ids.push(l.id);
      last.text += l.text;
    } else out.push({ speaker: s, guess: isGuess(l), at: l.at, ids: [l.id], text: l.text });
  }
  return out;
}

/** How many lines each speaker has, and how many are still only guessed or unlabelled. */
export function speakerCounts(lines: IcLine[]): { by: Record<Speaker, number>; guessed: number; unlabelled: number } {
  const by = Object.fromEntries(ALL_SPEAKERS.map((s) => [s, 0])) as Record<Speaker, number>;
  for (const l of lines) by[speakerOf(l)]++;
  return { by, guessed: lines.filter(isGuess).length, unlabelled: lines.filter((l) => !l.said && !l.guess).length };
}

/** The whole transcript for the record: one line each, time and speaker first; a guess is marked （見立て）. */
export const transcriptText = (lines: IcLine[]): string =>
  lines.map((l) => `${l.at} ${speakerOf(l)}${isGuess(l) ? "（見立て）" : ""}：${l.text}`).join("\n");

/**
 * Pasted text as lines (for trying the window where speech recognition does not run, e.g. a headless browser):
 * one line each; "医師：…" (or 患者・家族・看護師・不明) sets the speaker, otherwise it is unlabelled.
 */
export function linesFromPaste(text: string, at: string, start: IcLine[] = []): IcLine[] {
  let out = start;
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.trim().match(/^(医師|患者|家族|看護師|不明)[：:]\s*(.*)$/);
    out = m ? addLine(out, m[2], at, m[1] as Speaker) : addLine(out, raw, at);
  }
  return out;
}

/** The clock "HH:MM:SS" in Japan. */
export const clockNow = (d: Date = new Date()) =>
  d.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
