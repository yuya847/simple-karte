"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, GripVertical, History, MoreHorizontal, PencilLine, Search, X } from "lucide-react";
import { searchKey } from "@/lib/kana";
import { LAB_TESTS } from "@/lib/master";
import { canRevise, diffLines, noteText, noteTimes, versionsOf, type NotePart } from "@/lib/notes";
import { useMe } from "./RoleContext";
import { CosignMark } from "./Cosign";
import { addDays, formatShort, hospitalDay, minutesOf, type CalendarDate } from "@/lib/dates";
import { ORDER_TYPE_LABEL, orderLines } from "@/lib/format";
import type { DayOffset, HistoryEntry, NoteEntry, OrderEntry, Patient } from "@/lib/types";
import { InjectionCalendar, PrescriptionCalendar, ProcedureCalendar } from "./Calendars";
import { FlowSheet, type FlowSheetProps } from "./FlowSheet";
import type { FlowIo } from "./IoFlowRows";
import type { FlowDays } from "./FlowDayRows";
import { DietCalendar, type BookWhat, type MoveEvent } from "./DietCalendar";
import { BookingList } from "./BookingList";
import type { Booking } from "@/lib/bookings";
import type { DietOrder } from "@/lib/diet";
import type { CareOrder, CareRecord } from "@/lib/care-orders";
import type { StandingLine } from "@/lib/standing-lines";
import { StandingCalendar } from "./StandingCalendar";
import type { TakeBadge } from "@/lib/order-confirm";
import { TakeBadgeMark } from "./TakeConfirm";

/** The ward's 実施・未実施 record of a dose (order id, minutes from today 00:00). */
type CalendarMar = (orderId: string, at: number) => { status: "実施" | "未実施"; by: string; doneAt: string; reason?: string } | undefined;

export type LeftView = "record" | "flowsheet" | "injection-cal" | "rx-cal" | "proc-cal" | "diet-cal" | "standing-cal" | "bookings";

export const LEFT_VIEWS: { key: LeftView; label: string; title?: string }[] = [
  { key: "record", label: "経過" },
  { key: "flowsheet", label: "経過表" },
  { key: "injection-cal", label: "注射", title: "注射カレンダー" },
  { key: "rx-cal", label: "内服", title: "内服カレンダー" },
  { key: "proc-cal", label: "処置", title: "処置カレンダー" },
  { key: "diet-cal", label: "移動・食事", title: "移動・食事カレンダー（日付を押すと転床・転棟・転科・退院を予約）" },
  { key: "standing-cal", label: "指示簿", title: "指示簿カレンダー（指示の行ごとに、続く期間を帯で）" },
  { key: "bookings", label: "予約", title: "予約の一覧（検査・透析・リハビリ・手術など）" },
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
  marOf?: CalendarMar;
  /** Correct a confirmed note (a new version; the earlier ones are kept). */
  onReviseNote?: (e: NoteEntry, text: string, reason: string) => void;
  /** Put vital-sign lines copied from the flow sheet into O) of today's note. */
  onInsertVitals?: (text: string) => void;
  /** Do: copy a past note or order to the right (dragged there, or from the menu). */
  onDo?: (p: DoPayload) => void;
  /** Diet orders, for the 食事 calendar; pressing a meal opens the diet panel. */
  diets?: DietOrder[];
  onOpenDiet?: () => void;
  /** Open an imaging order's pictures in the PACS viewer. */
  onOpenImage?: (entryId: string) => void;
  /** 検体検査: open the results table at this draw (day and time of the collection). */
  onOpenResult?: (at: { day: DayOffset; time: string }) => void;
  /** The patient's bookings (予約の一覧). */
  bookings?: Booking[];
  /** 移動 row of the 移動・食事 calendar, booking from a date, and carrying out a booked move. */
  moves?: MoveEvent[];
  onBook?: (day: number, what: BookWhat) => void;
  onDoMove?: (entryId: string) => void;
  /** 看護ケア指示 and their records, for the flow sheet. */
  care?: { orders: CareOrder[]; records: CareRecord[]; sessionStart: number };
  /** 水分出納 rows of the flow sheet. */
  io?: FlowIo;
  /** 術後日数 and the counted days on the flow sheet's dates. */
  flowDays?: FlowDays;
  /** The rest of what the flow sheet shows and does (lab draws waiting, entries from its cells …). */
  flow?: FlowExtra;
  /** 指示簿カレンダー: the lines (free text and from the fields), stopping one, and opening the 指示簿 panel. */
  standingCal?: { lines: StandingLine[]; onStop?: (id: string, reason: string) => void; onOpenPanel?: () => void };
  /** 指示受けの状態 of an order (未指示受け／受け ◯◯ hh:mm／確認済み／医師に確認中), shown on each order; null when nothing waits. */
  takeBadgeOf?: (entryId: string) => TakeBadge | null;
}

/** Flow sheet props that the chart passes through this pane as they are. */
export type FlowExtra = Partial<Omit<FlowSheetProps, "patient" | "entries" | "today" | "nowTime" | "selectedDay" | "onSelectDay" | "onInsertVitals" | "care" | "io" | "diets" | "moves" | "dayInfo">>;

/** What is copied to the right (Do): a past note's text, or a past order to write again. */
export type DoPayload = { kind: "note"; text: string; label: string } | { kind: "order"; entryId: string };
export const DO_MIME = "application/x-simple-karte-do";
export function readDo(e: React.DragEvent): DoPayload | null {
  try {
    const v = e.dataTransfer.getData(DO_MIME);
    return v ? (JSON.parse(v) as DoPayload) : null;
  } catch {
    return null;
  }
}
const dragDo = (p: DoPayload) => (e: React.DragEvent) => {
  e.dataTransfer.setData(DO_MIME, JSON.stringify(p));
  e.dataTransfer.setData("text/plain", p.kind === "note" ? p.text : "");
  e.dataTransfer.effectAllowed = "copy";
};

/** Left pane: what to read while writing on the right — the past record, flow sheet, or the calendars. */
export function HistoryPane(props: Props) {
  const { patient, today, nowTime, selectedDay, onSelectDay, view, onView, showStopped, onToggleStopped, entries, onStopDraft, draftedStops, onReviseNote, onInsertVitals, onExtendDraft, onModify, pendingExtends, marOf, onDo, diets, onOpenDiet, onOpenImage, bookings, moves, onBook, onDoMove, care, io, flowDays, flow, onOpenResult, standingCal, takeBadgeOf } = props;
  const calendarProps = { patient, entries, today, nowTime, selectedDay, onSelectDay, onStopDraft, draftedStops, onExtendDraft, onModify, pendingExtends, marOf };
  // A 記録 mark of the flow sheet opens 経過 on that day with only that kind of note (n renews the list).
  const [recordKind, setRecordKind] = useState<{ kind: string; n: number }>({ kind: "all", n: 0 });
  const openRecord = (day: DayOffset, kind: string) => {
    setRecordKind((k) => ({ kind, n: k.n + 1 }));
    onSelectDay(day);
    onView("record");
  };
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
        <FlowSheet patient={patient} entries={entries} today={today} nowTime={nowTime} selectedDay={selectedDay} onSelectDay={onSelectDay} onInsertVitals={onInsertVitals} care={care} io={io} diets={diets} moves={moves} dayInfo={flowDays} onOpenRecord={openRecord} {...flow} />
      ) : view === "injection-cal" ? (
        <InjectionCalendar {...calendarProps} />
      ) : view === "rx-cal" ? (
        <PrescriptionCalendar {...calendarProps} />
      ) : view === "proc-cal" ? (
        <ProcedureCalendar {...calendarProps} />
      ) : view === "bookings" ? (
        <BookingList bookings={bookings ?? []} today={today} />
      ) : view === "diet-cal" ? (
        <DietCalendar patient={patient} entries={entries} diets={diets ?? []} today={today} nowTime={nowTime} onOpenDiet={onOpenDiet} moves={moves} onBook={onBook} onDoMove={onDoMove} />
      ) : view === "standing-cal" ? (
        <StandingCalendar patient={patient} lines={standingCal?.lines ?? []} today={today} nowTime={nowTime} onStop={standingCal?.onStop} onOpenPanel={standingCal?.onOpenPanel} />
      ) : (
        <RecordList key={recordKind.n} kindInit={recordKind.kind} patient={patient} entries={entries} today={today} selectedDay={selectedDay} showStopped={showStopped} onReviseNote={onReviseNote} onDo={onDo} onOpenImage={onOpenImage} onOpenResult={onOpenResult} takeBadgeOf={takeBadgeOf} />
      )}
    </section>
  );
}

/** Kinds of record to narrow the list to (one at a time), like the navigator of a ward chart. */
/** What the record is filtered by: the writer's profession for notes, the kind for orders. Each is a checkbox. */
const CATS: { key: string; group: "note" | "order"; label: string; test: (e: HistoryEntry) => boolean }[] = [
  { key: "doctor", group: "note", label: "医師", test: (e) => e.kind === "note" && e.role === "医師" },
  { key: "nurse", group: "note", label: "看護師", test: (e) => e.kind === "note" && e.role === "看護師" },
  { key: "staff", group: "note", label: "ほかの職種", test: (e) => e.kind === "note" && e.role !== "医師" && e.role !== "看護師" },
  { key: "prescription", group: "order", label: "内服", test: (e) => e.kind === "order" && e.order.type === "prescription" },
  { key: "injection", group: "order", label: "注射", test: (e) => e.kind === "order" && e.order.type === "injection" },
  { key: "lab", group: "order", label: "検体検査", test: (e) => e.kind === "order" && e.order.type === "lab" },
  { key: "exam", group: "order", label: "画像・生理", test: (e) => e.kind === "order" && (e.order.type === "imaging" || e.order.type === "physio") },
  { key: "procedure", group: "order", label: "処置・透析・輸血", test: (e) => e.kind === "order" && e.order.type === "procedure" },
];
const ALL_CATS = CATS.map((c) => c.key);
/** The categories a quick choice stands for (記載だけ・オーダだけ), or an old single-kind key. */
const catsFor = (key: string): string[] => (key === "notes" ? CATS.filter((c) => c.group === "note").map((c) => c.key) : key === "orders" ? CATS.filter((c) => c.group === "order").map((c) => c.key) : CATS.some((c) => c.key === key) ? [key] : ALL_CATS);

const textOf = (e: HistoryEntry, today: CalendarDate) => (e.kind === "note" ? `${e.author} ${noteText(e)}` : `${orderLines(e.order, today).main} ${orderLines(e.order, today).detail} ${e.author}`);

function RecordList({
  kindInit = "all",
  patient,
  entries,
  today,
  selectedDay,
  showStopped,
  onReviseNote,
  onDo,
  onOpenImage,
  onOpenResult,
  takeBadgeOf,
}: {
  kindInit?: string;
  patient: Patient;
  entries: HistoryEntry[];
  today: CalendarDate;
  selectedDay: DayOffset | null;
  showStopped: boolean;
  onReviseNote?: (e: NoteEntry, text: string, reason: string) => void;
  onDo?: (p: DoPayload) => void;
  onOpenImage?: (entryId: string) => void;
  onOpenResult?: (at: { day: DayOffset; time: string }) => void;
  takeBadgeOf?: Props["takeBadgeOf"];
}) {
  const root = useRef<HTMLDivElement>(null);
  // A draw's result is filed under the collection time (the same as the printed label).
  const resultAt = (e: HistoryEntry) => {
    if (e.kind !== "order" || e.order.type !== "lab") return null;
    const c = e.order.collect;
    return patient.labs.some((l) => l.day === c.day && l.time === c.time) ? { day: c.day, time: c.time } : null;
  };
  const [on, setOn] = useState<string[]>(() => catsFor(kindInit));
  const [q, setQ] = useState("");
  const toggle = (k: string) => setOn((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  useEffect(() => {
    if (selectedDay === null) return;
    root.current?.querySelector(`[data-day="${selectedDay}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedDay]);

  const days: DayOffset[] = [];
  for (let d = 0; d >= patient.admittedOn; d--) days.push(d);
  const visible = entries.filter((e) => showStopped || e.kind !== "order" || e.status !== "中止");
  const key = searchKey(q.trim());
  const shown = visible.filter((e) => CATS.some((c) => on.includes(c.key) && c.test(e)) && (!key || searchKey(textOf(e, today)).includes(key)));
  const narrowed = on.length !== ALL_CATS.length || !!key;
  const counts = Object.fromEntries(CATS.map((c) => [c.key, visible.filter(c.test).length]));
  const allOf = (g: "note" | "order") => CATS.filter((c) => c.group === g).every((c) => on.includes(c.key));
  const onlyOf = (g: "note" | "order") => allOf(g) && CATS.filter((c) => c.group !== g).every((c) => !on.includes(c.key));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-1.5 border-b border-rule-soft px-4 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          <span role="group" aria-label="早く絞る" className="flex rounded-md border border-rule p-0.5">
            {([
              ["all", "すべて", on.length === ALL_CATS.length],
              ["notes", "記載だけ", onlyOf("note")],
              ["orders", "オーダだけ", onlyOf("order")],
            ] as const).map(([k, label, active]) => (
              <button key={k} type="button" aria-pressed={active} onClick={() => setOn(catsFor(k))} className={`rounded px-2 py-0.5 ${active ? "bg-ink font-bold text-white" : "text-ink-soft hover:text-ink"}`}>
                {label}
              </button>
            ))}
          </span>
          {(["note", "order"] as const).map((g) => (
            <span key={g} role="group" aria-label={g === "note" ? "記載を書いた職種" : "オーダの種類"} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-ink-faint">{g === "note" ? "記載" : "オーダ"}</span>
              {CATS.filter((c) => c.group === g).map((c) => (
                <label key={c.key} className={`nums flex cursor-pointer items-center gap-0.5 ${counts[c.key] === 0 ? "text-ink-faint/60" : on.includes(c.key) ? "text-ink" : "text-ink-soft"}`}>
                  <input type="checkbox" checked={on.includes(c.key)} onChange={() => toggle(c.key)} className="accent-ai" />
                  {g === "note" ? <span className={`rounded px-1 leading-4 ${ROLE_CHIP[c.key]}`}>{c.label}</span> : c.label}
                  <span className="text-ink-faint">{counts[c.key]}</span>
                </label>
              ))}
            </span>
          ))}
          <label className="flex min-w-40 flex-1 items-center gap-1.5 rounded-md border border-rule bg-paper px-2 py-1 focus-within:border-ai">
            <Search size={13} className="shrink-0 text-ink-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="記録の中を探す（ひらがな可）" aria-label="記録の中を探す" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label="検索を消す" className="text-ink-faint hover:text-ink">
                <X size={13} />
              </button>
            )}
          </label>
        </div>
        {narrowed && (
          <p className="flex items-center gap-2 rounded bg-ai-soft px-2 py-1 text-[11px] text-ai">
            <b>
              {on.length !== ALL_CATS.length ? `${CATS.filter((c) => on.includes(c.key)).map((c) => c.label).join("・") || "なし"}` : ""}
              {key ? `「${q.trim()}」を含む` : ""}だけを表示中：{shown.length}件
            </b>
            <button
              type="button"
              onClick={() => {
                setOn(ALL_CATS);
                setQ("");
              }}
              className="ml-auto underline"
            >
              すべてに戻す
            </button>
          </p>
        )}
        {onDo && <p className="hint text-[10px] text-ink-faint">記載・オーダは右へドラッグすると写せます（Do）。記載はダブルクリックで修正、右クリックか「…」でメニュー。</p>}
      </div>
      <div ref={root} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pb-24">
        {days.map((d) => {
          const items = shown.filter((e) => e.day === d).sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
          // A day with nothing to show is left out (today stays, as the place for the day's records).
          if (items.length === 0 && d !== 0) return null;
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
              {items.length === 0 ? null : (
                <ol className="space-y-2">
                  {items.map((e, i) => (
                    <li key={`${d}-${i}`}>{e.kind === "note" ? <Note entry={e} today={today} onRevise={onReviseNote} onDo={onDo} /> : <OrderRow entry={e} today={today} onDo={onDo} onOpenImage={onOpenImage} onOpenResult={onOpenResult && resultAt(e) ? () => onOpenResult(resultAt(e)!) : undefined} takeBadge={takeBadgeOf?.(e.id) ?? null} />}</li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
        {narrowed && shown.length === 0 && <p className="py-6 text-center text-xs text-ink-faint">当てはまる記録はありません。</p>}
      </div>
    </div>
  );
}

/** A small menu at the pointer (right click) or under the 「…」 button (touch). Esc or a press outside closes it. */
function Menu({ at, onClose, items }: { at: { x: number; y: number }; onClose: () => void; items: { label: string; icon: typeof Copy; onClick: () => void; disabled?: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc);
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  const left = Math.min(at.x, (typeof window === "undefined" ? 1200 : window.innerWidth) - 230);
  const top = Math.min(at.y, (typeof window === "undefined" ? 800 : window.innerHeight) - 40 * items.length - 16);
  return createPortal(
    <div ref={ref} role="menu" style={{ position: "fixed", left, top, zIndex: 1000 }} className="w-56 rounded-lg border border-rule bg-sheet p-1 text-[13px] shadow-[0_12px_32px_-8px_rgba(38,34,28,0.4)]">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            disabled={!!it.disabled}
            title={it.disabled}
            onClick={() => {
              onClose();
              it.onClick();
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-paper disabled:text-ink-faint/60 pointer-coarse:py-2.5"
          >
            <Icon size={14} />
            {it.label}
            {it.disabled && <span className="ml-auto text-[10px]">—</span>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

/** One colour per profession: the chip with the role name, the left edge and a faint background of the note. */
export const ROLE_COLORS: Record<NoteEntry["role"], { text: string; chip: string; edge: string; bg: string }> = {
  医師: { text: "text-ai", chip: "bg-ai text-white", edge: "border-l-ai", bg: "bg-ai-soft/40" },
  看護師: { text: "text-wakatake", chip: "bg-wakatake text-white", edge: "border-l-wakatake", bg: "bg-wakatake-soft/50" },
  薬剤師: { text: "text-yamabuki", chip: "bg-yamabuki text-white", edge: "border-l-yamabuki", bg: "bg-yamabuki-soft/50" },
  臨床検査技師: { text: "text-fuji", chip: "bg-fuji text-white", edge: "border-l-fuji", bg: "bg-fuji-soft/50" },
  診療放射線技師: { text: "text-fuji", chip: "bg-fuji text-white", edge: "border-l-fuji", bg: "bg-fuji-soft/50" },
  療法士: { text: "text-wakatake", chip: "bg-wakatake text-white", edge: "border-l-wakatake", bg: "bg-wakatake-soft/50" },
  管理栄養士: { text: "text-kuri", chip: "bg-kuri text-white", edge: "border-l-kuri", bg: "bg-kuri-soft/60" },
  MSW: { text: "text-mizu", chip: "bg-mizu text-white", edge: "border-l-mizu", bg: "bg-mizu-soft/60" },
  医事課: { text: "text-ink-soft", chip: "bg-ink-soft text-white", edge: "border-l-ink-soft", bg: "bg-tab/60" },
  検査室: { text: "text-fuji", chip: "bg-fuji text-white", edge: "border-l-fuji", bg: "bg-fuji-soft/50" },
};

/** The chip colour of each note-writer checkbox (ほかの職種 takes the pharmacist's). */
const ROLE_CHIP: Record<string, string> = { doctor: ROLE_COLORS.医師.chip, nurse: ROLE_COLORS.看護師.chip, staff: "bg-ink-soft text-white" };

function Note({ entry, today, part = "全", onRevise, onDo }: { entry: NoteEntry; today: CalendarDate; part?: NotePart; onRevise?: (e: NoteEntry, text: string, reason: string) => void; onDo?: (p: DoPayload) => void }) {
  const me = useMe();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [reason, setReason] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const versions = versionsOf(entry);
  const last = versions.at(-1)!;
  // 記録時刻 (when it happened), 記載 (when it was written; later for a late note) and 更新 (the last correction).
  const times = noteTimes(entry);
  const mine = !!onRevise && canRevise(entry, me.name);
  const startEdit = () => {
    setDraft(noteText(entry));
    setReason("");
    setEditing(true);
  };
  const doPayload: DoPayload = { kind: "note", text: noteText(entry), label: `${entry.time} ${entry.author}` };
  return (
    <article
      draggable={!!onDo && !editing}
      onDragStart={onDo ? dragDo(doPayload) : undefined}
      onDoubleClick={() => (editing ? undefined : mine ? startEdit() : setShowHistory((v) => !v))}
      onContextMenu={(e) => {
        if (editing) return;
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      title={mine ? "ダブルクリックで修正、右クリックでメニュー" : "ダブルクリックで履歴、右クリックでメニュー"}
      className={`group rounded-r-md border-l-[3px] py-1 pl-2.5 pr-1 text-[13px] leading-relaxed ${ROLE_COLORS[entry.role].edge} ${ROLE_COLORS[entry.role].bg} ${onDo && !editing ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      {menu && (
        <Menu
          at={menu}
          onClose={() => setMenu(null)}
          items={[
            { label: "右の記事へ写す（Do）", icon: Copy, onClick: () => onDo?.(doPayload), disabled: onDo ? undefined : "写せません" },
            { label: "修正する", icon: PencilLine, onClick: startEdit, disabled: mine ? undefined : "自分が書いた記事だけ直せます" },
            { label: versions.length > 1 ? `修正の履歴を見る（第${versions.length}版まで）` : "修正の履歴を見る（修正なし）", icon: History, onClick: () => setShowHistory(true), disabled: versions.length > 1 ? undefined : "修正はありません" },
          ]}
        />
      )}
      <div className="nums mb-0.5 flex items-center gap-2 text-[11px] text-ink-faint">
        {onDo && <GripVertical size={11} className="-ml-1 text-ink-faint/60" aria-hidden />}
        <span className={`rounded px-1 font-bold leading-4 ${ROLE_COLORS[entry.role].chip}`}>{entry.role}</span>
        <span className="font-bold text-ink">{entry.author}</span>
        <CosignMark refId={entry.id} />
        <span className="text-ink-soft" title="出来事が起きた日時（記録時刻）">
          記録 {formatShort(addDays(today, times.event.day))} {times.event.time}
        </span>
        <span className={times.late ? "rounded border border-fuji/50 px-1 text-fuji" : "text-ink-faint"} title="この記事を書いた日時（記載時刻）。あとから変わりません。">
          記載 {formatShort(addDays(today, times.written.day))} {times.written.time}
          {times.late ? "（遅れて記載）" : ""}
        </span>
        {versions.length > 1 && (
          <button type="button" onClick={() => setShowHistory((v) => !v)} className="flex items-center gap-0.5 rounded border border-yamabuki/50 px-1 text-yamabuki" aria-expanded={showHistory}>
            <History size={11} />
            更新 {last.day === 0 ? "" : formatShort(addDays(today, last.day))}
            {last.time} {last.author}（第{versions.length}版）
          </button>
        )}
        {mine && !editing && (
          <button type="button" onClick={startEdit} className="ml-auto flex items-center gap-0.5 rounded px-1 text-ink-faint hover:bg-paper hover:text-ink" title="自分が書いた記事だけ直せます。前の版は残ります。">
            <PencilLine size={11} />
            修正
          </button>
        )}
        {!editing && (
          <button
            type="button"
            aria-label="記事のメニュー"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({ x: r.left, y: r.bottom + 4 });
            }}
            className={`${mine ? "" : "ml-auto"} rounded px-1 text-ink-faint opacity-60 hover:bg-paper hover:text-ink group-hover:opacity-100 pointer-coarse:px-2 pointer-coarse:opacity-100`}
          >
            <MoreHorizontal size={13} />
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
        <NoteBody n={entry} part={part} />
      )}
      {entry.figures && entry.figures.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2">
          {entry.figures.map((f, i) => (
            <figure key={i} className="w-40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.dataUrl} alt={f.caption} draggable={false} className="w-40 rounded border border-rule bg-white" />
              <figcaption className="text-[11px] text-ink-soft">{f.caption}</figcaption>
            </figure>
          ))}
        </div>
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

function NoteBody({ n, part = "全" }: { n: Pick<NoteEntry, "soap" | "text" | "focus" | "timeline">; part?: NotePart }) {
  if (n.focus?.length) {
    const rows = [
      ["d", "D"],
      ["act", "Act"],
      ["r", "R"],
    ] as const;
    return (
      <div className="space-y-1">
        {n.focus
          .filter((f) => part === "全" || (part === "#" ? !!f.title : !!f[rows.find((r) => r[1] === part)?.[0] ?? "d"]))
          .map((f, i) => (
            <div key={i}>
              <div className="font-bold text-wakatake"># {f.title || "（フォーカスなし）"}</div>
              {part !== "#" && (
                <dl className="grid grid-cols-[2.25rem_1fr] gap-y-0.5">
                  {rows.map(([k, label]) =>
                    f[k] && (part === "全" || part === label) ? (
                      <div key={k} className="contents">
                        <dt className="font-bold text-ink-faint">{label})</dt>
                        <dd className="whitespace-pre-wrap">{f[k]}</dd>
                      </div>
                    ) : null,
                  )}
                </dl>
              )}
            </div>
          ))}
      </div>
    );
  }
  if (n.timeline?.length) {
    return (
      <div>
        <div className="text-[11px] font-bold text-ink-faint">経時記録</div>
        <dl className="nums grid grid-cols-[3rem_1fr] gap-y-0.5 border-l-2 border-wakatake/40 pl-2">
          {n.timeline.map((x, i) => (
            <div key={i} className="contents">
              <dt className="font-bold text-ink-soft">{x.time || "—"}</dt>
              <dd className="whitespace-pre-wrap">{x.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  return n.soap ? (
    <dl className="grid grid-cols-[1.5rem_1fr] gap-y-0.5">
      {(["s", "o", "a", "p"] as const).map((k) =>
        n.soap?.[k] && (part === "全" || part === k.toUpperCase()) ? (
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

/** The items a lab order contains (a set's analytes, or the test itself), as abbreviations. */
function labItems(codes: string[]): string[] {
  return codes.flatMap((c) => {
    const t = LAB_TESTS.find((x) => x.code === c);
    if (!t) return [c];
    return t.contains && t.contains.length > 1 ? t.contains : [t.abbr ?? t.name];
  });
}

function OrderRow({ entry, today, onDo, onOpenImage, onOpenResult, takeBadge }: { entry: OrderEntry; today: CalendarDate; onDo?: (p: DoPayload) => void; onOpenImage?: (entryId: string) => void; onOpenResult?: () => void; takeBadge?: TakeBadge | null }) {
  const { main, detail } = orderLines(entry.order, today);
  const stopped = entry.status === "中止";
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const doPayload: DoPayload = { kind: "order", entryId: entry.id };
  const canDo = !!onDo && ["prescription", "injection", "lab"].includes(entry.order.type);
  return (
    <div
      draggable={canDo}
      onDragStart={canDo ? dragDo(doPayload) : undefined}
      onContextMenu={(e) => {
        if (!canDo) return;
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      title={canDo ? "右へドラッグするか右クリックで、同じオーダを写せます（Do）" : undefined}
      className={`group rounded-md border border-rule-soft bg-paper/60 px-2.5 py-1.5 text-[13px] ${stopped ? "opacity-60" : ""} ${canDo ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      {menu && <Menu at={menu} onClose={() => setMenu(null)} items={[{ label: "右へ写す（Do）", icon: Copy, onClick: () => onDo?.(doPayload) }]} />}
      <div className="nums flex items-center gap-2 text-[11px] text-ink-faint">
        {canDo && <GripVertical size={11} className="-ml-1 text-ink-faint/60" aria-hidden />}
        <span>{entry.time}</span>
        <span className="font-bold text-ink-soft">{ORDER_TYPE_LABEL[entry.order.type]}</span>
        <CosignMark refId={entry.id} />
        {takeBadge && <TakeBadgeMark badge={takeBadge} />}
        <span className={`ml-auto rounded border px-1 ${STATUS_STYLE[entry.status]}`}>
          {entry.status}
          {stopped && entry.stoppedOn === 0 ? "（今日）" : ""}
        </span>
        {canDo && (
          <button
            type="button"
            aria-label="オーダのメニュー"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({ x: r.left - 180, y: r.bottom + 4 });
            }}
            className="rounded px-1 opacity-60 hover:bg-sheet hover:text-ink group-hover:opacity-100 pointer-coarse:px-2 pointer-coarse:opacity-100"
          >
            <MoreHorizontal size={13} />
          </button>
        )}
      </div>
      <div className={`nums ${stopped ? "line-through" : ""}`}>{main}</div>
      <div className="nums text-xs text-ink-soft">{detail}</div>
      {entry.order.type === "imaging" && onOpenImage && !stopped && (
        <button type="button" onClick={() => onOpenImage(entry.id)} className="mt-1 rounded border border-ai/50 px-2 py-0.5 text-[11px] font-bold text-ai hover:bg-ai-soft pointer-coarse:py-1.5">
          画像を開く（PACS）
        </button>
      )}
      {entry.order.type === "lab" && onOpenResult && !stopped && (
        <button type="button" onClick={onOpenResult} className="mt-1 rounded border border-ai/50 px-2 py-0.5 text-[11px] font-bold text-ai hover:bg-ai-soft pointer-coarse:py-1.5">
          結果を表示
        </button>
      )}
      {entry.order.type === "lab" && (
        <ul aria-label="検査の内訳" className="nums mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-ink-soft">
          {labItems(entry.order.codes).map((x, i) => (
            <li key={`${x}-${i}`}>・{x}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
