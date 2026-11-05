import { DISCIPLINE_NAME, unitsOf, type RehabRx, type RehabSession } from "./rehab";
import type { NoteEntry, VitalSign } from "./types";

/** The session id is also the chart note id, including when corrected. */
export function sessionNote(s: RehabSession, rx: RehabRx, therapist: string): NoteEntry {
  const stamp = s.notDone ?? s.recordedAt;
  if (!stamp || s.orderId !== rx.orderId || s.patientId !== rx.patientId) throw new Error("実施記録と処方を確かめてください");
  const time = s.start ?? s.arrived?.time ?? stamp.time;
  return {
    kind: "note", id: s.id, day: s.day, time, author: therapist, role: "療法士",
    category: s.notDone ? "リハビリ" : "リハビリ実施",
    writtenAt: { day: stamp.day, time: stamp.time },
    text: s.notDone ? `実施せず ${time} ${s.notDone.reason}` : `${DISCIPLINE_NAME[s.discipline]}（${s.discipline}）${s.start}〜${s.end} ${unitsOf(s.start, s.end).units}単位 ${s.place}　${s.content ?? ""}`,
  };
}

export function upsertSessionNote(notes: NoteEntry[], note: NoteEntry): NoteEntry[] {
  return [...notes.filter((n) => n.id !== note.id), note];
}

/** Only explicit metric / number / unit / comparison phrases are read. No clinical rules are added. */
export function cautionHits(caution: string, v: VitalSign): string[] {
  const hits = new Set<string>();
  const pattern = /\b(HR|SBP|SpO2|BT)\s*(\d+(?:\.\d+)?)\s*(?:\/分|mmHg|%|°C|℃)?\s*(以上|以下|未満|超過)/gi;
  const keys = { hr: "hr", sbp: "sbp", spo2: "spo2", bt: "bt" } as const;
  for (const m of caution.normalize("NFKC").matchAll(pattern)) {
    const key = keys[m[1].toLowerCase() as keyof typeof keys];
    const value = v[key];
    const threshold = Number(m[2]);
    if (value === undefined || !Number.isFinite(value)) continue;
    if (m[3] === "以上" ? value >= threshold : m[3] === "以下" ? value <= threshold : m[3] === "未満" ? value < threshold : value > threshold) hits.add(key);
  }
  return [...hits];
}
