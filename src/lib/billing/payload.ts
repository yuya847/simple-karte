// What the chart sends to the billing APIs for one patient (the fictional record as it stands now).

import type { Diagnosis } from "../diagnoses";
import type { DietOrder } from "../diet";
import type { HistoryEntry, Patient } from "../types";
import type { Insurance } from "./insurance";
import type { BillingOptions } from "./model";

export function patientMonthPayload(
  patient: Patient,
  entries: HistoryEntry[],
  diagnoses: Diagnosis[],
  options: BillingOptions,
  extra: { diets?: DietOrder[]; letters?: { day: number; to: string; dischargeDay?: number; attach?: boolean }[]; notGiven?: string[]; insulinGiven?: { key: string; units: number }[]; insurance?: Insurance } = {},
) {
  // 退院を実施した日 (入退院支援加算１ is claimed on it).
  // 未実施 doses of this patient's injections only.
  const orderIds = new Set(entries.flatMap((e) => (e.kind === "order" ? [e.id] : [])));
  const discharged = patient.dischargedAt ? { dischargedOn: patient.dischargedAt.day } : {};
  return {
    diets: (extra.diets ?? []).filter((d) => d.patientId === patient.id),
    letters: extra.letters ?? [],
    patient: { id: patient.id, name: patient.name, kana: patient.kana, sex: patient.sex, age: patient.age, admittedOn: patient.admittedOn, ...discharged },
    entries,
    ...(extra.insulinGiven ? { insulinGiven: extra.insulinGiven.filter(r => orderIds.has(r.key.slice(0, r.key.lastIndexOf("|")))) } : {}),
    notGiven: (extra.notGiven ?? []).filter((k) => orderIds.has(k.slice(0, k.lastIndexOf("|")))),
    daily: patient.daily,
    cultures: patient.cultures,
    diagnoses,
    options,
    // The insurance 医事課 registered (保険の登録); left out while there is none.
    ...(extra.insurance ? { insurance: extra.insurance } : {}),
  };
}

export type PatientMonthPayload = ReturnType<typeof patientMonthPayload>;
