import { addDays, isoDate, type CalendarDate } from "../dates";

export function admissionMonths(today: CalendarDate, admittedOn: number, dischargedOn = 0): string[] {
  const months = new Set<string>();
  for (let day = admittedOn; day <= Math.min(0, dischargedOn); day++) months.add(isoDate(addDays(today, day)).slice(0, 7));
  return [...months];
}

export function canSettleDischarge(month: string, today: CalendarDate, dischargedOn: number | undefined, days: number): boolean {
  return dischargedOn !== undefined && days > 0 && month === isoDate(addDays(today, dischargedOn)).slice(0, 7);
}
