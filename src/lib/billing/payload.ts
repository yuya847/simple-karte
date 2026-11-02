// What the chart sends to the billing APIs for one patient (the fictional record as it stands now).

import type { Diagnosis } from "../diagnoses";
import type { HistoryEntry, Patient } from "../types";
import type { BillingOptions } from "./model";

export function patientMonthPayload(patient: Patient, entries: HistoryEntry[], diagnoses: Diagnosis[], options: BillingOptions) {
  return {
    patient: { id: patient.id, name: patient.name, kana: patient.kana, sex: patient.sex, age: patient.age, admittedOn: patient.admittedOn },
    entries,
    daily: patient.daily,
    cultures: patient.cultures,
    diagnoses,
    options,
  };
}

export type PatientMonthPayload = ReturnType<typeof patientMonthPayload>;
