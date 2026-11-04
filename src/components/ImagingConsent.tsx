"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Patient } from "@/lib/types";
import type { CalendarDate } from "@/lib/dates";
import { consentFor, type ConsentRecord } from "@/lib/consent";
import { findRegion, type ImagingDraft } from "@/lib/exams";
import { consentDefaults, consentFromRecord, editImagingDraft } from "@/lib/imaging-consent";
import { DOCTORS } from "@/lib/doctors";
import { useMe } from "./RoleContext";
import { usePrintSheet } from "./DeskParts";
import { ConsentDocument } from "./panels/ConsentPanel";

interface Context { patient: Patient; today: CalendarDate; records: ConsentRecord[] }
const ImagingContext = createContext<Context | null>(null);
export function ImagingConsentProvider({ children, ...value }: Context & { children: ReactNode }) {
  return <ImagingContext.Provider value={value}>{children}</ImagingContext.Provider>;
}

export function ImagingConsentPrint({ draft }: { draft: ImagingDraft }) {
  const context = useContext(ImagingContext);
  const [print, sheet] = usePrintSheet();
  const code = consentFor({ type: "imaging", modality: draft.modality ?? undefined, contrast: draft.contrast ?? undefined });
  if (!code || !context) return null;
  const { patient, today, records } = context;
  const r = records.find((x) => x.patientId === patient.id && x.code === code && x.status === "同意") ?? { id: draft.id, patientId: patient.id, code, status: draft.consent?.state === "取得済み" ? "同意" as const : "説明前" as const, createdAt: { day: 0, time: "" }, explainedBy: draft.consent?.by ?? undefined, answers: {}, extra: [draft.purpose, draft.consent?.at ? `取得日時：${draft.consent.at}` : null].filter(Boolean).join("　") };
  return <><button type="button" className="rounded border border-ai px-2 py-1 text-xs text-ai" onClick={() => print(<><p className="mb-2 text-sm">対象：{draft.modality} {draft.region ? findRegion(draft.region)?.name : ""} {draft.contrast}　目的：{draft.purpose || "＿＿＿＿"}</p><ConsentDocument r={r} patient={patient} today={today} room="" orders={[]} print /></>, { portrait: true })}>同意書を印刷</button>{sheet}</>;
}

export function ImagingDraftEditor({ draft, onApply }: { draft: ImagingDraft; onApply: (d: ImagingDraft) => void }) {
  const me = useMe();
  const context = useContext(ImagingContext);
  const code = consentFor({ type: "imaging", modality: draft.modality ?? undefined, contrast: draft.contrast ?? undefined });
  const record = context?.records.find((r) => r.patientId === context.patient.id && r.code === code && consentFromRecord(r));
  return <div className="space-y-2 border-t border-rule-soft px-3 py-2">
    <label className="block text-xs">目的：ここで入れる <input aria-label="下書きの目的" className="rounded border border-rule px-2 py-1" value={draft.purpose ?? ""} onChange={(e) => onApply(editImagingDraft(draft, { purpose: e.target.value }))} /></label>
    {code && <>
      <button type="button" className="text-xs text-ai" onClick={() => onApply({ ...draft, consent: consentDefaults(draft.consent, "取得済み", me.name, new Date()) })}>同意取得済みにする</button>
      {record && <button type="button" className="ml-2 text-xs text-ai" onClick={() => onApply({ ...draft, consent: consentFromRecord(record) })}>記録した同意を反映</button>}
      {draft.consent?.state === "取得済み" && <div className="flex flex-wrap gap-2">
        <DoctorField value={draft.consent.by ?? ""} onChange={(by) => onApply(editImagingDraft(draft, { by }))} />
        <label className="text-xs">取得日時 <input aria-label="下書きの取得日時" className="rounded border border-rule px-2 py-1" value={draft.consent.at ?? ""} onChange={(e) => onApply(editImagingDraft(draft, { at: e.target.value }))} /></label>
      </div>}
      <ImagingConsentPrint draft={draft} />
    </>}
  </div>;
}

export function DoctorField({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  return <label className="text-xs">説明した医師 <select aria-label="説明した医師を選ぶ" value={value} onChange={(e) => onChange(e.target.value)} className="rounded border border-rule px-2 py-1"><option value="">選ぶ</option>{!DOCTORS.some((d) => d.name === value) && value && <option>{value}</option>}{DOCTORS.map((d) => <option key={d.name}>{d.name}</option>)}</select></label>;
}
