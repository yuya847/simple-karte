"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, GripVertical, History, MoreHorizontal, PencilLine, Search, X } from "lucide-react";
import { searchKey } from "@/lib/kana";
import { LAB_TESTS } from "@/lib/master";
import { canRevise, diffLines, noteText, versionsOf } from "@/lib/notes";
import { useMe } from "./RoleContext";
import { CosignMark } from "./Cosign";
import { addDays, formatShort, hospitalDay, minutesOf, type CalendarDate } from "@/lib/dates";
import { ORDER_TYPE_LABEL, orderLines } from "@/lib/format";
import type { DayOffset, HistoryEntry, NoteEntry, OrderEntry, Patient } from "@/lib/types";
import { InjectionCalendar, PrescriptionCalendar, ProcedureCalendar } from "./Calendars";
import { FlowSheet } from "./FlowSheet";
import type { FlowIo } from "./IoFlowRows";
import { DietCalendar, type BookWhat, type MoveEvent } from "./DietCalendar";
import { BookingList } from "./BookingList";
import type { Booking } from "@/lib/bookings";
import type { DietOrder } from "@/lib/diet";
import type { CareOrder, CareRecord } from "@/lib/care-orders";

/** The ward's 実施・未実施 record of a dose (order id, minutes from today 00:00). */
type CalendarMar = (orderId: string, at: number) => { status: "実施" | "未実施"; by: string; doneAt: string; reason?: string } | undefined;

export type LeftView = "record" | "flowsheet" | "injection-cal" | "rx-cal" | "proc-cal" | "diet-cal" | "bookings";

export const LEFT_VIEWS: { key: LeftView; label: string; title?: string }[] = [
  { key: "record", label: "経過" },
  { key: "flowsheet", label: "経過表" },
  { key: "injection-cal", label: "注射", title: "注射カレンダー" },
  { key: "rx-cal", label: "内服", title: "内服カレンダー" },
  { key: "proc-cal", label: "処置", title: "処置カレンダー" },
  { key: "diet-cal", label: "移動・食事", title: "移動・食事カレンダー（日付を押すと転床・転棟・転科・退院を予約）" },
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
}

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
  const { patient, today, nowTime, selectedDay, onSelectDay, view, onView, showStopped, onToggleStopped, entries, onStopDraft, draftedStops, onReviseNote, onInsertVitals, onExtendDraft, onModify, pendingExtends, marOf, onDo, diets, onOpenDiet, onOpenImage, bookings, moves, onBook, onDoMove, care, io } = props;
  const calendarProps = { patient, entries, today, nowTime, selectedDay, onSelectDay, onStopDraft, draftedStops, onExtendDraft, onModify, pendingExtends, marOf };
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
        <FlowSheet patient={patient} entries={entries} today={today} nowTime={nowTime} selectedDay={selectedDay} onSelectDay={onSelectDay} onInsertVitals={onInsertVitals} care={care} io={io} />
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
      ) : (
        <RecordList patient={patient} entries={entries} today={today} selectedDay={selectedDay} showStopped={showStopped} onReviseNote={onReviseNote} onDo={onDo} onOpenImage={onOpenImage} />
      )}
    </section>
  );
}

/** Kinds of record to narrow the list to (one at a time), like the navigator of a ward chart. */
const KINDS: { key: string; label: string; test: (e: HistoryEntry) => boolean }[] = [
  { key: "all", label: "すべて", test: () => true },
  { key: "doctor", label: "医師の記載", test: (e) => e.kind === "note" && e.role === "医師" },
  { key: "nurse", label: "看護の記載", test: (e) => e.kind === "note" && e.role === "看護師" },
  { key: "staff", label: "ほかの職種", test: (e) => e.kind === "note" && e.role !== "医師" && e.role !== "看護師" },
  { key: "prescription", label: "内服", test: (e) => e.kind === "order" && e.order.type === "prescription" },
  { key: "injection", label: "注射", test: (e) => e.kind === "order" && e.order.type === "injection" },
  { key: "lab", label: "検体検査", test: (e) => e.kind === "order" && e.order.type === "lab" },
  { key: "exam", label: "画像・生理", test: (e) => e.kind === "order" && (e.order.type === "imaging" || e.order.type === "physio") },
  { key: "procedure", label: "処置・透析・輸血", test: (e) => e.kind === "order" && e.order.type === "procedure" },
];

const textOf = (e: HistoryEntry, today: CalendarDate) => (e.kind === "note" ? `${e.author} ${noteText(e)}` : `${orderLines(e.order, today).main} ${orderLines(e.order, today).detail} ${e.author}`);

function RecordList({
  patient,
  entries,
  today,
  selectedDay,
  showStopped,
  onReviseNote,
  onDo,
  onOpenImage,
}: {
  patient: Patient;
  entries: HistoryEntry[];
  today: CalendarDate;
  selectedDay: DayOffset | null;
  showStopped: boolean;
  onReviseNote?: (e: NoteEntry, text: string, reason: string) => void;
  onDo?: (p: DoPayload) => void;
  onOpenImage?: (entryId: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (selectedDay === null) return;
    root.current?.querySelector(`[data-day="${selectedDay}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedDay]);

  const days: DayOffset[] = [];
  for (let d = 0; d >= patient.admittedOn; d--) days.push(d);
  const visible = entries.filter((e) => showStopped || e.kind !== "order" || e.status !== "中止");
  const k = KINDS.find((x) => x.key === kind)!;
  const key = searchKey(q.trim());
  const shown = visible.filter((e) => k.test(e) && (!key || searchKey(textOf(e, today)).includes(key)));
  const narrowed = kind !== "all" || !!key;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-1.5 border-b border-rule-soft px-4 py-2">
        <div className="flex items-center gap-2">
          <label className="flex shrink-0 items-center gap-1 text-[12px] text-ink-soft">
            <span className="sr-only">記録の種類で絞る</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="記録の種類で絞る" className={`rounded-md border bg-paper px-1.5 py-1 text-[12px] ${kind !== "all" ? "border-ai font-bold text-ai" : "border-rule"}`}>
              {KINDS.map((x) => {
                const n = visible.filter(x.test).length;
                return (
                  <option key={x.key} value={x.key} disabled={x.key !== "all" && n === 0}>
                    {x.label}（{n}）
                  </option>
                );
              })}
            </select>
          </label>
          <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-rule bg-paper px-2 py-1 focus-within:border-ai">
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
              {kind !== "all" ? `「${k.label}」` : ""}
              {key ? `「${q.trim()}」を含む` : ""}だけを表示中：{shown.length}件
            </b>
            <button
              type="button"
              onClick={() => {
                setKind("all");
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
          if (narrowed && items.length === 0) return null;
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
                    <li key={`${d}-${i}`}>{e.kind === "note" ? <Note entry={e} today={today} onRevise={onReviseNote} onDo={onDo} /> : <OrderRow entry={e} today={today} onDo={onDo} onOpenImage={onOpenImage} />}</li>
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

function Note({ entry, today, onRevise, onDo }: { entry: NoteEntry; today: CalendarDate; onRevise?: (e: NoteEntry, text: string, reason: string) => void; onDo?: (p: DoPayload) => void }) {
  const me = useMe();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [reason, setReason] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const versions = versionsOf(entry);
  const last = versions.at(-1)!;
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
      className={`group text-[13px] leading-relaxed ${onDo && !editing ? "cursor-grab active:cursor-grabbing" : ""}`}
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
        <span>{entry.time}</span>
        <span className={`font-bold ${ROLE_STYLE[entry.role]}`}>{entry.role}</span>
        <span>{entry.author}</span>
        <CosignMark refId={entry.id} />
        {versions.length > 1 && (
          <button type="button" onClick={() => setShowHistory((v) => !v)} className="flex items-center gap-0.5 rounded border border-yamabuki/50 px-1 text-yamabuki" aria-expanded={showHistory}>
            <History size={11} />
            修正あり（第{versions.length}版 {last.day === 0 ? "" : formatShort(addDays(today, last.day))}
            {last.time} {last.author}）
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
        <NoteBody n={entry} />
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

/** The items a lab order contains (a set's analytes, or the test itself), as abbreviations. */
function labItems(codes: string[]): string[] {
  return codes.flatMap((c) => {
    const t = LAB_TESTS.find((x) => x.code === c);
    if (!t) return [c];
    return t.contains && t.contains.length > 1 ? t.contains : [t.abbr ?? t.name];
  });
}

function OrderRow({ entry, today, onDo, onOpenImage }: { entry: OrderEntry; today: CalendarDate; onDo?: (p: DoPayload) => void; onOpenImage?: (entryId: string) => void }) {
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
