"use client";

import type { DiseaseCandidate } from "@/lib/billing/disease-check";
import type { Sticky } from "../StickyStrip";
import { useDeny } from "../RoleContext";

export interface DiseaseRequestProps {
  diseaseRequests?: Record<string, Sticky[]>;
  onDiseaseRequest?: (patientId: string, candidate: DiseaseCandidate) => void;
}
export function DiseaseCandidates({ candidates, patientId, diseaseRequests, onDiseaseRequest }: DiseaseRequestProps & { candidates: DiseaseCandidate[]; patientId: string }) {
  const deny = useDeny();
  if (!candidates.length) return null;
  return <ul aria-label="病名漏れの候補" className="space-y-1">
    {candidates.map(c => {
      const requested = diseaseRequests?.[patientId]?.some(s => s.diseaseRequest?.candidateKey === c.key);
      return <li key={c.key} className="rounded border border-yamabuki/40 bg-yamabuki-soft px-2 py-1 text-xs">
        <span className="mr-1 font-bold text-yamabuki">確かめる</span>{c.text}
        {onDiseaseRequest && <button type="button" disabled={requested || !!deny("billing")} onClick={() => onDiseaseRequest(patientId, c)} className="ml-2 rounded border border-rule bg-sheet px-2 py-1 text-ai disabled:text-ink-faint">{requested ? "主治医に依頼済み" : "医師に病名の追加を頼む"}</button>}
      </li>;
    })}
  </ul>;
}
