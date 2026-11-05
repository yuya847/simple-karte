import type { StandingOrders } from "./standing";
import type { StandingLine } from "./standing-lines";

export const standingFieldKey = (id: string) => id.replace(/^fld-\d+-/, "");
export function endStandingField(s: StandingOrders, line: StandingLine, day: number, reason: string, by: string, time: string): StandingOrders {
  return { ...s, reason, fieldEnds: { ...s.fieldEnds, [standingFieldKey(line.id)]: { day, time, by, reason: reason.trim() || undefined, kind: "終了" } } };
}

/** Apply only the scheduled field ends, leaving the other instructions intact. */
export function effectiveFields(s: StandingOrders, day: number, time = "23:59"): StandingOrders {
  if (!s.fieldEnds) return s;
  const ended = new Set(Object.entries(s.fieldEnds).filter(([, e]) => e.day < day || (e.day === day && e.time <= time)).map(([key]) => key));
  const out = { ...s };
  for (const key of ["rest", "bath", "vitals", "weight", "io"] as const) if (ended.has(key)) out[key] = null;
  if (ended.has("calls")) { out.calls = []; out.callConscious = false; }
  if (ended.has("other")) out.other = "";
  out.prn = s.prn.filter((r) => !ended.has(`prn:${r.id}`));
  out.conds = s.conds?.filter((r) => !ended.has(`cond:${r.id}`));
  return out;
}
