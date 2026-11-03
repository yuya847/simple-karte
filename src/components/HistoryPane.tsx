"use client";

import { useEffect, useRef, useState } from "react";
import { History, PencilLine } from "lucide-react";
import { canRevise, diffLines, noteText, versionsOf } from "@/lib/notes";
import { useMe } from "./RoleContext";
import { addDays, formatShort, hospitalDay, minutesOf, type CalendarDate } from "@/lib/dates";
import { ORDER_TYPE_LABEL, orderLines } from "@/lib/format";
import type { DayOffset, HistoryEntry, NoteEntry, OrderEntry, Patient } from "@/lib/types";
import { InjectionCalendar, PrescriptionCalendar, ProcedureCalendar } from "./Calendars";
import { FlowSheet } from "./FlowSheet";

export type LeftView = "record" | "flowsheet" | "injection-cal" | "rx-cal" | "proc-cal";

export const LEFT_VIEWS: { key: LeftView; label: string; title?: string }[] = [
  { key: "record", label: "経過" },
  { key: "flowsheet", label: "経過表" },
  { key: "injection-cal", label: "注射", title: "注射カレンダー" },
  { key: "rx-cal", label: "処方", title: "処方カレンダー" },
  { key: "proc-cal", label: "処置", title: "処置カレンダー" },
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
  /** 延長 (add days) and 修正 (stop and copy into the 注射 tab) from the injection calendar. */
  onExtendDraft?: (entry: OrderEntry, days: number) => void;
  onModify?: (entry: OrderEntry) => void;
  pendingExtends?: Record<string, number>;
  /** Correct a confirmed note (a new version; the earlier ones are kept). */
  onReviseNote?: (e: NoteEntry, text: string, reason: string) => void;
  /** Put vital-sign lines copied from the flow sheet into O) of today's note. */
  onInsertVitals?: (text: string) => void;
}

/** Left pane: what to read while writing on the right — the past record, flow sheet, or the calendars. */
export function HistoryPane(props: Props) {
  const { patient, today, nowTime, selectedDay, onSelectDay, view, onView, showStopped, onToggleStopped, entries, onStopDraft, draftedStops, onReviseNote, onInsertVitals, onExtendDraft, onModify, pendingExtends } = props;
  const calendarProps = { patient, entries, today, nowTime, selectedDay, onSelectDay, onStopDraft, draftedStops, onExtendDraft, onModify, pendingExtends };
  return (
    <section aria-label="経過" className="flex min-h-0 flex-col border-r border-rule bg-sheet">
      <div className="flex items-center gap-3 border-b border-rule-soft px-4 py-1.5">
        <div role="tablist" aria-label="左の表示" className="flex rounded-md border border-rule p-0.5 text-sm">
          {LEFT_VIEWS.map(({ key: v, label, title }) => (
            <button
              key={v}
              type="button"
              role="tab"
              title={title}
              aria-selected={view === v}
              onClick={() => onView(v)}
              className={`whitespace-nowrap rounded px-2.5 py-0.5 ${view === v ? "bg-ink font-bold text-white" : "text-ink-soft hover:text-ink"}`}
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
        <FlowSheet patient={patient} entries={entries} today={today} nowTime={nowTime} selectedDay={selectedDay} onSelectDay={onSelectDay} onInsertVitals={onInsertVitals} />
      ) : view === "injection-cal" ? (
        <InjectionCalendar {...calendarProps} />
      ) : view === "rx-cal" ? (
        <PrescriptionCalendar {...calendarProps} />
      ) : view === "proc-cal" ? (
        <ProcedureCalendar {...calendarProps} />
      ) : (
        <RecordList patient={patient} entries={entries} today={today} selectedDay={selectedDay} showStopped={showStopped} onReviseNote={onReviseNote} />
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
  onReviseNote,
}: {
  patient: Patient;
  entries: HistoryEntry[];
  today: CalendarDate;
  selectedDay: DayOffset | null;
  showStopped: boolean;
  onReviseNote?: (e: NoteEntry, text: string, reason: string) => void;
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
                    <li key={`${d}-${i}`}>{e.kind === "note" ? <Note entry={e} today={today} onRevise={onReviseNote} /> : <OrderRow entry={e} today={today} />}</li>
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
  臨床検査技師: "text-fuji",
  管理栄養士: "text-yamabuki",
  MSW: "text-fuji",
  医事課: "text-ink-soft",
  検査室: "text-fuji",
};

function Note({ entry, today, onRevise }: { entry: NoteEntry; today: CalendarDate; onRevise?: (e: NoteEntry, text: string, reason: string) => void }) {
  const me = useMe();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [reason, setReason] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const versions = versionsOf(entry);
  const last = versions.at(-1)!;
  const mine = !!onRevise && canRevise(entry, me.name);
  return (
    <article className="text-[13px] leading-relaxed">
      <div className="nums mb-0.5 flex items-center gap-2 text-[11px] text-ink-faint">
        <span>{entry.time}</span>
        <span className={`font-bold ${ROLE_STYLE[entry.role]}`}>{entry.role}</span>
        <span>{entry.author}</span>
        {versions.length > 1 && (
          <button type="button" onClick={() => setShowHistory((v) => !v)} className="flex items-center gap-0.5 rounded border border-yamabuki/50 px-1 text-yamabuki" aria-expanded={showHistory}>
            <History size={11} />
            修正あり（第{versions.length}版 {last.day === 0 ? "" : formatShort(addDays(today, last.day))}
            {last.time} {last.author}）
          </button>
        )}
        {mine && !editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(noteText(entry));
              setReason("");
              setEditing(true);
            }}
            className="ml-auto flex items-center gap-0.5 rounded px-1 text-ink-faint hover:bg-paper hover:text-ink"
            title="自分が書いた記事だけ直せます。前の版は残ります。"
          >
            <PencilLine size={11} />
            修正
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-1 rounded-md border border-yamabuki/50 bg-yamabuki-soft/30 p-2">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} aria-label="記事の修正" className="nums w-full rounded border border-rule bg-sheet px-2 py-1 text-[13px] outline-none" />
          <label className="flex items-center gap-1 text-[11px] text-ink-soft">
            修正の理由
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：数値の誤記" className="flex-1 rounded border border-rule bg-sheet px-1.5 py-0.5 text-[12px] text-ink" />
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-ink-faint">前の版は消えずに残り、誰でも見られます。</span>
            <button type="button" onClick={() => setEditing(false)} className="ml-auto rounded border border-rule px-2 py-0.5 text-[11px]">
              やめる
            </button>
            <button
              type="button"
              disabled={!reason.trim() || draft.trim() === noteText(entry).trim()}
              onClick={() => {
                onRevise!(entry, draft, reason);
                setEditing(false);
              }}
              className="rounded bg-yamabuki px-2 py-0.5 text-[11px] font-bold text-white disabled:opacity-40"
            >
              修正を確定（{me.name}）
            </button>
          </div>
        </div>
      ) : (
        <NoteBody n={entry} />
      )}
      {showHistory && versions.length > 1 && (
        <ol className="mt-1 space-y-1.5 border-l-2 border-yamabuki/40 pl-2 text-[12px]">
          {versions.map((v, i) => (
            <li key={i}>
              <div className="nums text-[11px] text-ink-faint">
                第{i + 1}版　{v.day === 0 ? "今日" : formatShort(addDays(today, v.day))} {v.time}　{v.author}
                {v.reason ? `　理由：${v.reason}` : i === 0 ? "　（最初の記録）" : ""}
              </div>
              {i === 0 ? (
                <div className="whitespace-pre-wrap text-ink-soft">{noteText(v)}</div>
              ) : (
                <div className="whitespace-pre-wrap">
                  {diffLines(noteText(versions[i - 1]), noteText(v)).map((l, j) =>
                    l.kind === "same" ? (
                      <div key={j} className="text-ink-soft">{l.text || " "}</div>
                    ) : l.kind === "removed" ? (
                      <div key={j} className="text-shu line-through" aria-label="消した行">{l.text || " "}</div>
                    ) : (
                      <div key={j} className="bg-wakatake-soft text-wakatake" aria-label="足した行">{l.text || " "}</div>
                    ),
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function NoteBody({ n }: { n: Pick<NoteEntry, "soap" | "text"> }) {
  return n.soap ? (
    <dl className="grid grid-cols-[1.5rem_1fr] gap-y-0.5">
      {(["s", "o", "a", "p"] as const).map((k) =>
        n.soap?.[k] ? (
          <div key={k} className="contents">
            <dt className="font-bold text-ink-faint">{k.toUpperCase()})</dt>
            <dd className="whitespace-pre-wrap">{n.soap[k]}</dd>
          </div>
        ) : null,
      )}
    </dl>
  ) : (
    <p className="whitespace-pre-wrap">{n.text}</p>
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
