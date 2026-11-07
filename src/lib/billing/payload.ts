// What the chart sends to the billing APIs for one patient (the fictional record as it stands now).

import type { Diagnosis } from "../diagnoses";
import type { DietOrder } from "../diet";
import type { HistoryEntry, Patient } from "../types";
import type { Insurance } from "./insurance";
import type { KisaiWorkspace } from "./kisai-workspace";
import { currentShoki } from "./shoki";
import type { BillingOptions } from "./model";
import type { LetterClaim } from "../letters";

export function patientMonthPayload(
  patient: Patient,
  entries: HistoryEntry[],
  diagnoses: Diagnosis[],
  options: BillingOptions,
  extra: { diets?: DietOrder[]; letters?: LetterClaim[]; notGiven?: string[]; insulinGiven?: { key: string; units: number }[]; insurance?: Insurance; insuranceHistory?: Insurance[]; kisai?: KisaiWorkspace } = {},
) {
  // 退院を実施した日 (入退院支援加算１ is claimed on it).
  // 未実施 doses of this patient's injections only.
  const orderIds = new Set(entries.flatMap((e) => (e.kind === "order" ? [e.id] : [])));
  const discharged = patient.dischargedAt ? { dischargedOn: patient.dischargedAt.day } : {};
  return {
    diets: (extra.diets ?? []).filter((d) => d.patientId === patient.id),
    letters: extra.letters ?? [],
    patient: { ward: patient.ward, id: patient.id, name: patient.name, kana: patient.kana, sex: patient.sex, age: patient.age, admittedOn: patient.admittedOn, ...discharged },
    entries,
    ...(extra.insulinGiven ? { insulinGiven: extra.insulinGiven.filter(r => orderIds.has(r.key.slice(0, r.key.lastIndexOf("|")))) } : {}),
    notGiven: (extra.notGiven ?? []).filter((k) => orderIds.has(k.slice(0, k.lastIndexOf("|")))),
    daily: patient.daily,
    cultures: patient.cultures,
    diagnoses,
    options,
    // The insurance 医事課 registered (保険の登録); left out while there is none.
    ...(extra.insuranceHistory ? { insuranceHistory: extra.insuranceHistory } : {}),
    ...(extra.insurance ? { insurance: extra.insurance } : {}),
    // 記載・書類: this patient's confirmed 症状詳記 and only the latest 摘要の答え per month and item (the one the claim reads).
    ...(extra.kisai ? { kisai: kisaiOf(extra.kisai, patient.id) } : {}),
  };
}

export function kisaiOf(w: KisaiWorkspace, patientId: string): KisaiWorkspace {
  const latest = new Map<string, KisaiWorkspace["tekiyoAnswers"][number]>();
  for (const a of w.tekiyoAnswers) if (a.patientId === patientId) latest.set(`${a.month}|${a.claimCode}`, a);
  // Only what the claim reads: the latest confirmed version of each 症状詳記 (a draft being written does not re-run the claim).
  return { shoki: currentShoki(w.shoki.filter((s) => s.patientId === patientId)), tekiyoAnswers: [...latest.values()] };
}

export type PatientMonthPayload = ReturnType<typeof patientMonthPayload>;
