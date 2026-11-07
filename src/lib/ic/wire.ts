// IC を声で記録 ↔ /api/ic-transcript: what the window sends (only the lines after the names and the rest were
// replaced, with line numbers and speakers — no patient name, ID or chart data; for "voices" also the voice
// service's speaker number of each line) and what Claude returns.

import { z } from "zod";

export const WHO = ["医師", "患者", "家族", "看護師", "不明", "?"] as const;
export const SentLine = z.object({
  n: z.number().int().positive(),
  /** The speaker a person chose (or Claude guessed before); "?" = nobody labelled it yet. */
  who: z.enum(WHO),
  text: z.string().trim().min(1).max(1000),
  /** The voice service's speaker number ("2-speaker0" = piece 2, speaker0), for "voices". */
  v: z
    .string()
    .regex(/^\d{1,3}-[A-Za-z0-9_]{1,24}$/)
    .optional(),
});
export type SentLine = z.infer<typeof SentLine>;

export const MAX_CHARS = 30000;
export const IcRequest = z
  .object({ mode: z.enum(["speakers", "voices", "place"]), lines: z.array(SentLine).min(1).max(600) })
  .refine((r) => r.lines.reduce((n, l) => n + l.text.length, 0) <= MAX_CHARS, { message: "too long" })
  .refine((r) => new Set(r.lines.map((l) => l.n)).size === r.lines.length, { message: "duplicate line numbers" })
  .refine((r) => r.mode !== "voices" || r.lines.every((l) => l.v), { message: "a voice number on every line" });
export type IcRequest = z.infer<typeof IcRequest>;

/** The transcript as Claude reads it: one line each, "number<TAB>speaker<TAB>words" ("number<TAB>voice<TAB>speaker<TAB>words" with voices). */
export const transcriptForClaude = (lines: SentLine[]) =>
  lines.map((l) => `${l.n}\t${l.v ? `${l.v}\t` : ""}${l.who}\t${l.text.replace(/\s+/g, " ")}`).join("\n");

// No nullable fields or number limits in the schema sent to the API.
export const SpeakersWire = z.object({
  labels: z
    .array(z.object({ n: z.number().describe("The line number"), speaker: z.enum(["医師", "患者", "家族", "不明"]) }))
    .describe('One entry for each line marked "?"'),
});

export const VoicesWire = z.object({
  voices: z
    .array(z.object({ voice: z.string().describe("The voice number, as written"), speaker: z.enum(["医師", "患者", "家族", "不明"]) }))
    .describe("One entry for each voice number"),
});

const Quotes = (what: string) =>
  z
    .array(
      z.object({
        line: z.number().describe("The line number"),
        text: z.string().describe('"" when the whole line belongs; otherwise one contiguous part copied exactly from that line'),
      }),
    )
    .describe(what);
export const PlaceWire = z.object({
  explained: Quotes("説明内容: what the doctor explained, from 医師 lines, in the order spoken"),
  response: Quotes("相手の反応・質問: the patient's or family's reactions, questions and answers, from 患者 and 家族 lines"),
  attendees: Quotes("同席者: only words that say who else was present"),
});
