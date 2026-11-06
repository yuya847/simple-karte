import type { AdminRecord } from "./mar";

/** 算定へ渡す実施量。別患者・取り消し・未実施の記録は含めない。 */
export function insulinGivenForBilling(records: Record<string, AdminRecord>, patientId: string): { key: string; units: number }[] {
  return Object.values(records)
    .filter(r => r.patientId === patientId && r.status === "実施" && !r.cancellation && r.insulin && Number.isFinite(r.insulin.units) && r.insulin.units >= 0)
    .map(r => ({ key: r.key, units: r.insulin!.units }));
}
