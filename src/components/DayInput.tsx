"use client";

import type { InputHTMLAttributes } from "react";
import { CalendarDays } from "lucide-react";
import { addDays, daysFrom, isoDate, todayInTokyo, type CalendarDate } from "@/lib/dates";

export function DayInput({ label, value, onChange, today = todayInTokyo(), disabled }: { label: string; value: number | null; onChange: (day: number) => void; today?: CalendarDate; disabled?: boolean }) {
  return <IsoDayInput disabled={disabled} aria-label={label} value={value === null ? "" : isoDate(addDays(today, value))} onChange={e => {
    if (!e.target.value) return;
    const [y, m, d] = e.target.value.split("-").map(Number);
    onChange(daysFrom(today, { y, m, d }));
  }} />;
}

/** ISO形式の欄も、日数指定と同じ札とカレンダーで表示する。 */
export function IsoDayInput({ className = "", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return <span className={`relative inline-flex items-center gap-2 rounded focus-within:ring-2 focus-within:ring-ai border border-rule bg-paper px-2 py-1 text-xs ${props.disabled ? "opacity-50" : ""} ${className}`}>
    <span aria-hidden="true" className="nums whitespace-nowrap">{props.value ? String(props.value).replaceAll("-", "/") : "日付を選ぶ"}</span>
    <CalendarDays aria-hidden="true" size={14} />
    <input type="date" {...props} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default" />
  </span>;
}
