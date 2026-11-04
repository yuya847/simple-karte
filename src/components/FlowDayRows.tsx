"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { FLOW_EVENT_MAX, awayOn, eventChoices, podCell, sinceCell, type Cell, type FlowEvent } from "@/lib/flow-days";
import type { Surgery } from "@/lib/surgery";
import type { DayOffset, OrderEntry } from "@/lib/types";
import type { MoveEvent } from "./DietCalendar";

/** What the flow sheet's day columns show besides the date (passed from the chart). */
export interface FlowDays {
  surgeries: Surgery[];
  events: FlowEvent[];
  /** Add or remove a counted day (nurses and doctors); missing for the other roles. */
  onAddEvent?: (ev: { label: string; day: DayOffset }) => void;
  onRemoveEvent?: (id: string) => void;
  meName: string;
}

export type DayBox = (d: DayOffset) => { left: number; width: number };

const TONE: Record<Cell["tone"], string> = { ink: "text-ink", ai: "font-bold text-ai", yamabuki: "bg-yamabuki-soft text-yamabuki", faint: "text-ink-faint" };
const MOVE_TONE: Record<MoveEvent["tone"], string> = { ai: "bg-ai-soft text-ai", wakatake: "bg-wakatake-soft text-wakatake", yamabuki: "bg-yamabuki-soft text-yamabuki", shu: "bg-shu-soft text-shu", ink: "text-ink-soft" };

function Line({ label, sub, labelW, children, action }: { label: string; sub?: string; labelW: number; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex border-b border-rule-soft">
      <div className="flex shrink-0 items-start justify-end gap-0.5 py-1 pr-2 text-right text-ink-soft" style={{ width: labelW }}>
        <span className="min-w-0 truncate" title={label}>
          {label}
          {sub && <span className="block text-[9px] text-ink-faint">{sub}</span>}
        </span>
        {action}
      </div>
      <div className="relative h-6 flex-1">{children}</div>
    </div>
  );
}

const CellAt = ({ c, box }: { c: Cell; box: { left: number; width: number } }) => (
  <span title={c.title} className={`absolute top-0.5 truncate rounded-sm px-0.5 text-center leading-5 ${TONE[c.tone]}`} style={{ left: box.left + 1, width: Math.max(0, box.width - 2) }}>
    {c.text}
  </span>
);

/**
 * Lines under the dates: 術後日数 (when an operation is booked for the patient), 移動 (入院・転床・転棟・転科・
 * 外泊・外出・退院, and 外泊中 between), and one line per day a person chose to count from.
 */
export function FlowDayRows({ days, box, entries, moves, info, labelW, today, admittedOn }: { days: DayOffset[]; box: DayBox; entries: OrderEntry[]; moves: MoveEvent[]; info?: FlowDays; labelW: number; today: CalendarDate; admittedOn: DayOffset }) {
  const [adding, setAdding] = useState(false);
  const surgeries = info?.surgeries ?? [];
  const events = info?.events ?? [];
  return (
    <>
      {surgeries.length > 0 && (
        <Line label="術後日数" sub="手術日を0日" labelW={labelW}>
          {days.map((d) => {
            const c = podCell(surgeries, d);
            return c ? <CellAt key={d} c={c} box={box(d)} /> : null;
          })}
        </Line>
      )}
      <Line label="移動" sub="外泊・転棟など" labelW={labelW}>
        {days.map((d) => {
          const ms = moves.filter((m) => m.day === d);
          const away = awayOn(entries, d);
          const b = box(d);
          if (!ms.length) return away ? <CellAt key={d} c={away} box={b} /> : null;
          return (
            <span
              key={d}
              title={ms.map((m) => `${m.time ?? ""} ${m.label}${m.done ? "（実施済み）" : m.entryId ? "（予約）" : ""}`.trim()).join("\n")}
              className={`absolute top-0.5 truncate rounded-sm px-0.5 text-center leading-5 ${MOVE_TONE[ms[0].tone]}`}
              style={{ left: b.left + 1, width: Math.max(0, b.width - 2) }}
            >
              {ms.map((m) => m.label.replace(/（.*$/, "").replace(/　.*$/, "")).join("・")}
            </span>
          );
        })}
      </Line>
      {events.map((ev) => (
        <Line
          key={ev.id}
          label={ev.label}
          sub={`${formatShort(addDays(today, ev.day))}から`}
          labelW={labelW}
          action={
            info?.onRemoveEvent && ev.by === info.meName ? (
              <button type="button" onClick={() => info.onRemoveEvent!(ev.id)} aria-label={`「${ev.label}」の日数を外す`} title={`外す（${ev.by} が足した）`} className="mt-0.5 shrink-0 text-ink-faint hover:text-shu">
                <X size={11} />
              </button>
            ) : undefined
          }
        >
          {days.map((d) => {
            const c = sinceCell(ev, d);
            return c ? <CellAt key={d} c={c} box={box(d)} /> : null;
          })}
        </Line>
      ))}
      {info?.onAddEvent && events.length < FLOW_EVENT_MAX && (
        <div className="flex border-b border-rule-soft print:hidden">
          <div className="shrink-0" style={{ width: labelW }} />
          {adding ? (
            <EventForm
              days={Array.from({ length: 2 - admittedOn }, (_, i) => admittedOn + i)}
              today={today}
              choices={eventChoices(entries, surgeries, admittedOn)}
              onCancel={() => setAdding(false)}
              onAdd={(ev) => {
                info.onAddEvent!(ev);
                setAdding(false);
              }}
            />
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="my-0.5 flex items-center gap-0.5 rounded px-1 text-[10px] text-ink-faint hover:bg-paper hover:text-ai">
              <Plus size={11} />
              日数を数える日を足す（イベント日数）
            </button>
          )}
        </div>
      )}
    </>
  );
}

function EventForm({ days, today, choices, onAdd, onCancel }: { days: DayOffset[]; today: CalendarDate; choices: { label: string; day: DayOffset }[]; onAdd: (ev: { label: string; day: DayOffset }) => void; onCancel: () => void }) {
  const [label, setLabel] = useState("");
  const [day, setDay] = useState<DayOffset>(0);
  const box = "rounded border border-rule bg-paper px-1 py-0.5 text-[11px]";
  return (
    <form
      className="flex flex-wrap items-center gap-1.5 py-1 text-[11px]"
      onSubmit={(e) => {
        e.preventDefault();
        if (label.trim()) onAdd({ label: label.trim().slice(0, 20), day });
      }}
    >
      {choices.length > 0 && (
        <select
          aria-label="記録から選ぶ"
          value=""
          onChange={(e) => {
            const c = choices[Number(e.target.value)];
            if (c) {
              setLabel(c.label);
              setDay(c.day);
            }
          }}
          className={box}
        >
          <option value="">記録から選ぶ</option>
          {choices.map((c, i) => (
            <option key={i} value={i}>
              {formatShort(addDays(today, c.day))} {c.label}
            </option>
          ))}
        </select>
      )}
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例：抗菌薬の開始" aria-label="数える日の名前" className={`${box} w-32`} />
      <select value={day} onChange={(e) => setDay(Number(e.target.value))} aria-label="数える日" className={box}>
        {days.map((d) => (
          <option key={d} value={d}>
            {formatShort(addDays(today, d))}
          </option>
        ))}
      </select>
      <button type="submit" disabled={!label.trim()} className="rounded bg-ai px-2 py-0.5 font-bold text-white disabled:opacity-40">
        足す
      </button>
      <button type="button" onClick={onCancel} className="rounded border border-rule px-2 py-0.5">
        やめる
      </button>
    </form>
  );
}
