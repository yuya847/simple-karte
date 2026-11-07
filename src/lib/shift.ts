import { minutesOf } from "./dates";

export type Shift = "day" | "night" | "all";
/** 既存のワークシート・申し送りの勤務帯。 */
export const SHIFTS: Record<Shift, { label: string; from: string; to: string; nextDay?: boolean }> = {
  day: { label: "日勤", from: "08:30", to: "17:00" },
  night: { label: "夜勤", from: "16:30", to: "09:00", nextDay: true },
  all: { label: "終日", from: "00:00", to: "24:00" },
};
export function shiftWindow(shift: Shift, day: number) {
  const s = SHIFTS[shift];
  return { lo: day * 1440 + minutesOf(s.from), hi: (day + (s.nextDay ? 1 : 0)) * 1440 + minutesOf(s.to) };
}
