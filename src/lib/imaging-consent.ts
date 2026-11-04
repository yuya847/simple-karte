import type { ContrastConsent, ConsentState, ImagingDraft } from "./exams";
import type { ConsentRecord } from "./consent";
import { consentDone } from "./consent";

export function consentDefaults(c: ContrastConsent | null | undefined, state: ConsentState, doctor: string, now: Date): ContrastConsent {
  const at = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return { at: null, by: null, form: null, reason: null, ...c, state, ...(state === "取得済み" ? { at: c?.at || at, by: c?.by || doctor || null } : {}) };
}

export function editImagingDraft(d: ImagingDraft, patch: { purpose?: string; by?: string; at?: string }): ImagingDraft {
  const consent = patch.by !== undefined || patch.at !== undefined ? { at: null, by: null, form: null, reason: null, state: "取得済み" as const, ...d.consent, ...(patch.by !== undefined ? { by: patch.by.trim() ? patch.by : null } : {}), ...(patch.at !== undefined ? { at: patch.at.trim() ? patch.at : null } : {}) } : d.consent;
  return { ...d, consent, ...(patch.purpose !== undefined ? { purpose: patch.purpose.trim() ? patch.purpose : null } : {}) };
}

export function consentFromRecord(r: ConsentRecord): ContrastConsent | null {
  if (!consentDone(r)) return null;
  return { state: "取得済み", by: r.explainedBy ?? null, at: r.explainedAt ? `${r.explainedAt.day === 0 ? "今日" : `${r.explainedAt.day}日`} ${r.explainedAt.time}` : null, form: r.signatures?.length ? "電子（タブレットで署名）" : "紙の同意書（カルテに保管）", reason: null };
}
