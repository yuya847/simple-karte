import type { DietOrder } from "./diet";
import { dietLabel } from "./diet";
import type { Draft } from "./drafts";
import { DEFAULT_DOCTOR } from "./doctors";

/** Compare clinical fields only. Timing and author are metadata for the new adjustment. */
export function dietNeedsProposal(current: DietOrder | undefined, next: DietOrder): boolean {
  if (!current) return true;
  const keys = ["kind", "side", "therapeutic", "energyKcal", "saltG", "proteinG", "dysphagia", "thickness", "tube", "npoReason", "comment"] as const;
  return keys.some(k => JSON.stringify(current[k]) !== JSON.stringify(next[k]));
}
export function dietAdjustment(current: DietOrder, next: DietOrder): DietOrder {
  return { ...current, id: next.id, from: next.from, by: next.by, at: next.at, staple: next.staple, prohibited: next.prohibited, supplement: next.supplement, allergyNote: next.allergyNote };
}
export function dietProposal(d: DietOrder, id: string): Extract<Draft, { kind: "diet" }> {
  const { id: _id, by: _by, at: _at, ...diet } = d;
  void _id; void _by; void _at;
  return { id, origin: "manual", sourceText: `食事の変更の提案：${dietLabel(d)}`, comment: "管理栄養士から主治医への提案", kind: "diet", diet };
}
export function attendingDesk(attending: string): string {
  return attending === DEFAULT_DOCTOR ? "医師" : `医師:${attending}`;
}
export function dietProposalCount(drafts: Draft[]): number {
  return drafts.filter(d => d.kind === "diet" && d.sourceText.startsWith("食事の変更の提案：")).length;
}
