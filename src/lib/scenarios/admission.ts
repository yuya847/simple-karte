import type { Patient } from "../types";
import type { ConsentRecord } from "../consent";
import type { AdmitEval } from "../admit-eval";
import { nurseFor } from "../ward";

/** Authored completed admission records; recent arrivals retain work for the next shift. */
export function admissionState(cases: { patient: Patient; stage: string; planned: boolean }[]) {
  const consents: ConsentRecord[] = [];
  const evals: Record<string, AdmitEval> = {};
  for (const { patient: p, stage, planned } of cases) {
    if (stage === "救急") continue;
    const at = { day: p.admittedOn, time: "14:00" };
    const by = nurseFor(p.room);
    const pendingConsent = p.admittedOn === 0 || Number(p.id) % 23 === 0;
    consents.push({ id: `${p.id}-admission-consent`, patientId: p.id, code: "CONSENT-ADMISSION", status: pendingConsent ? "説明前" : "同意", createdAt: at, ...(!pendingConsent ? { explainedAt: at, explainedBy: p.attending, witness: by } : {}), answers: {} });
    const a: AdmitEval = { patientId: p.id, emergency: !planned };
    if (p.admittedOn <= -2) {
      a.plan = { days: 14, symptoms: p.admissionDiagnosis, treatment: "診療録の治療方針に沿って経過を確認", tests: "診療録の検査予定を参照", surgery: "指示記録を参照", other: "離床・生活支援", nutritionNeeded: "有", explainedTo: p.age < 18 ? "保護者" : "本人・家族", explainedBy: p.attending, explainedAt: at };
      a.nutrition = { goal: "摂取量と体重を保つ", route: "経口", energyKcal: p.age < 18 ? 1200 : 1400 + Number(p.id) % 4 * 200, proteinG: p.age < 18 ? 25 : 50 + Number(p.id) % 3 * 10, counseling: "摂取状況を確認", reassessOn: 3 + Number(p.id) % 7, by: "管理栄養士 高橋", at };
      a.pressure = { adl: "A2", items: {}, ulcerNow: false, plan: "皮膚状態を観察", by, at };
      a.fall = { checked: p.age >= 75 || /脳梗塞|脳出血|骨折|パーキンソン/.test(p.admissionDiagnosis) ? ["歩行時に介助が必要"] : [], measures: [], plan: "足元と移動時の安全を確認", by, at };
      a.delirium = { checked: p.age >= 70 ? ["70歳以上"] : [], measures: ["早期離床の取組"], by, at };
      a.discharge = { factors: /脳梗塞|脳出血|骨折/.test(p.admissionDiagnosis) ? ["ク"] : p.age >= 75 ? ["ク"] : [], note: "本人・家族と退院後の生活を確認", extractedBy: by, extractedAt: at, talkedAt: at, planStartedAt: at, conferenceAt: at };
    }
    evals[p.id] = a;
  }
  return { consents, evals };
}
