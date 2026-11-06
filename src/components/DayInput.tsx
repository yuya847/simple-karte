"use client";

import { addDays, daysFrom, isoDate, todayInTokyo, type CalendarDate } from "@/lib/dates";

export function DayInput({ label, value, onChange, today = todayInTokyo(), disabled }: { label: string; value: number | null; onChange: (day: number) => void; today?: CalendarDate; disabled?: boolean }) {
  return <input disabled={disabled} type="date" aria-label={label} value={value === null ? "" : isoDate(addDays(today, value))} onChange={e => {
    if (!e.target.value) return;
    const [y, m, d] = e.target.value.split("-").map(Number);
    onChange(daysFrom(today, { y, m, d }));
  }} className="rounded border border-rule bg-paper px-1 py-0.5 text-xs" />;
}
