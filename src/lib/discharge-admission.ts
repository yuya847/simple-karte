import { noteText } from "./notes";
import type { NoteEntry } from "./types";

export const isAdmissionNote = (n: NoteEntry) => !!n.templateName?.includes("入院時") || /^(?:【入院時[^】]*】|入院時記録|救急初療記録)/m.test(noteText(n));

/** Copy only explicitly headed fields verbatim, including old free-text admission templates. */
export function admissionText(n: NoteEntry | undefined) {
  if (!n) return { complaint: "", present: "" };
  const text = noteText(n);
  const field = (name: string) => {
    const heading = new RegExp(`(?:【${name}】|${name}[：:])\\s*`);
    const match = heading.exec(text);
    if (!match) return "";
    const body = text.slice(match.index + match[0].length);
    const next = /(?:【[^】\n]+】|(?:主訴|現病歴|既往歴|家族歴|生活歴|内服|アレルギー|身体所見|検査|評価|計画)[：:])/.exec(body);
    return body.slice(0, next?.index ?? body.length).trim();
  };
  return { complaint: field("主訴") || n.soap?.s || "", present: field("現病歴") || [n.soap?.s, n.soap?.o].filter(Boolean).join("\n") };
}
