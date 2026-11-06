import { parseBasicBlock } from "./standing-blocks";
import { lineEffective } from "./standing-calendar";
import type { AdmissionRequest } from "./admission";
import type { DietOrder } from "./diet";
import { emptyStanding, type StandingOrders } from "./standing";
import { linesFromFields, type StandingLine } from "./standing-lines";

/** The request remains the doctor's order; acceptance does not sign for the nurse. */
export function standingFromRequest(request: AdmissionRequest, by: string, at: StandingOrders["at"]): StandingOrders {
  return { ...emptyStanding(by, { ...at }), rest: request.rest === "歩行可" ? "病棟内歩行" : request.rest };
}

/** Fictional checklist: diet and vitals, or a basic block with rest and diet filled in. */
export function admissionOrdersMissing(standing: StandingOrders | StandingLine[] | undefined, dietOrders: DietOrder[]): string[] {
  const lines = Array.isArray(standing) ? standing : [];
  const basic = lines.some((l) => /^基本指示\s*$/m.test(l.text) && /^安静度[：:][ \t]*\S.*$/m.test(l.text) && /^食事[：:][ \t]*\S.*$/m.test(l.text));
  const diet = basic || lines.some((l) => !!parseBasicBlock(l.text).diet) || dietOrders.length > 0 || lines.some((l) => l.cat === "食事" && l.text.trim());
  const vitals = Array.isArray(standing)
    ? lines.some((l) => !!parseBasicBlock(l.text).vitals) || lines.some((l) => l.cat === "バイタル" && l.text.trim() && !l.text.startsWith("体重"))
    : !!standing?.vitals;
  return [...(!diet ? ["食事"] : []), ...(!vitals && !basic ? ["バイタル"] : [])];
}

/** Feed structured versions through the same line-change queue as free-text orders.
 * Patient-prefixed ids keep nurses' receipts separate between patients. */
export function standingTakeLines(fields: Record<string, StandingOrders[]>, lines: Record<string, StandingLine[]>): Record<string, StandingLine[]> {
  const out = { ...lines };
  for (const [pid, versions] of Object.entries(fields)) {
    out[pid] = [...(lines[pid] ?? []), ...linesFromFields(versions).filter((l) => l.at.day >= 0 || (l.stop && l.stop.day >= 0) || (l.changed && l.changed.day >= 0)).map((l) => ({ ...l, id: `standing:${pid}:${l.id}`, changedFrom: l.changedFrom ? `standing:${pid}:${l.changedFrom}` : undefined, changed: l.changed ? { ...l.changed, toId: `standing:${pid}:${l.changed.toId}` } : undefined }))];
  }
  return out;
}

export function admissionMissingNow(versions: StandingOrders[], lines: StandingLine[], diets: DietOrder[], time: string): string[] {
  return admissionOrdersMissing([...lines, ...linesFromFields(versions)].filter((l) => lineEffective(l, 0, time)), diets);
}
