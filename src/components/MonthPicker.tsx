"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { addDays, daysFrom, formatMonth, isoDate, type CalendarDate } from "@/lib/dates";
import type { DayOffset } from "@/lib/types";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 0 = Sunday, from the ISO date (no Date-object time zone surprises). */
function weekdayIndex(d: CalendarDate): number {
  return new Date(Date.UTC(d.y, d.m - 1, d.d)).getUTCDay();
}

/**
 * A month calendar for choosing one day (再診予約 など). Days are offsets from today; those outside
 * [min, max] cannot be chosen. `marks` puts a small note under a day (e.g. 「予約2」).
 */
export function MonthPicker({ today, value, min, max, onChange, marks = {}, label = "日付" }: { today: CalendarDate; value: DayOffset | null; min: DayOffset; max: DayOffset; onChange: (day: DayOffset) => void; marks?: Record<number, string>; label?: string }) {
  const start = value !== null ? addDays(today, value) : addDays(today, Math.max(min, 0));
  const [view, setView] = useState<{ y: number; m: number }>({ y: start.y, m: start.m });
  const first: CalendarDate = { y: view.y, m: view.m, d: 1 };
  const daysInMonth = new Date(Date.UTC(view.y, view.m, 0)).getUTCDate();
  const lead = weekdayIndex(first);
  const cells: (CalendarDate | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => ({ y: view.y, m: view.m, d: i + 1 }))];
  while (cells.length % 7) cells.push(null);
  const move = (n: number) => setView((v) => {
    const m = v.m + n;
    return m < 1 ? { y: v.y - 1, m: 12 } : m > 12 ? { y: v.y + 1, m: 1 } : { y: v.y, m };
  });
  const firstAllowed = addDays(today, min);
  const lastAllowed = addDays(today, max);
  const canBack = view.y > firstAllowed.y || (view.y === firstAllowed.y && view.m > firstAllowed.m);
  const canForward = view.y < lastAllowed.y || (view.y === lastAllowed.y && view.m < lastAllowed.m);
  return (
    <div role="group" aria-label={label} className="inline-block rounded-md border border-rule bg-paper p-2 text-[12px]">
      <div className="mb-1 flex items-center justify-between">
        <button type="button" onClick={() => move(-1)} disabled={!canBack} aria-label="前の月" className="rounded p-1 text-ink-soft hover:bg-sheet disabled:opacity-30">
          <ChevronLeft size={14} />
        </button>
        <b className="nums">{formatMonth(first)}</b>
        <button type="button" onClick={() => move(1)} disabled={!canForward} aria-label="次の月" className="rounded p-1 text-ink-soft hover:bg-sheet disabled:opacity-30">
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((w, i) => (
          <span key={w} className={`text-[10px] ${i === 0 ? "text-shu" : i === 6 ? "text-ai" : "text-ink-faint"}`}>
            {w}
          </span>
        ))}
        {cells.map((c, i) => {
          if (!c) return <span key={`e${i}`} />;
          const off = daysFrom(today, c);
          const allowed = off >= min && off <= max;
          const selected = value !== null && off === value;
          const wd = i % 7;
          return (
            <button
              key={isoDate(c)}
              type="button"
              disabled={!allowed}
              aria-pressed={selected}
              aria-label={`${c.m}月${c.d}日（${WEEKDAYS[wd]}）`}
              onClick={() => onChange(off)}
              className={`nums flex h-9 w-9 flex-col items-center justify-center rounded ${selected ? "bg-ai font-bold text-white" : allowed ? `hover:bg-sheet ${wd === 0 ? "text-shu" : wd === 6 ? "text-ai" : ""}` : "text-ink-faint/40"} ${off === 0 ? "ring-1 ring-ink-faint" : ""}`}
            >
              <span>{c.d}</span>
              {marks[off] && <span className="text-[9px] leading-none text-yamabuki">{marks[off]}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
