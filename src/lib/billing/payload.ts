// What the chart sends to the billing APIs for one patient (the fictional record as it stands now).

import type { Diagnosis } from "../diagnoses";
import type { DietOrder } from "../diet";
import type { HistoryEntry, Patient } from "../types";
import type { BillingOptions } from "./model";

export function patientMonthPayload(patient: Patient, entries: HistoryEntry[], diagnoses: Diagnosis[], options: BillingOptions, extra: { diets?: DietOrder[]; letters?: { day: number; to: string; dischargeDay?: number; attach?: boolean }[] } = {}) {
  // 退院を実施した日 (入退院支援加算１ is claimed on it).
  const discharged = patient.dischargedAt ? { dischargedOn: patient.dischargedAt.day } : {};
  return {
    diets: (extra.diets ?? []).filter((d) => d.patientId === patient.id),
    letters: extra.letters ?? [],
    patient: { id: patient.id, name: patient.name, kana: patient.kana, sex: patient.sex, age: patient.age, admittedOn: patient.admittedOn, ...discharged },
    entries,
    daily: patient.daily,
    cultures: patient.cultures,
    diagnoses,
    options,
  };
}

export type PatientMonthPayload = ReturnType<typeof patientMonthPayload>;
