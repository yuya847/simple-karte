"use client";

import { CalendarDays, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { addDays, formatMonth, formatShort, type CalendarDate } from "@/lib/dates";
import { planDayLabel, plannedDaysAhead, type PlanItem } from "@/lib/schedule-days";
import { earlierVisitsTitle, stayKindOf, stayTitle, treeDayTag } from "@/lib/stay-labels";
import type { DayOffset, HistoryEntry, Patient } from "@/lib/types";

interface Props {
  patient: Patient;
  entries: HistoryEntry[];
  today: CalendarDate;
  selectedDay: DayOffset | null;
  onSelect: (day: DayOffset) => void;
  /** 外来の受診 before this admission (day and clinic), listed under the stay. */
  visits?: { day: DayOffset; dept: string }[];
  /** Hide the days with no record or order (today and the chosen day stay). On by default. */
  hideEmpty?: boolean;
  /**
   * What the orders plan (schedule-days.ts): the days after today with something planned (採取・撮影・受診 …) are listed
   * under 予定. Only the plans of orders in `entries` count (so the record's filter applies here too); an operation
   * of the OR list has no order and always counts.
   */
  planned?: PlanItem[];
}

/**
 * Tree of hospital days: this admission → month → day, then the days ahead with plans. Clicking a day jumps the past
 * record to it. The chart of a 救急外来・外来 visit says 受診 (「今回の受診」) instead of 入院 (stay-labels.ts).
 */
export function DateTree({ patient, entries, today, selectedDay, onSelect, visits = [], hideEmpty = true, planned = [] }: Props) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setClosed((c) => ({ ...c, [key]: !c[key] }));

  const days: DayOffset[] = [];
  const has = (d: DayOffset) => entries.some((e) => e.day === d);
  for (let d = 0; d >= patient.admittedOn; d--) if (!hideEmpty || d === 0 || d === selectedDay || has(d)) days.push(d);
  const ahead = plannedDaysAhead(planned, (p) => p.orderedOn === null || entries.some((e) => e.kind === "order" && e.id === p.orderId));

  // 表示日のオーダ本体には、中止や退院時処方など予定一覧に含まれないものもある。
  for (const day of new Set(entries.map((e) => e.day).filter((d) => d > 0))) {
    if (!ahead.some((p) => p.day === day)) ahead.push({ day, items: [] });
  }
  ahead.sort((a, b) => a.day - b.day);

  const months = new Map<string, DayOffset[]>();
  for (const d of days) {
    const key = formatMonth(addDays(today, d));
    months.set(key, [...(months.get(key) ?? []), d]);
  }

  const admissionKey = "admission";
  const kind = stayKindOf(patient);
  const top = stayTitle(kind);

  return (
    <nav aria-label="日付" className="scroll-thin h-full overflow-y-auto border-r border-rule bg-paper py-2 text-sm">
      <TreeToggle open={!closed[admissionKey]} onClick={() => toggle(admissionKey)} depth={0}>
        {/* The title and the date each on their own line: in the 150px column they never fit side by side. */}
        <span className="flex min-w-0 flex-col">
          <span className="whitespace-nowrap font-bold">{top.title}</span>
          <span className="nums whitespace-nowrap text-xs text-ink-faint">
            {formatShort(addDays(today, patient.admittedOn))}
            {top.dateSuffix}
          </span>
        </span>
      </TreeToggle>
      {!closed[admissionKey] &&
        [...months.entries()].map(([month, ds]) => (
          <div key={month}>
            <TreeToggle open={!closed[month]} onClick={() => toggle(month)} depth={1}>
              <span className="nums whitespace-nowrap text-[13px] text-ink-soft">{month}</span>
            </TreeToggle>
            {!closed[month] && (
              <ul>
                {ds.map((d) => {
                  const selected = d === selectedDay;
                  return (
                    <li key={d}>
                      <button
                        type="button"
                        onClick={() => onSelect(d)}
                        aria-current={selected ? "date" : undefined}
                        className={`nums flex w-full items-center gap-1.5 py-1 pl-9 pr-2 text-[13px] text-left ${
                          selected ? "bg-ai text-white" : "hover:bg-sheet"
                        }`}
                      >
                        <span className={`whitespace-nowrap ${d === 0 ? "font-bold" : ""}`}>{formatShort(addDays(today, d))}</span>
                        <span className={`ml-auto shrink-0 whitespace-nowrap text-[11px] ${selected ? "text-white/80" : "text-ink-faint"}`}>
                          {treeDayTag(kind, patient.admittedOn, d)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      {ahead.length > 0 && (
        <>
          <TreeToggle open={!closed.ahead} onClick={() => toggle("ahead")} depth={0}>
            <span className="flex items-center gap-1 font-bold text-mizu">
              <CalendarDays size={13} />
              予定
            </span>
            <span className="nums ml-1 text-xs text-ink-faint">{ahead.length}日</span>
          </TreeToggle>
          {!closed.ahead && (
            <ul aria-label="予定のある日">
              {ahead.map(({ day, items }) => {
                const selected = day === selectedDay;
                return (
                  <li key={day}>
                    <button
                      type="button"
                      onClick={() => onSelect(day)}
                      aria-current={selected ? "date" : undefined}
                      title={items.map((p) => `${p.time ?? ""} ${p.kind} ${p.verb} ${p.label}`.trim()).join("\n")}
                      className={`nums flex w-full items-center gap-1.5 py-1 pl-9 pr-2 text-[13px] text-left ${selected ? "bg-ai text-white" : "hover:bg-sheet"}`}
                    >
                      <span className="whitespace-nowrap">{formatShort(addDays(today, day))}</span>
                      <span className={`ml-auto truncate text-[11px] ${selected ? "text-white/80" : "text-mizu"}`}>{items.length ? planDayLabel(items) : "オーダ"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {visits.length > 0 && (
        <>
          <TreeToggle open={!closed.visits} onClick={() => toggle("visits")} depth={0}>
            <span className="font-bold text-mizu">{earlierVisitsTitle(kind)}</span>
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
                      <button type="button" onClick={() => onSelect(v.day)} aria-current={selected ? "date" : undefined} className={`nums flex w-full items-center gap-1.5 py-1 pl-9 pr-2 text-[13px] text-left ${selected ? "bg-ai text-white" : "hover:bg-sheet"}`}>
                        <span className="whitespace-nowrap">{formatShort(addDays(today, v.day))}</span>
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
