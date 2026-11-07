import type { RisDesk } from "./ris";
import type { WorkPatient } from "./worksheet";

/** Retain old order-keyed saves, correcting owners of inherited ward orders. */
export function migrateRisOwners(desk: RisDesk, people: WorkPatient[]): RisDesk {
  let next = desk;
  for (const person of people) for (const entry of person.entries) {
    if (entry.order.type !== "imaging") continue;
    const saved = desk[entry.id];
    if (!saved || saved.patientId === person.patient.id) continue;
    if (next === desk) next = { ...desk };
    next[entry.id] = { ...saved, patientId: person.patient.id };
  }
  return next;
}
