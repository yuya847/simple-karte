"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { addDays, formatMonth, formatShort, hospitalDay, type CalendarDate } from "@/lib/dates";
import type { DayOffset, HistoryEntry, Patient } from "@/lib/types";

interface Props {
  patient: Patient;
  entries: HistoryEntry[];
  today: CalendarDate;
  selectedDay: DayOffset | null;
  onSelect: (day: DayOffset) => void;
  /** 外来の受診 before this admission (day and clinic), listed under the stay. */
  visits?: { day: DayOffset; dept: string }[];
}

/** Tree of hospital days: this admission → month → day. Clicking a day jumps the past record to it. */
export function DateTree({ patient, entries, today, selectedDay, onSelect, visits = [] }: Props) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setClosed((c) => ({ ...c, [key]: !c[key] }));

  const days: DayOffset[] = [];
  for (let d = 0; d >= patient.admittedOn; d--) days.push(d);

  const months = new Map<string, DayOffset[]>();
  for (const d of days) {
    const key = formatMonth(addDays(today, d));
    months.set(key, [...(months.get(key) ?? []), d]);
  }

  const counts = (d: DayOffset) => ({
    notes: entries.filter((e) => e.day === d && e.kind === "note").length,
    orders: entries.filter((e) => e.day === d && e.kind === "order").length,
  });

  const admissionKey = "admission";

  return (
    <nav aria-label="日付" className="scroll-thin h-full overflow-y-auto border-r border-rule bg-paper py-2 text-sm">
      <TreeToggle open={!closed[admissionKey]} onClick={() => toggle(admissionKey)} depth={0}>
        <span className="font-bold">今回入院</span>
        <span className="nums ml-1 text-xs text-ink-faint">{formatShort(addDays(today, patient.admittedOn))}〜</span>
      </TreeToggle>
      {!closed[admissionKey] &&
        [...months.entries()].map(([month, ds]) => (
          <div key={month}>
            <TreeToggle open={!closed[month]} onClick={() => toggle(month)} depth={1}>
              <span className="nums text-ink-soft">{month}</span>
            </TreeToggle>
            {!closed[month] && (
              <ul>
                {ds.map((d) => {
                  const c = counts(d);
                  const selected = d === selectedDay;
                  return (
                    <li key={d}>
                      <button
                        type="button"
                        onClick={() => onSelect(d)}
                        aria-current={selected ? "date" : undefined}
                        className={`nums flex w-full items-center gap-1.5 py-1 pl-9 pr-2 text-left ${
                          selected ? "bg-ai text-white" : "hover:bg-sheet"
                        }`}
                      >
                        <span className={d === 0 ? "font-bold" : ""}>{formatShort(addDays(today, d))}</span>
                        <span className={`ml-auto text-[11px] ${selected ? "text-white/80" : "text-ink-faint"}`}>
                          {d === 0 ? "今日" : `${hospitalDay(patient.admittedOn, d)}日目`}
                        </span>
                      </button>
                      {(c.notes > 0 || c.orders > 0) && (
                        <div className={`nums pb-1 pl-9 text-[10px] ${selected ? "bg-ai text-white/80" : "text-ink-faint"}`}>
                          {c.notes > 0 && <span className="mr-2">記事 {c.notes}</span>}
                          {c.orders > 0 && <span>オーダ {c.orders}</span>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      {visits.length > 0 && (
        <>
          <TreeToggle open={!closed.visits} onClick={() => toggle("visits")} depth={0}>
            <span className="font-bold text-mizu">入院前の外来</span>
            <span className="nums ml-1 text-xs text-ink-faint">{visits.length}回</span>
          </TreeToggle>
          {!closed.visits && (
            <ul>
              {[...visits]
                .sort((a, b) => b.day - a.day)
                .map((v) => {
                  const selected = v.day === selectedDay;
                  return (
                    <li key={v.day}>
                      <button type="button" onClick={() => onSelect(v.day)} aria-current={selected ? "date" : undefined} className={`nums flex w-full items-center gap-1.5 py-1 pl-9 pr-2 text-left ${selected ? "bg-ai text-white" : "hover:bg-sheet"}`}>
                        <span>{formatShort(addDays(today, v.day))}</span>
                        <span className={`ml-auto truncate text-[11px] ${selected ? "text-white/80" : "text-mizu"}`}>{v.dept}</span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
        </>
      )}
    </nav>
  );
}

function TreeToggle({ open, onClick, depth, children }: { open: boolean; onClick: () => void; depth: number; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className="flex w-full items-center gap-1 py-1 pr-2 text-left hover:bg-sheet"
      style={{ paddingLeft: 8 + depth * 12 }}
    >
      {open ? <ChevronDown size={14} className="shrink-0 text-ink-faint" /> : <ChevronRight size={14} className="shrink-0 text-ink-faint" />}
      {children}
    </button>
  );
}
