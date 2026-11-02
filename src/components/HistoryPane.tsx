"use client";

import { useEffect, useRef } from "react";
import { addDays, formatShort, hospitalDay, minutesOf, type CalendarDate } from "@/lib/dates";
import { ORDER_TYPE_LABEL, orderLines } from "@/lib/format";
import type { DayOffset, HistoryEntry, NoteEntry, OrderEntry, Patient } from "@/lib/types";
import { InjectionCalendar, PrescriptionCalendar } from "./Calendars";
import { FlowSheet } from "./FlowSheet";

export type LeftView = "record" | "flowsheet" | "injection-cal" | "rx-cal";

export const LEFT_VIEWS: { key: LeftView; label: string }[] = [
  { key: "record", label: "経過" },
  { key: "flowsheet", label: "経過表" },
  { key: "injection-cal", label: "注射カレンダー" },
  { key: "rx-cal", label: "処方カレンダー" },
];

interface Props {
  patient: Patient;
  entries: HistoryEntry[];
  today: CalendarDate;
  nowTime: string;
  selectedDay: DayOffset | null;
  onSelectDay: (d: DayOffset) => void;
  showStopped: boolean;
  onToggleStopped: () => void;
  view: LeftView;
  onView: (v: LeftView) => void;
  onStopDraft: (entry: OrderEntry) => void;
  draftedStops: string[];
}

/** Left pane: what to read while writing on the right — the past record, flow sheet, or the calendars. */
export function HistoryPane(props: Props) {
  const { patient, today, nowTime, selectedDay, onSelectDay, view, onView, showStopped, onToggleStopped, entries, onStopDraft, draftedStops } = props;
  const calendarProps = { patient, entries, today, nowTime, selectedDay, onSelectDay, onStopDraft, draftedStops };
  return (
    <section aria-label="経過" className="flex min-h-0 flex-col border-r border-rule bg-sheet">
      <div className="flex items-center gap-3 border-b border-rule-soft px-4 py-1.5">
        <div role="tablist" aria-label="左の表示" className="flex rounded-md border border-rule p-0.5 text-sm">
          {LEFT_VIEWS.map(({ key: v, label }) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => onView(v)}
              className={`rounded px-2.5 py-0.5 ${view === v ? "bg-ink font-bold text-white" : "text-ink-soft hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {view === "record" && (
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-ink-faint">
            <input type="checkbox" checked={showStopped} onChange={onToggleStopped} className="accent-ai" />
            中止したオーダも表示
          </label>
        )}
      </div>
      {view === "flowsheet" ? (
        <FlowSheet patient={patient} entries={entries} today={today} nowTime={nowTime} selectedDay={selectedDay} onSelectDay={onSelectDay} />
      ) : view === "injection-cal" ? (
        <InjectionCalendar {...calendarProps} />
      ) : view === "rx-cal" ? (
        <PrescriptionCalendar {...calendarProps} />
      ) : (
        <RecordList patient={patient} entries={entries} today={today} selectedDay={selectedDay} showStopped={showStopped} />
      )}
    </section>
  );
}

function RecordList({
  patient,
  entries,
  today,
  selectedDay,
  showStopped,
}: {
  patient: Patient;
  entries: HistoryEntry[];
  today: CalendarDate;
  selectedDay: DayOffset | null;
  showStopped: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedDay === null) return;
    root.current?.querySelector(`[data-day="${selectedDay}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedDay]);

  const days: DayOffset[] = [];
  for (let d = 0; d >= patient.admittedOn; d--) days.push(d);

  return (
      <div ref={root} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pb-24">
        {days.map((d) => {
          const items = entries
            .filter((e) => e.day === d)
            .filter((e) => showStopped || e.kind !== "order" || e.status !== "中止")
            .sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
          return (
            <div
              key={d}
              data-day={d}
              className={`scroll-mt-2 border-b border-rule-soft py-3 ${selectedDay === d ? "rounded-md bg-ai-soft/50 ring-1 ring-ai/30 -mx-2 px-2" : ""}`}
            >
              <h3 className="nums mb-2 flex items-baseline gap-2 text-sm">
                <span className="font-bold">{formatShort(addDays(today, d))}</span>
                <span className="text-xs text-ink-faint">
                  入院{hospitalDay(patient.admittedOn, d)}日目{d === 0 ? "（今日）" : ""}
                </span>
              </h3>
              {items.length === 0 ? (
                <p className="text-xs text-ink-faint">記録なし</p>
              ) : (
                <ol className="space-y-2">
                  {items.map((e, i) => (
                    <li key={`${d}-${i}`}>{e.kind === "note" ? <Note entry={e} /> : <OrderRow entry={e} today={today} />}</li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
  );
}

const ROLE_STYLE: Record<NoteEntry["role"], string> = {
  医師: "text-ai",
  看護師: "text-wakatake",
  薬剤師: "text-yamabuki",
  検査室: "text-fuji",
};

function Note({ entry }: { entry: NoteEntry }) {
  return (
    <article className="text-[13px] leading-relaxed">
      <div className="nums mb-0.5 flex items-center gap-2 text-[11px] text-ink-faint">
        <span>{entry.time}</span>
        <span className={`font-bold ${ROLE_STYLE[entry.role]}`}>{entry.role}</span>
        <span>{entry.author}</span>
      </div>
      {entry.soap ? (
        <dl className="grid grid-cols-[1.5rem_1fr] gap-y-0.5">
          {(["s", "o", "a", "p"] as const).map((k) =>
            entry.soap?.[k] ? (
              <div key={k} className="contents">
                <dt className="font-bold text-ink-faint">{k.toUpperCase()})</dt>
                <dd>{entry.soap[k]}</dd>
              </div>
            ) : null,
          )}
        </dl>
      ) : (
        <p>{entry.text}</p>
      )}
    </article>
  );
}

const STATUS_STYLE: Record<OrderEntry["status"], string> = {
  有効: "border-wakatake/40 text-wakatake",
  実施済: "border-rule text-ink-faint",
  終了: "border-rule text-ink-faint",
  中止: "border-shu/40 text-shu",
};

function OrderRow({ entry, today }: { entry: OrderEntry; today: CalendarDate }) {
  const { main, detail } = orderLines(entry.order, today);
  const stopped = entry.status === "中止";
  return (
    <div className={`rounded-md border border-rule-soft bg-paper/60 px-2.5 py-1.5 text-[13px] ${stopped ? "opacity-60" : ""}`}>
      <div className="nums flex items-center gap-2 text-[11px] text-ink-faint">
        <span>{entry.time}</span>
        <span className="font-bold text-ink-soft">{ORDER_TYPE_LABEL[entry.order.type]}</span>
        <span className={`ml-auto rounded border px-1 ${STATUS_STYLE[entry.status]}`}>
          {entry.status}
          {stopped && entry.stoppedOn === 0 ? "（今日）" : ""}
        </span>
      </div>
      <div className={`nums ${stopped ? "line-through" : ""}`}>{main}</div>
      <div className="nums text-xs text-ink-soft">{detail}</div>
    </div>
  );
}
