import type { VitalSign } from "./types";

export const JCS_SCORES = ["0", "I-1", "I-2", "I-3", "II-10", "II-20", "II-30", "III-100", "III-200", "III-300"] as const;
export const jcsText = (v: Pick<VitalSign, "jcs">) => v.jcs ? `${v.jcs.score}${v.jcs.modifiers?.length ? `（${v.jcs.modifiers.join("/")}）` : ""}` : "";
export function gcsText(v: Pick<VitalSign, "gcs">): string {
  if (!v.gcs) return "";
  const { e, v: verbal, m } = v.gcs;
  const total = e !== undefined && verbal !== undefined && m !== undefined ? `=${e + verbal + m}` : "";
  return `E${e ?? "—"}V${verbal ?? "—"}M${m ?? "—"}${total}`;
}
export const consciousnessText = (v: VitalSign) => [v.jcs && `JCS ${jcsText(v)}`, v.gcs && `GCS ${gcsText(v)}`].filter(Boolean).join(" ");
