// DPC の入院期間 of many patients at once, for the patient list (/api/dpc/batch): each patient's month goes
// through the same calculation as /api/dpc (the 算定 tab's DPC), and only the short brief comes back.
// Server side (the masters are read there). Nothing is sent to Claude; the doctor decides the code.

import { z } from "zod";
import { briefOf, type DpcBrief } from "../dpc-brief";
import { dpcMonth, dpcView } from "./dpc-claim";
import type { ClaimInput } from "./model";
import { ClaimRequest, PatientMonthSchema } from "./request";

/** Patients in one request (the list sends its rows in parts of this size or fewer). */
export const DPC_BATCH_MAX = 40;

export const DpcBatchRequest = ClaimRequest.pick({ today: true, nowTime: true, month: true }).extend({
  dpc: z.object({ coefficient: z.number().min(0.5).max(3), transfer: z.boolean().nullable() }),
  patients: z.array(PatientMonthSchema).min(1).max(DPC_BATCH_MAX),
});
export type DpcBatchRequest = z.infer<typeof DpcBatchRequest>;

/** The brief of each patient, by patient number. One patient that cannot be calculated does not stop the rest. */
export function dpcBriefs(req: DpcBatchRequest): Record<string, DpcBrief> {
  const { today, nowTime, month, dpc, patients } = req;
  const out: Record<string, DpcBrief> = {};
  for (const p of patients) {
    try {
      out[p.patient.id] = briefOf(dpcView(dpcMonth({ ...p, today, nowTime } as unknown as Omit<ClaimInput, "month">, month, dpc)));
    } catch (e) {
      console.error("dpc brief failed", p.patient.id, e);
      out[p.patient.id] = { ok: false, reason: "計算できませんでした" };
    }
  }
  return out;
}
