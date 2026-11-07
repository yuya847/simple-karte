// IC を声で記録 → IC の記録: Claude says which spoken words go in which field of the template (説明内容 =
// the doctor's words, 相手の反応 = the patient's and family's, 同席者 = words that say who was there), each as a
// line number and the words copied from that line ("" = the whole line). Code checks that every piece is
// really in that line — anything Claude added is dropped and counted — and puts the original words (not the
// replaced ones) into the fields. 説明医師 and 説明を受けた人 come from the chart and the consent mark. The doctor
// reads and changes every field before confirming.

import { buildRecord, startRecordValues, type RecordFacts } from "../record-templates";
import type { NoteTemplate, TemplateValues } from "../note-templates";
import { toOriginal, type Redacted } from "./anonymize";
import { PLACEMENT_FIELDS, type Found, type Placement } from "./verify";
import { speakerOf, transcriptText, type IcLine, type Speaker } from "./transcript";

/** The consent to recording and to cloud speech recognition / transcription, and who marked it when. */
/** The templates the window can fill (記事のテンプレート「IC の記録」「IC（簡易）」). */
export const IC_TEMPLATE_IDS = ["rec-ic", "rec-ic-short"];

export interface RecordingConsent {
  by: "本人" | "代理の方";
  /** 続柄 of the person who consented for the patient. */
  relation?: string;
  recordedBy: string;
  at: string;
}
export const consentWho = (c: RecordingConsent) => (c.by === "本人" ? "本人" : `代理の方（${c.relation?.trim() || "続柄未記入"}）`);
export const consentLine = (c: RecordingConsent) => `録音とクラウドの音声認識・文字起こしへの同意：${consentWho(c)}（記録 ${c.recordedBy} ${c.at}）`;

const join = (xs: string[]) => xs.filter(Boolean).join("\n　");

/** One piece in the original words (what was said), from where it was found in the sent text. */
export function originalOf(f: Found, redacted: Map<number, Redacted>, lines: Map<number, IcLine>): string {
  const r = redacted.get(f.line);
  if (!r) return lines.get(f.line)?.text ?? "";
  if (f.start === 0 && f.end >= r.text.length) return lines.get(f.line)?.text ?? r.parts.map((p) => p.orig).join("");
  return toOriginal(r, f.start, f.end).trim();
}

/**
 * The template's values: the start values (説明医師 from the chart), the fields Claude placed in the
 * original words, and 説明を受けた人 / 同席者 from the consent mark and the speakers when nothing was said.
 */
export function icValues(
  t: NoteTemplate,
  facts: RecordFacts,
  lines: IcLine[],
  consent: RecordingConsent,
  found: Record<keyof Placement, Found[]>,
  redacted: Map<number, Redacted>,
): TemplateValues {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const words = (k: keyof Placement) => found[k].map((f) => ({ f, text: originalOf(f, redacted, byId), who: byId.get(f.line) ? speakerOf(byId.get(f.line)!) : ("不明" as Speaker) }));
  const present = new Set(lines.map(speakerOf));
  const attendees = words("attendees").map((w) => `「${w.text}」`);
  const fallbackAttendees = [present.has("看護師") ? "看護師" : "", consent.by === "本人" && present.has("家族") ? "家族" : ""].filter(Boolean).join("・");
  const receiver = consent.by === "本人" ? `本人${present.has("家族") ? "・家族" : ""}` : consentWho(consent);
  return {
    ...startRecordValues(t, facts),
    "文:同席者": attendees.length ? attendees.join("") : fallbackAttendees,
    "文:説明を受けた人（続柄）": receiver,
    "文:説明内容": join(words("explained").map((w) => w.text)),
    "文:相手の反応": join(words("response").map((w) => `${w.who}「${w.text}」`)),
  };
}

/** The lines Claude did not put in any field (shown to the doctor; they stay in the transcript). */
export function unplacedLines(lines: IcLine[], found: Record<keyof Placement, Found[]>): IcLine[] {
  const used = new Set(PLACEMENT_FIELDS.flatMap((k) => found[k].map((f) => f.line)));
  return lines.filter((l) => !used.has(l.id));
}

/**
 * The note: the template filled in, the consent mark, what Claude did (if anything; and whether the voice was
 * told apart on the device), and the whole transcript with speakers and times.
 */
export function icRecordText(t: NoteTemplate, values: TemplateValues, facts: RecordFacts, consent: RecordingConsent, lines: IcLine[], claude: { speakers: boolean; place: boolean; voice?: boolean }): string {
  const did = [claude.speakers ? `話し手の見立て${claude.voice ? "（声の区切りは端末の中で sherpa-onnx）" : ""}` : "", claude.place ? "欄への配置" : ""].filter(Boolean).join("・");
  return [
    buildRecord(t, values, facts),
    consentLine(consent),
    ...(did ? [`Claude：${did}（名前などを置き換えた文で。文は書き換えない）`] : []),
    "書き起こし（話し手・時刻つき）：",
    transcriptText(lines),
  ].join("\n");
}
