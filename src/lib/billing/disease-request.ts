import type { Sticky } from "../../components/StickyStrip";
import { checkDiseases, diseaseCandidateDate, type DiseaseCandidate, type DiseaseCheckInput } from "./disease-check";
import type { PatientMonthPayload } from "./payload";

export interface DiseaseRequest {
  candidateKey: string;
  month: string;
  to: string;
}
/** 依頼は既存の共有付箋に保存。重複クリックで付箋を増やさない。 */
export function withDiseaseRequest(stickies: Sticky[], candidate: DiseaseCandidate, to: string, by: string, at: string, today: string): Sticky[] {
  if (stickies.some(s => s.diseaseRequest?.candidateKey === candidate.key)) return stickies;
  return [...stickies, {
    id: `disease:${candidate.key}`,
    text: `${to}先生へ：病名の追加をお願いします。${candidate.text}（対象 ${candidate.days.map(d => diseaseCandidateDate({ today }, d)).join("・")}）`,
    by, at, shared: true,
    diseaseRequest: { candidateKey: candidate.key, month: candidate.month, to },
  }];
}
export function visibleDiseaseStickies(stickies: Sticky[], input: Omit<DiseaseCheckInput, "month">): Sticky[] {
  const keys = new Map<string, Set<string>>();
  return stickies.filter(s => {
    if (!s.diseaseRequest) return true;
    const { month, candidateKey } = s.diseaseRequest;
    if (!keys.has(month)) keys.set(month, new Set(checkDiseases({ ...input, month }).map(c => c.key)));
    return keys.get(month)!.has(candidateKey);
  });
}
export function diseaseRequestInput(payload: PatientMonthPayload, today: string, nowTime: string): Omit<DiseaseCheckInput, "month"> {
  return { entries: payload.entries, diagnoses: payload.diagnoses, today, nowTime, admittedOn: payload.patient.admittedOn, dischargedOn: payload.patient.dischargedOn, notGiven: payload.notGiven };
}
/** 主治医のやることから病名ウインドウへ。病名追加後は再判定で依頼も表示から消える。 */
export function diseaseRequestTodos(patients: { id: string; name: string; attending: string }[], stickies: Record<string, Sticky[]>, by: string, inputOf: (id: string) => Omit<DiseaseCheckInput, "month">, open: (id: string) => void) {
  return patients.flatMap(p => {
    // 転科・主治医交代時も現在の主治医が依頼を引き継ぐ。
    if (p.attending !== by || !stickies[p.id]?.some(s => s.diseaseRequest)) return [];
    const pending = visibleDiseaseStickies(stickies[p.id], inputOf(p.id)).filter(s => s.diseaseRequest);
    return pending.length ? [{ key: `disease-request:${p.id}`, label: `病名の追加依頼：${p.name}さん`, detail: pending.map(s => s.text).join("\n"), count: pending.length, tone: "yamabuki" as const, go: () => open(p.id) }] : [];
  });
}
