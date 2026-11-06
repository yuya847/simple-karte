import type { OtherChange } from "./worksheet";
export function standingPending(patientId: string, changes: OtherChange[], taken: Record<string, string>, previouslyTaken: boolean): boolean {
  const rows = changes.filter(c => c.patientId === patientId && c.kind === "指示簿");
  return rows.length ? rows.some(c => !taken[c.key]) : !previouslyTaken;
}
