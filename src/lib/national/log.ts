// What was registered with or sent to the SIMULATED national services (模擬), kept with the chart's records.

import type { ClinsReceipt } from "./clins";
import type { ErxReceipt } from "./erx";

export type NationalRecord =
  | { kind: "電子処方箋"; patientKey: string; prescriptionNo: string; receipt: ErxReceipt; lines: string[]; by: string; at: string }
  | { kind: "電子カルテ情報共有"; patientKey: string; receipt: ClinsReceipt; what: string; by: string; at: string };

/** The next 年内連番 of the 処方箋番号 (the count of this year's prescriptions + 1). */
export const nextSerial = (log: NationalRecord[], year: number) => log.filter((r) => r.kind === "電子処方箋" && r.prescriptionNo.includes(`-${year}-`)).length + 1;

export const recordsOf = (log: NationalRecord[], patientKey: string) => log.filter((r) => r.patientKey === patientKey);
