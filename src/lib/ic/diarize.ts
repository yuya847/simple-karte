// IC を声で記録: the place to plug in a speech-to-text service that tells speakers apart by voice (話者分離,
// speaker diarization). Without its key nothing here is used and the window works as it does now (the browser's
// speech recognition, the person choosing the speaker, Claude's guess from the words). The key is an environment
// variable on the server, never in the repository. How to connect one: docs/ic-voice.md.
//
// Only the shape is here: which service and key the server has, what a service returns (segments with a
// speaker tag such as "speaker0" and times), and how those become the window's lines. A service gives a tag,
// not a person: the doctor says which tag is 医師・患者・家族 (mapTags), so the person still decides.

import { ALL_SPEAKERS, type IcLine, type Speaker } from "./transcript";

export const DIARIZE_PROVIDERS = ["amivoice", "google", "aws", "azure"] as const;
export type DiarizeProvider = (typeof DIARIZE_PROVIDERS)[number];

export interface DiarizeConfig {
  provider: DiarizeProvider;
  /** The service's key (server only). */
  key: string;
  /** Region or endpoint, when the service needs one (e.g. asia-northeast1, ap-northeast-1, japaneast). */
  region?: string;
}

/**
 * The service the server is set up for, from IC_DIARIZE_PROVIDER and IC_DIARIZE_KEY (and IC_DIARIZE_REGION).
 * Without both, or with an unknown provider: null — not used.
 */
export function diarizeConfig(env: Record<string, string | undefined> = process.env): DiarizeConfig | null {
  const provider = env.IC_DIARIZE_PROVIDER?.trim().toLowerCase();
  const key = env.IC_DIARIZE_KEY?.trim();
  if (!provider || !key || !(DIARIZE_PROVIDERS as readonly string[]).includes(provider)) return null;
  const region = env.IC_DIARIZE_REGION?.trim();
  return { provider: provider as DiarizeProvider, key, ...(region ? { region } : {}) };
}

/** One stretch of speech from the service: its speaker tag, when (ms from the start of the recording), and the words. */
export interface DiarizedSegment {
  speaker: string;
  startMs: number;
  endMs: number;
  text: string;
}

/**
 * What a service adapter does. The audio goes from the browser to the service (with a short-lived token the
 * server makes from the key), so this app's server neither receives nor keeps the voice.
 */
export interface DiarizeAdapter {
  provider: DiarizeProvider;
  /** Server: a short-lived token and the address for the browser to send the audio to. */
  issueToken(config: DiarizeConfig): Promise<{ token: string; url: string; expiresAt: number }>;
  /** Browser: the service's result read into segments. */
  readResult(result: unknown): DiarizedSegment[];
}

/** No service is connected yet (shape only). Returns null for every provider until an adapter is written. */
export function adapterFor(config: DiarizeConfig | null): DiarizeAdapter | null {
  void config;
  return null;
}

/** The tags in the order they first speak ("speaker0", "speaker1" …), for the doctor to say who each is. */
export const tagsOf = (segments: DiarizedSegment[]): string[] => [...new Set([...segments].sort((a, b) => a.startMs - b.startMs).map((s) => s.speaker))];

const clockAfter = (start: string, ms: number) => {
  const [h, m, s] = start.split(":").map(Number);
  const t = h * 3600 + m * 60 + s + Math.floor(ms / 1000);
  return [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60].map((n) => String(n).padStart(2, "0")).join(":");
};

/**
 * The service's segments as the window's lines, in time order. A tag the doctor mapped (mapTags) becomes that
 * person's choice; an unmapped tag stays unlabelled (Claude may then guess from the words).
 */
export function segmentsToLines(segments: DiarizedSegment[], startedAt: string, mapTags: Record<string, Speaker | undefined>): IcLine[] {
  return [...segments]
    .sort((a, b) => a.startMs - b.startMs)
    .filter((s) => s.text.trim())
    .map((s, i) => {
      const said = mapTags[s.speaker];
      return { id: i + 1, at: clockAfter(startedAt, s.startMs), text: s.text.trim(), ...(said && ALL_SPEAKERS.includes(said) ? { said } : {}) };
    });
}
