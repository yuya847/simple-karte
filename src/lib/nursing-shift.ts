import { abs } from "./flowsheet";
import { shiftWindow } from "./worksheet";

/** During overlap, the arriving shift owns the worksheet and unrecorded administrations. */
export function nursingShift(now: number) {
  const day = Math.floor(now / 1440);
  const minute = now - day * 1440;
  return minute < 510 ? { day: day - 1, shift: "night" as const } : minute < 990 ? { day, shift: "day" as const } : { day, shift: "night" as const };
}

export function nursingShiftStart(time: string) {
  const current = nursingShift(abs(0, time));
  return shiftWindow(current.shift, current.day).lo;
}
