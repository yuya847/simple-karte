import { minutesOf } from "./dates";
import { slidingUnits } from "./insulin";
import type { WorkItem } from "./worksheet";

/** Fixed units plus the prescribed scale; an explicit correction remains a person's entry. */
export function insulinEntry(item: Pick<WorkItem, "sliding" | "insulinUnits" | "at">, glucose: string, correction: string, time: string, nowAbs: number) {
  const scale = item.sliding ? slidingUnits(item.sliding.rows, glucose.trim() ? Number(glucose) : NaN) : 0;
  const calculated = !item.sliding && item.insulinUnits === undefined ? undefined : scale === null ? null : (item.insulinUnits ?? 0) + scale;
  const units = correction.trim() ? Number(correction) : calculated;
  const day = Math.floor((item.at ?? nowAbs) / 1440);
  const measuredAt = day * 1440 + minutesOf(time);
  const valid = units != null && Number.isFinite(units) && units >= 0 &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(time) && measuredAt <= nowAbs &&
    (!glucose.trim() || Number.isFinite(Number(glucose)) && Number(glucose) > 0) &&
    (!item.sliding || scale !== null);
  return { calculated, units, measuredAt, valid };
}
