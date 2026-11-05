"use client";
import { ConsultStatus } from "./ConsultContext";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { VerbalReview } from "./VerbalControls";
import { CalendarDays, ChevronDown, ChevronRight, Copy, Filter, GripVertical, History, MoreHorizontal, PencilLine, PictureInPicture2, Search, Stethoscope, X } from "lucide-react";
import { matchesTemplate, templateOptions } from "@/lib/record-filter";
import { BUILTIN_RECORD_TEMPLATES, loadMyRecordTemplates } from "@/lib/record-templates";
import { TemplateFilter } from "./TemplateFilter";
import { matchesRecordFacets, recordFacetOptions } from "@/lib/record";
import { searchKey } from "@/lib/kana";
import { LAB_TESTS, findSet } from "@/lib/master";
import { canRevise, diffLines, noteKey, noteText, noteTimes, versionsOf, type NotePart } from "@/lib/notes";
import { mergeTyping } from "@/lib/coedit";
import { mapCursor, merge3Text } from "@/lib/diff3";
import { coAuthors } from "@/lib/presence";
import type { Coedit } from "@/lib/use-presence";
import { LiveNote } from "./LiveNote";
import { NoteText } from "./NoteText";
import { useMe } from "./RoleContext";
import { CosignMark } from "./Cosign";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { groupRx, rxStartKey } from "@/lib/order-groups";
import { dayHeading, stayKindOf } from "@/lib/stay-labels";
import { ORDER_TYPE_LABEL, drugName, durationText, oralName, orderLines, scheduleTextFor, timingText } from "@/lib/format";
import { executionMarks, isAhead, planVerb, type PlanItem } from "@/lib/schedule-days";
import { aheadSummary, daySections, placeLabel, type DaySection, type OpdVisit } from "@/lib/opd-history";
import type { DayOffset, HistoryEntry, NoteEntry, OrderEntry, Patient } from "@/lib/types";
import type { TakeBadge } from "@/lib/order-confirm";
import type { PendingDraw } from "@/lib/lab-table";
import { TakeBadgeMark } from "./TakeConfirm";
import { OrderReportMark } from "./ReportMark";
import { InjectionCalendar, PrescriptionCalendar, type CalendarProps } from "./Calendars";
import { ExecuteMenu, type ExecuteProps, type MenuExtra } from "./ExecuteMenu";
import { abs } from "@/lib/flowsheet";
import { canHaveExecution, executionBadge, occurrenceStates, occurrencesOn } from "@/lib/order-execute";
import { useLongPress } from "@/lib/use-long-press";
import { FlowSheet } from "./FlowSheet";
import { ResultsPanel } from "./panels/ResultsPanel";
import type { RefWindowProps } from "./RefWindows";

export type LeftView = "record" | "flowsheet" | "rx-history" | "inj-history" | "results";

/** The tabs over the left pane. The calendars of 処置・移動・食事・指示簿 and the 予約 list are windows from the tools (参照). */
export const LEFT_VIEWS: { key: LeftView; label: string; title: string }[] = [
  { key: "record", label: "経過", title: "経過：記事とオーダを日付ごとに" },
  { key: "flowsheet", label: "経過表", title: "経過表（温度板）" },
  { key: "rx-history", label: "内服歴", title: "内服歴（内服カレンダー：処方の行ごとに、続く期間を帯で）" },
  { key: "inj-history", label: "注射歴", title: "注射歴（注射カレンダー：注射の行ごとに、投与の予定と実施を）" },
  { key: "results", label: "検査結果", title: "検査結果（時系列）：採血ごとの値を並べ、期間・並べ替え・グラフ・コピー・CSV・印刷" },
];
const asLeftView = (v: string | undefined): LeftView => (LEFT_VIEWS.some((x) => x.key === v) ? (v as LeftView) : "record");

/** What the other left tabs show: the same bundle as the reading windows, plus the injection calendar's 新規 and the results table. */
export type LeftViewProps = RefWindowProps & {
  onNewInjection?: CalendarProps["onNewInjection"];
  pendingNew?: CalendarProps["pendingNew"];
  results?: { pending?: PendingDraw[]; onExport?: (what: "CSV" | "コピー" | "印刷", n: number) => void; focusAt?: { day: number; time: string } };
};

interface Props {
  patient: Patient;
  entries: HistoryEntry[];
  today: CalendarDate;
  selectedDay: DayOffset | null;
  showStopped: boolean;
  onToggleStopped: () => void;
  /** Which left tab is shown (経過 when absent or unknown — an older saved value), and changing it. */
  view?: string;
  onView?: (v: LeftView) => void;
  /** 別ウインドウで開く on a tab: the same view in its own large window (the flow sheet and the calendars) or the results drawer. */
  onFloat?: (v: Exclude<LeftView, "record">) => void;
  /** What the other tabs show (the flow sheet, the calendars, the results table). */
  views?: LeftViewProps;
  /** A 記録 mark of the flow sheet: show that kind of note only (n renews the list each time). */
  focus?: { kind: string; n: number; noteId?: string };
  /** 外来の受診 before this admission (or an outpatient's past visits), shown under the stay with the clinic's mark. */
  visits?: OpdVisit[];
  /**
   * What the orders plan on each day (schedule-days.ts: 採取・撮影・開始・終了・受診 …). Each is listed under the day it
   * happens, apart from the order's card on the day it was written; the days ahead get their own sections.
   */
  planned?: PlanItem[];
  /** The clock now ("HH:MM"), to tell a plan still ahead (「採取予定」) from one past (「採取」). */
  nowTime?: string;
  /** Correct a confirmed note (a new version; the earlier ones are kept). `by` names the people who corrected it together. */
  onReviseNote?: (e: NoteEntry, text: string, reason: string, by?: string) => void;
  /** 記事の同時編集: who else is correcting which note, and telling them what this page types. */
  coedit?: Coedit;
  /** Do: copy a past note or order to the right (dragged there, or from the menu). */
  onDo?: (p: DoPayload) => void;
  /** Open an imaging order's pictures in the PACS viewer. */
  onOpenImage?: (entryId: string) => void;
  /** 検体検査: open the results table at this draw (day and time of the collection). */
  onOpenResult?: (at: { day: DayOffset; time: string }) => void;
  /** The records left after the filter and the search (null when nothing is narrowed), for the date tree. */
  onShown?: (entries: HistoryEntry[] | null) => void;
  /** 指示受けの状態 of an order (未指示受け／受け ◯◯ hh:mm／確認済み／医師に確認中), shown on each order; null when nothing waits. */
  takeBadgeOf?: (entryId: string) => TakeBadge | null;
  /** 実施・未実施 from an order row (right click, ⋯, long press) and the calendars' dose cells. Absent: no such menu. */
  execute?: ExecuteProps;
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

/**
 * Left pane: what to read while writing on the right — 経過 (the record), 経過表, 内服歴, 注射歴 and 検査結果
 * (時系列). Each of the last four can also be opened in its own window (the ⧉ button on the tab). The
 * calendars of 処置・移動・食事・指示簿 and the 予約 list open from the tools on the far right (参照).
 */
export function HistoryPane(props: Props) {
  const { patient, today, selectedDay, showStopped, onToggleStopped, entries, visits, planned, nowTime, focus, onView, onFloat, views, onReviseNote, coedit, onDo, onOpenImage, onOpenResult, takeBadgeOf, execute, onShown } = props;
  const view = asLeftView(props.view);
  const v = views;
  const calendarProps: CalendarProps | null = v ? { patient, entries, today, nowTime: v.nowTime, selectedDay, onSelectDay: v.onSelectDay, onStopDraft: v.onStopDraft, draftedStops: v.draftedStops, onExtendDraft: v.onExtendDraft, onModify: v.onModify, pendingExtends: v.pendingExtends, marOf: v.marOf, onNewInjection: v.onNewInjection, pendingNew: v.pendingNew, execute } : null;
  return (
    <section aria-label="経過" className="flex min-h-0 flex-col border-r border-rule bg-sheet">
      <div className="flex flex-nowrap items-center gap-x-3 border-b border-rule-soft px-4 py-1.5">
        <div role="tablist" aria-label="左の表示" className="scroll-thin flex min-w-0 max-w-full shrink overflow-x-auto rounded-md border border-rule p-0.5 text-sm">
          {LEFT_VIEWS.map(({ key: k, label, title }) => (
            <button
              key={k}
              type="button"
              role="tab"
              title={title}
              aria-selected={view === k}
              onClick={() => onView?.(k)}
              className={`whitespace-nowrap rounded px-2.5 py-0.5 ${view === k ? "bg-ink font-bold text-white" : "text-ink-soft hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {view === "record" ? (
          <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-ink-faint">
            <input type="checkbox" checked={showStopped} onChange={onToggleStopped} className="accent-ai" />
            中止したオーダも表示
          </label>
        ) : (
          onFloat && (
            <button type="button" onClick={() => onFloat(view)} title={view === "results" ? "検査結果を右の引き出しで開く（引き出しは別ウインドウにもできます）" : "別ウインドウで開く（大きなウインドウ。動かせて、左の欄と並べて見られます）"} className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-rule px-1.5 py-0.5 text-[11px] text-ink-soft hover:border-ai hover:text-ink pointer-coarse:py-1.5">
              <PictureInPicture2 size={13} />
              別ウインドウで開く
            </button>
          )
        )}
      </div>
      {view === "flowsheet" && v ? (
        <FlowSheet patient={patient} entries={entries} today={today} nowTime={v.nowTime} selectedDay={selectedDay} onSelectDay={v.onSelectDay} onInsertVitals={v.onInsertVitals} care={v.care} io={v.io} diets={v.diets} moves={v.moves} dayInfo={v.flowDays} {...v.flow} />
      ) : view === "rx-history" && calendarProps ? (
        <PrescriptionCalendar {...calendarProps} />
      ) : view === "inj-history" && calendarProps ? (
        <InjectionCalendar {...calendarProps} />
      ) : view === "results" ? (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <ResultsPanel patient={patient} today={today} pending={v?.results?.pending} onExport={v?.results?.onExport} focusAt={v?.results?.focusAt} />
        </div>
      ) : (
        <RecordList key={focus?.n ?? 0} kindInit={focus?.kind ?? "all"} noteId={focus?.noteId} patient={patient} entries={entries} visits={visits} planned={planned} nowTime={nowTime} today={today} selectedDay={selectedDay} showStopped={showStopped} onReviseNote={onReviseNote} coedit={coedit} onDo={onDo} onOpenImage={onOpenImage} onOpenResult={onOpenResult} takeBadgeOf={takeBadgeOf} execute={execute} onShown={onShown} />
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
  { key: "procedure", group: "order", label: "処置・透析・輸血", test: (e) => e.kind === "order" && e.order.type === "procedure" && !e.order.opd },
  { key: "opd", group: "order", label: "外来予約", test: (e) => e.kind === "order" && e.order.type === "procedure" && !!e.order.opd },
];
const ALL_CATS = CATS.map((c) => c.key);
/** The categories a quick choice stands for (記載だけ・オーダだけ), or an old single-kind key. */
const catsFor = (key: string): string[] => (key === "notes" ? CATS.filter((c) => c.group === "note").map((c) => c.key) : key === "orders" ? CATS.filter((c) => c.group === "order").map((c) => c.key) : CATS.some((c) => c.key === key) ? [key] : ALL_CATS);

const textOf = (e: HistoryEntry, today: CalendarDate) => (e.kind === "note" ? `${e.author} ${noteText(e)}` : `${orderLines(e.order, today).main} ${orderLines(e.order, today).detail} ${e.author}`);

function RecordList({
  kindInit = "all",
  noteId,
  patient,
  entries,
  visits = [],
  planned = [],
  nowTime,
  today,
  selectedDay,
  showStopped,
  onReviseNote,
  coedit,
  onDo,
  onOpenImage,
  onOpenResult,
  takeBadgeOf,
  execute,
  onShown,
}: {
  kindInit?: string;
  noteId?: string;
  patient: Patient;
  entries: HistoryEntry[];
  visits?: OpdVisit[];
  planned?: PlanItem[];
  nowTime?: string;
  today: CalendarDate;
  selectedDay: DayOffset | null;
  showStopped: boolean;
  onReviseNote?: (e: NoteEntry, text: string, reason: string, by?: string) => void;
  coedit?: Coedit;
  onDo?: (p: DoPayload) => void;
  onOpenImage?: (entryId: string) => void;
  onOpenResult?: (at: { day: DayOffset; time: string }) => void;
  takeBadgeOf?: Props["takeBadgeOf"];
  onShown?: Props["onShown"];
  execute?: ExecuteProps;
}) {
  const root = useRef<HTMLDivElement>(null);
  // A draw's result is filed under the collection time (the same as the printed label).
  const resultAt = (e: HistoryEntry) => {
    if (e.kind !== "order" || e.order.type !== "lab") return null;
    const c = e.order.collect;
    return patient.labs.some((l) => l.day === c.day && l.time === c.time) ? { day: c.day, time: c.time } : null;
  };
  const me = useMe();
  const templates = [...BUILTIN_RECORD_TEMPLATES, ...loadMyRecordTemplates(me.name)];
  const [templateIds, setTemplateIds] = useState<string[]>([]);
  const [onlyTemplates, setOnlyTemplates] = useState(false);
  const templateActive = onlyTemplates || templateIds.length > 0;
  const [on, setOn] = useState<string[]>(() => catsFor(kindInit));
  const [departments, setDepartments] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const options = recordFacetOptions([
    ...entries.map((entry) => ({ entry, department: patient.department })),
    ...visits.flatMap((v) => v.entries.map((entry) => ({ entry, department: v.dept }))),
  ]);
  const facetActive = departments.length > 0 || roles.length > 0;
  const [q, setQ] = useState("");
  const toggle = (k: string) => setOn((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  // Folding: each card by its key, and 「すべてたたむ」 for the ones not opened by hand since.
  const [folded, setFolded] = useState<{ all: boolean; each: Record<string, boolean> }>({ all: false, each: noteId ? { [noteId]: false } : {} });
  // 絞り込みと検索はふだん畳んである（アイコンで開く）。
  const [tools, setTools] = useState<"none" | "filter" | "search">("none");
  // 記録は全部開いた状態が基本。長い記事（12行か600字を超える）だけは畳んでおき、▸ で個別に開く（ユーザーの決め）。
  const isLong = (e: HistoryEntry) => {
    if (e.kind !== "note") return false;
    const t = noteText(e);
    return t.length > 600 || t.split("\n").length > 12;
  };
  const isFolded = (k: string, e: HistoryEntry) => folded.each[k] ?? (folded.all || isLong(e));
  const fold = (k: string, e: HistoryEntry) => setFolded((f) => ({ ...f, each: { ...f.each, [k]: !isFolded(k, e) } }));
  const nowAbs = nowTime ? abs(0, nowTime) : null;

  // The days ahead (予定) are one folded line above today, so today's section is always the first seen; they open
  // when a day of them is chosen in the date tree (or at the start, when such a day is already chosen).
  const [aheadOpen, setAheadOpen] = useState(() => selectedDay !== null && selectedDay > 0);
  const [seenDay, setSeenDay] = useState(selectedDay);
  if (selectedDay !== seenDay) {
    setSeenDay(selectedDay);
    if (selectedDay !== null && selectedDay > 0 && !aheadOpen) setAheadOpen(true);
  }
  // Scroll to the chosen day once it is in the DOM (a day ahead gets there only after the fold opens).
  const scrolledFor = useRef<DayOffset | null>(null);
  useEffect(() => {
    if (selectedDay === null || scrolledFor.current === selectedDay) return;
    const el = root.current?.querySelector(`[data-day="${selectedDay}"]`);
    if (!el) return;
    scrolledFor.current = selectedDay;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedDay, aheadOpen]);
  useEffect(() => {
    if (!noteId) return;
    const card = [...(root.current?.querySelectorAll<HTMLElement>("[data-note-key]") ?? [])].find((el) => el.dataset.noteKey === noteId);
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [noteId]);
  // 「依頼 11/4」 on a plan: open the order's card (on the day it was written) and scroll to it.
  const jumpToOrder = (id: string) => {
    const group = sections.flatMap((s) => groupRx(s.entries)).find((g) => g.some((e) => e.kind === "order" && e.id === id));
    const first = group?.[0];
    const cardId = first?.kind === "order" ? first.id : id;
    setFolded((f) => ({ ...f, each: { ...f.each, [cardId]: false } }));
    requestAnimationFrame(() => {
      const card = [...(root.current?.querySelectorAll<HTMLElement>("[data-order-id]") ?? [])].find((el) => el.dataset.orderId === id);
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const keep = (e: HistoryEntry) => showStopped || e.kind !== "order" || e.status !== "中止";
  const key = searchKey(q.trim());
  const pick = (e: HistoryEntry, department = patient.department) => matchesTemplate(e, templates, templateIds, onlyTemplates) && matchesRecordFacets(e, department, departments, roles) && CATS.some((c) => on.includes(c.key) && c.test(e)) && (!key || searchKey(textOf(e, today)).includes(key));
  const visible = [...entries, ...visits.flatMap((v) => v.entries)].filter(keep);
  const shown = entries.filter(keep).filter((e) => pick(e));
  const narrowed = on.length !== ALL_CATS.length || !!key || facetActive || templateActive;
  // The filters apply to the visits before the admission as they do to the stay, and to the plans (through their
  // order; an operation of the OR list has no order and stays).
  const shownIds = new Set(shown.filter((e) => e.kind === "order").map((e) => e.id));
  const keepPlan = (p: PlanItem) => (!templateActive && p.orderedOn === null) || shownIds.has(p.orderId);
  const sections = daySections(
    patient.admittedOn,
    shown,
    visits.map((v) => ({ ...v, entries: v.entries.filter(keep).filter((e) => pick(e, v.dept)) })),
    planned,
    narrowed,
    keepPlan,
  );
  const shownCount = sections.reduce((n, s) => n + s.entries.length + s.plans.length, 0);
  const ahead = aheadSummary(sections, today);
  // Tell the date tree which records are left (only while narrowed), so days with nothing are not listed.
  const shownKey = narrowed ? shown.map((e) => `${e.kind}:${e.day}:${e.time}:${e.kind === "order" ? e.id : e.author}`).join("|") : "";
  useEffect(() => {
    onShown?.(narrowed ? shown : null);
    // `shownKey` stands for `shown`/`narrowed`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);
  const counts = Object.fromEntries(CATS.map((c) => [c.key, visible.filter(c.test).length]));
  const allOf = (g: "note" | "order") => CATS.filter((c) => c.group === g).every((c) => on.includes(c.key));
  const onlyOf = (g: "note" | "order") => allOf(g) && CATS.filter((c) => c.group !== g).every((c) => !on.includes(c.key));
  // 科・場所 of the stay's records: the ward (or the clinic, for a visit opened in the chart).
  const herePlace = `${patient.department} ${patient.ward === "外来" || patient.ward === "救急外来" ? patient.ward : "病棟"}`;
  // Rp numbers of a day's prescriptions (drugs ordered together share an Rp).
  const rpNoOf = (items: HistoryEntry[]) => {
    const rps: string[] = [];
    const out = new Map<string, number>();
    for (const e of items) {
      if (e.kind !== "order" || e.order.type !== "prescription") continue;
      const rp = e.order.rp ?? e.id;
      if (!rps.includes(rp)) rps.push(rp);
      out.set(e.id, rps.indexOf(rp) + 1);
    }
    return out;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-1.5 border-b border-rule-soft px-4 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          <span role="group" aria-label="絞り込みと検索" className="flex items-center gap-1">
            <button type="button" onClick={() => setTools((t) => (t === "filter" ? "none" : "filter"))} aria-pressed={tools === "filter"} aria-label="絞り込み" title="種類・診療科・部署（職種）で絞る" className={`relative rounded p-1 ${tools === "filter" ? "bg-ink text-white" : "text-ink-soft hover:bg-paper hover:text-ink"}`}>
              <Filter size={14} />
              {(on.length !== ALL_CATS.length || facetActive || templateActive) && <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-shu" />}
            </button>
            <button type="button" onClick={() => setTools((t) => (t === "search" ? "none" : "search"))} aria-pressed={tools === "search"} aria-label="記録の中を探す" title="記録の中を探す（ひらがな可）" className={`relative rounded p-1 ${tools === "search" ? "bg-ink text-white" : "text-ink-soft hover:bg-paper hover:text-ink"}`}>
              <Search size={14} />
              {key && <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-shu" />}
            </button>
          </span>
          {tools === "filter" && (
          <span role="group" aria-label="早く絞る" className="flex rounded-md border border-rule p-0.5">
            {([
              ["all", "すべて", on.length === ALL_CATS.length && !templateActive],
              ["notes", "記載だけ", onlyOf("note") && !templateActive],
              ["orders", "オーダだけ", onlyOf("order") && !templateActive],
              ["templates", "テンプレートの記事", onlyTemplates && templateIds.length === 0],
            ] as const).map(([k, label, active]) => (
              <button key={k} type="button" aria-pressed={active} onClick={() => { setOn(catsFor(k)); setTemplateIds([]); setOnlyTemplates(k === "templates"); }} className={`rounded px-2 py-0.5 ${active ? "bg-ink font-bold text-white" : "text-ink-soft hover:text-ink"}`}>
                {label}
              </button>
            ))}
          </span>
          )}
          {tools === "filter" && (["note", "order"] as const).map((g) => (
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
          {tools === "filter" && <TemplateFilter options={templateOptions(visible, templates)} selected={templateIds} onChange={setTemplateIds} />}
          {tools === "filter" && ([
            { label: "診療科", values: options.departments, selected: departments, set: setDepartments },
            { label: "部署（職種）", values: options.roles, selected: roles, set: setRoles },
          ]).map(({ label, values, selected, set }) => (
            <span key={label} role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
              <span className="text-ink-faint">{label}</span>
              {values.map((value) => <label key={value} className="flex cursor-pointer items-center gap-0.5">
                <input type="checkbox" checked={selected.includes(value)} className="accent-ai" onChange={() => set((cur) => cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value])} />{value}
              </label>)}
            </span>
          ))}
          {tools === "search" && (
          <label className="flex min-w-40 flex-1 items-center gap-1.5 rounded-md border border-rule bg-paper px-2 py-1 focus-within:border-ai">
            <Search size={13} className="shrink-0 text-ink-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="記録の中を探す（ひらがな可）" aria-label="記録の中を探す" autoFocus className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label="検索を消す" className="text-ink-faint hover:text-ink">
                <X size={13} />
              </button>
            )}
          </label>
          )}
        </div>
        {narrowed && (
          <p className="flex items-center gap-2 rounded bg-ai-soft px-2 py-1 text-[11px] text-ai">
            <b>
              {on.length !== ALL_CATS.length ? `${CATS.filter((c) => on.includes(c.key)).map((c) => c.label).join("・") || "なし"}` : ""}
              {templateActive ? (templateIds.length ? templateOptions(visible, templates).filter((t) => templateIds.includes(t.id)).map((t) => t.name).join("・") : "テンプレートの記事") : ""}
              {[...departments, ...roles].join("・")}{key ? `「${q.trim()}」を含む` : ""}だけを表示中：{shownCount}件
            </b>
            <button
              type="button"
              onClick={() => {
                setOn(ALL_CATS);
                setQ("");
                setDepartments([]);
                setRoles([]);
                setTemplateIds([]);
                setOnlyTemplates(false);
              }}
              className="ml-auto underline"
            >
              すべてに戻す
            </button>
          </p>
        )}
        {onDo && <p className="hint text-[10px] text-ink-faint">記載・オーダは右へドラッグすると写せます（Do）。記載はダブルクリックで修正、右クリックか「…」でメニュー。見出しの ▸ で記録をたたみます。入院前の外来の受診は、入院の記録の下に科と医師の印つきで続きます。</p>}
        <p className="hint text-[10px] text-ink-faint">オーダは依頼した日のカードに出し、採取・撮影・開始・受診など実施の日が別なら見出しに「採取予定 11/11（水）」のように添えます。実施の日の節にも「その日の予定」として薄く並び、「依頼 11/4」を押すと依頼日のカードへ移ります。今日より先に予定のある日は、上の「予定 N日」の1行に畳んであり（▸ で開く）、左の日付ツリーの「予定」からも開けます。退院時処方は自宅で飲むものなので予定に出しません。</p>
      </div>
      <div ref={root} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pb-24">
        {ahead.days.length > 0 && (
          <div data-ahead className="border-b border-rule-soft py-1.5">
            <button type="button" onClick={() => setAheadOpen((o) => !o)} aria-expanded={aheadOpen} className="nums flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-[12px] text-mizu hover:bg-sheet">
              {aheadOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <CalendarDays size={12} />
              <span className="font-bold">{ahead.heading}</span>
            </button>
            {aheadOpen && ahead.days.map(renderSection)}
          </div>
        )}
        {sections.filter((s) => !s.future).map(renderSection)}
        {narrowed && shownCount === 0 && <p className="py-6 text-center text-xs text-ink-faint">当てはまる記録はありません。</p>}
      </div>
    </div>
  );

  /** One day of the record: the heading (date, hospital day, a clinic's or 予定's mark), the plans on it, then its cards. */
  function renderSection(s: DaySection) {
    const d = s.day;
    const place = s.place ? `${s.place.dept} 外来` : herePlace;
    const rpNo = rpNoOf(s.entries);
    return (
      <div
        key={`${s.place ? "v" : "d"}${d}`}
        data-day={d}
        data-place={s.place ? "opd" : undefined}
        data-future={s.future || undefined}
        className={`scroll-mt-2 border-b border-rule-soft ${s.future ? "py-2" : "py-3"} ${selectedDay === d ? "rounded-md bg-ai-soft/50 ring-1 ring-ai/30 -mx-2 px-2" : ""}`}
      >
        <h3 className={`nums flex flex-wrap items-baseline gap-2 text-sm ${s.future ? "mb-1" : "mb-2"}`}>
          {s.place && (
            <span className={`flex items-center gap-1 rounded px-1.5 text-[11px] font-bold leading-5 ${PLACE_COLORS.opd.chip}`}>
              <Stethoscope size={11} />
              {placeLabel(s.place)}
            </span>
          )}
          {s.future && (
            <span className="flex items-center gap-1 rounded border border-mizu/60 px-1.5 text-[11px] font-bold leading-5 text-mizu">
              <CalendarDays size={11} />
              予定
            </span>
          )}
          <span className={`font-bold ${s.future ? "text-ink-soft" : ""}`}>{formatShort(addDays(today, d))}</span>
          <span className="text-xs text-ink-faint">{dayHeading(stayKindOf(patient), patient.admittedOn, d, { earlier: !!s.place, future: !!s.future })}</span>
        </h3>
        {s.plans.length > 0 && <PlanList day={d} plans={s.plans} today={today} nowAbs={nowAbs} onJump={jumpToOrder} />}
        {s.entries.length === 0 ? null : (
          <ol className="space-y-2">
            {groupRx(s.entries).map((group, i) => {
              const e = group[0];
              const k = e.kind === "note" ? noteKey(e) : e.id;
              return (
                <li key={`${d}-${i}`} data-note-key={e.kind === "note" ? k : undefined}>
                  {e.kind === "note" ? (
                    <Note entry={e} patientId={patient.id} today={today} place={place} folded={isFolded(k, e)} onFold={() => fold(k, e)} onRevise={onReviseNote} coedit={coedit} onDo={onDo} />
                  ) : group.length > 1 ? (
                    <RxCard entries={group as OrderEntry[]} today={today} now={nowAbs} place={place} rpNo={rpNo} folded={isFolded(k, e)} onFold={() => fold(k, e)} onDo={onDo} takeBadgeOf={takeBadgeOf} patient={patient} execute={execute} />
                  ) : (
                    <OrderRow entry={e} today={today} now={nowAbs} place={place} rpNo={rpNo.get(e.id)} folded={isFolded(k, e)} onFold={() => fold(k, e)} onDo={onDo} onOpenImage={onOpenImage} onOpenResult={onOpenResult && resultAt(e) ? () => onOpenResult(resultAt(e)!) : undefined} takeBadge={takeBadgeOf?.(e.id) ?? null} patient={patient} execute={execute} />
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    );
  }
}

/** The colour of a place other than this ward: a visit to the outpatient clinic (mizu, apart from the professions' colours). */
export const PLACE_COLORS = {
  opd: { chip: "bg-mizu text-white", edge: "border-l-mizu", bg: "bg-mizu-soft/40", text: "text-mizu" },
};

/**
 * What is planned on a day by orders written on another day (and the operations booked): a faint list under the
 * day's heading — the time, the kind, 採取予定／採取 and the order's line, with 「依頼 11/4」 to go to the order's card.
 */
function PlanList({ day, plans, today, nowAbs, onJump }: { day: DayOffset; plans: PlanItem[]; today: CalendarDate; nowAbs: number | null; onJump: (orderId: string) => void }) {
  const title = day === 0 ? "今日の予定" : `${formatShort(addDays(today, day))}の予定`;
  return (
    <ul aria-label={title} className="nums mb-2 space-y-0.5 rounded-md border border-dashed border-mizu/50 bg-mizu-soft/40 px-2.5 py-1.5 text-[12px]">
      <li className="text-[10px] font-bold text-mizu">
        {title}
        <span className="ml-1 font-normal text-ink-faint">（別の日に依頼したオーダ）</span>
      </li>
      {plans.map((p, i) => {
        const ahead = isAhead(p, nowAbs);
        return (
          <li key={`${p.orderId}-${p.verb}-${i}`} data-plan-kind={p.kind} className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${ahead ? "" : "opacity-60"}`}>
            <span className="w-12 shrink-0 font-bold">{p.time ?? "時刻未定"}</span>
            <span className="shrink-0 rounded bg-sheet px-1 text-[10px] text-ink-soft">{p.kind}</span>
            <span className={`shrink-0 text-[11px] font-bold ${ahead ? "text-mizu" : "text-ink-faint"}`}>{planVerb(p, nowAbs)}</span>
            <span className="min-w-0 flex-1 truncate" title={p.label}>
              {p.label}
            </span>
            {p.orderedOn !== null ? (
              <button type="button" onClick={() => onJump(p.orderId)} title="依頼した日のカードへ" className="shrink-0 rounded border border-rule px-1 text-[10px] text-ink-soft hover:border-ai hover:text-ai pointer-coarse:py-1">
                依頼 {formatShort(addDays(today, p.orderedOn))}
              </button>
            ) : (
              <span className="shrink-0 text-[10px] text-ink-faint">手術の予定表から</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One record as a card: the heading row (【種類】 date and time in bold, the department and place small on the
 * right, ▸ to fold), a faint line with the version, the times and the writer, then the body.
 */
function Card({ mark, when, place, tone, meta, folded, onFold, children, dragHandle, article, tag, row = false }: { row?: boolean; mark: string; when: string; place: string; tone: { chip: string; edge: string; bg: string }; meta: React.ReactNode; folded: boolean; onFold: () => void; children: React.ReactNode; dragHandle?: boolean; article?: React.HTMLAttributes<HTMLElement> & { draggable?: boolean; "data-order-id"?: string }; tag?: React.ReactNode }) {
  if (row) return (
    <div {...article} className={`border-t border-rule-soft py-1 ${article?.className ?? ""}`}>
      <div className="nums flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">{meta}{tag}</div>
      {children}
    </div>
  );
  return (
    <article {...article} data-folded={folded || undefined} className={`group rounded-md border border-rule-soft border-l-[3px] bg-sheet text-[13px] leading-relaxed ${tone.edge} ${article?.className ?? ""}`}>
      <div className={`flex items-center gap-1.5 rounded-tr-md px-2 py-1 ${tone.bg}`}>
        <button type="button" onClick={onFold} aria-expanded={!folded} aria-label={folded ? `${mark}を開く` : `${mark}をたたむ`} className="rounded p-0.5 text-ink-faint hover:bg-sheet hover:text-ink">
          {folded ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        {dragHandle && <GripVertical size={11} className="text-ink-faint/60" aria-hidden />}
        <span className="nums truncate text-[13px] font-bold">
          【{mark}】 {when}
        </span>
        {tag}
        <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] text-ink-faint">{place}</span>
      </div>
      <div className="nums flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2.5 py-0.5 text-[11px] text-ink-faint">{meta}</div>
      {!folded && <div className="px-2.5 pb-1.5 pt-0.5">{children}</div>}
    </article>
  );
}

/** "11/4（水） 10:00" */
const whenText = (today: CalendarDate, day: DayOffset, time?: string) => `${formatShort(addDays(today, day))}${time ? ` ${time}` : ""}`;

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
  デバッグ: { text: "text-yamabuki", chip: "bg-yamabuki text-white", edge: "border-l-yamabuki", bg: "bg-yamabuki-soft/50" },
};

/** The chip colour of each note-writer checkbox (ほかの職種 takes the pharmacist's). */
const ROLE_CHIP: Record<string, string> = { doctor: ROLE_COLORS.医師.chip, nurse: ROLE_COLORS.看護師.chip, staff: "bg-ink-soft text-white" };

const chipOf = (role: string) => ROLE_COLORS[role as NoteEntry["role"]]?.chip ?? "bg-ink-soft text-white";

function Note({ entry, patientId, today, place, folded, onFold, part = "全", onRevise, coedit, onDo }: { entry: NoteEntry; patientId?: string; today: CalendarDate; place: string; folded: boolean; onFold: () => void; part?: NotePart; onRevise?: (e: NoteEntry, text: string, reason: string, by?: string) => void; coedit?: Coedit; onDo?: (p: DoPayload) => void }) {
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
  // 同時編集: the others correcting this note now, with their text; the base all of them started from.
  const key = noteKey(entry);
  const others = coedit?.editors(key) ?? [];
  const othersSig = others.map((o) => `${o.tab}\u0001${o.cursor}\u0001${o.text}`).join("\u0002");
  const base = noteText(entry);
  const baseRef = useRef(base);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);
  const label = `${entry.time} の記事`;
  const startEdit = () => {
    setDraft(others.length ? mergeTyping(base, others) : base);
    setReason("");
    setEditing(true);
  };
  const stopEdit = () => {
    setEditing(false);
    coedit?.done(key);
  };
  // The latest of these for the effects below (the coedit object is made anew on each render of the chart).
  const live = useRef({ coedit, editing });
  useEffect(() => {
    live.current = { coedit, editing };
  });
  // Tell the others what is typed here (a third of a second after the last keystroke, and every 5 seconds).
  useEffect(() => {
    if (!editing || !coedit || !patientId) return;
    const send = () => live.current.coedit?.typing({ patient: patientId, note: key, label, text: draft, cursor: textarea.current?.selectionStart ?? draft.length });
    const t = setTimeout(send, 300);
    const tick = setInterval(send, 5000);
    return () => {
      clearTimeout(t);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, draft, !!coedit, key, label, patientId]);
  // Closing the chart while editing ends the edit for the others too.
  useEffect(() => () => void (live.current.editing && live.current.coedit?.done(key)), [key]);
  // Someone else typed in the same note: merge their text into this draft (both keep typing), the caret following.
  useEffect(() => {
    if (!editing || !others.length || !coedit) return;
    const merged = mergeTyping(base, [{ tab: coedit.myTab, text: draft }, ...others]);
    if (merged === draft) return;
    // Right after the message arrived (not in the same render), the draft takes the merged text.
    const t = setTimeout(() => {
      caret.current = mapCursor(draft, merged, textarea.current?.selectionStart ?? draft.length);
      setDraft(merged);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [othersSig, editing]);
  // The note got a new version (someone confirmed) while this page is editing: go on from the new text.
  useEffect(() => {
    if (baseRef.current !== base) {
      if (editing) setDraft((d) => merge3Text(baseRef.current, d, base).text);
      baseRef.current = base;
    }
  }, [base, editing]);
  useEffect(() => {
    if (caret.current === null || !textarea.current) return;
    textarea.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [draft]);
  const doPayload: DoPayload = { kind: "note", text: noteText(entry), label: `${entry.time} ${entry.author}` };
  const tone = ROLE_COLORS[entry.role];
  const article = {
    draggable: !!onDo && !editing,
    onDragStart: onDo ? dragDo(doPayload) : undefined,
    onDoubleClick: () => (editing ? undefined : mine ? startEdit() : setShowHistory((v) => !v)),
    onContextMenu: (e: React.MouseEvent) => {
      if (editing) return;
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY });
    },
    title: mine ? "ダブルクリックで修正、右クリックでメニュー" : "ダブルクリックで履歴、右クリックでメニュー",
    className: onDo && !editing ? "cursor-grab active:cursor-grabbing" : "",
  };
  return (
    <Card
      mark={entry.category ?? entry.templateName ?? "記事"}
      when={whenText(today, times.event.day, times.event.time)}
      place={place}
      tone={tone}
      folded={folded && !editing}
      onFold={onFold}
      dragHandle={!!onDo}
      article={article}
      meta={
        <>
          {menu && (
            <Menu
              at={menu}
              onClose={() => setMenu(null)}
              items={[
                { label: "右の記事へ写す（Do）", icon: Copy, onClick: () => onDo?.(doPayload), disabled: onDo ? undefined : "写せません" },
                { label: "修正する", icon: PencilLine, onClick: startEdit, disabled: mine ? undefined : "検査室の記事は直せません" },
                { label: versions.length > 1 ? `修正の履歴を見る（第${versions.length}版まで）` : "修正の履歴を見る（修正なし）", icon: History, onClick: () => setShowHistory(true), disabled: versions.length > 1 ? undefined : "修正はありません" },
              ]}
            />
          )}
          <span>第{versions.length}版：</span>
          <span className="text-ink-soft" title="出来事が起きた日時（記録時刻）">
            記録 {formatShort(addDays(today, times.event.day))} {times.event.time}
          </span>
          <span className={times.late ? "rounded border border-fuji/50 px-1 text-fuji" : ""} title="この記事を書いた日時（記載時刻）。あとから変わりません。">
            記載 {formatShort(addDays(today, times.written.day))} {times.written.time}
            {times.late ? "（遅れて記載）" : ""}
          </span>
          <span className={`rounded px-1 font-bold leading-4 ${tone.chip}`}>{entry.role}</span>
          <span className="font-bold text-ink">{entry.author}</span>
          <CosignMark refId={entry.id} />
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
        </>
      }
    >
      {editing ? (
        <div className="space-y-1 rounded-md border border-yamabuki/50 bg-yamabuki-soft/30 p-2">
          {others.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <PencilLine size={11} className="text-yamabuki" aria-hidden />
              {others.map((o) => (
                <span key={o.tab} className={`rounded px-1 font-bold leading-4 ${chipOf(o.role)}`}>
                  {o.who}
                </span>
              ))}
              <span className="text-ink-soft">さんも同じ記事を直しています。打った文字はお互いに入り、確定すると一つの版に全員の名前が付きます。</span>
            </div>
          )}
          <textarea ref={textarea} value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} aria-label="記事の修正" className="nums w-full rounded border border-rule bg-sheet px-2 py-1 text-[13px] outline-none" />
          <label className="flex items-center gap-1 text-[11px] text-ink-soft">
            修正の理由
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：数値の誤記" className="flex-1 rounded border border-rule bg-sheet px-1.5 py-0.5 text-[12px] text-ink" />
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-ink-faint">前の版は消えずに残り、誰でも見られます。</span>
            <button type="button" onClick={stopEdit} className="ml-auto rounded border border-rule px-2 py-0.5 text-[11px]">
              やめる
            </button>
            <button
              type="button"
              disabled={!reason.trim() || draft.trim() === noteText(entry).trim()}
              onClick={() => {
                onRevise!(entry, draft, reason, others.length ? coAuthors(me.name, others) : undefined);
                stopEdit();
              }}
              className="rounded bg-yamabuki px-2 py-0.5 text-[11px] font-bold text-white disabled:opacity-40"
            >
              修正を確定（{others.length ? coAuthors(me.name, others) : me.name}）
            </button>
          </div>
        </div>
      ) : others.length > 0 ? (
        <LiveNote editors={others} base={base} chipOf={chipOf} onJoin={onRevise ? startEdit : undefined} />
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
                <div className="whitespace-pre-wrap text-ink-soft">
                  <NoteText text={noteText(v)} />
                </div>
              ) : (
                <div className="whitespace-pre-wrap">
                  {diffLines(noteText(versions[i - 1]), noteText(v)).map((l, j) =>
                    l.kind === "same" ? (
                      <div key={j} className="text-ink-soft">
                        <NoteText text={l.text || " "} />
                      </div>
                    ) : l.kind === "removed" ? (
                      <div key={j} className="text-shu line-through" aria-label="消した行">
                        <NoteText text={l.text || " "} />
                      </div>
                    ) : (
                      <div key={j} className="bg-wakatake-soft text-wakatake" aria-label="足した行">
                        <NoteText text={l.text || " "} />
                      </div>
                    ),
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
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
                        <dd className="whitespace-pre-wrap">
                          <NoteText text={f[k]!} />
                        </dd>
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
              <dd className="whitespace-pre-wrap">
                <NoteText text={x.text} />
              </dd>
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
            <dd className="whitespace-pre-wrap">
              <NoteText text={n.soap[k]!} />
            </dd>
          </div>
        ) : null,
      )}
    </dl>
  ) : (
    <p className="whitespace-pre-wrap">
      <NoteText text={n.text ?? ""} />
    </p>
  );
}

const STATUS_STYLE: Record<OrderEntry["status"], string> = {
  有効: "border-wakatake/40 text-wakatake",
  実施済: "border-rule text-ink-faint",
  終了: "border-rule text-ink-faint",
  中止: "border-shu/40 text-shu",
};

/** The items a lab order contains (a set's tests, a test's analytes, or the test itself), as abbreviations. */
function labItems(codes: string[]): string[] {
  const ofTest = (c: string): string[] => {
    const t = LAB_TESTS.find((x) => x.code === c);
    if (!t) return [c];
    return t.contains && t.contains.length > 1 ? t.contains : [t.abbr ?? t.name];
  };
  return codes.flatMap((c) => findSet(c)?.labCodes.flatMap(ofTest) ?? ofTest(c));
}

/** The mark in the card's heading: 【処方】【注射】【検体検査】【画像検査】【生理検査】【処置】【透析】【輸血】【リハビリ】【他科依頼】【外来予約】… */
export function orderMark(o: OrderEntry["order"]): string {
  if (o.type === "prescription") return "処方";
  if (o.type !== "procedure") return ORDER_TYPE_LABEL[o.type];
  if (o.opd) return "外来予約";
  if (o.hd) return "透析";
  if (o.tx) return "輸血";
  if (o.rehab) return "リハビリ";
  if (o.consult) return "他科依頼";
  if (o.leave) return o.leave.kind;
  if (o.move) return "移動";
  if (o.guide) return "指導の依頼";
  return "処置";
}

/** The small mark of today's 実施 on an order row (order-execute.ts executionBadge). */
const EXEC_BADGE_STYLE = { done: "border-wakatake/40 text-wakatake", not: "border-shu/40 text-shu", late: "border-yamabuki/60 font-bold text-yamabuki", plan: "border-rule text-ink-soft" };

const ORDER_TONE = { chip: "bg-ink-soft text-white", edge: "border-l-rule", bg: "bg-paper/80" };
const STOPPED_TONE = { chip: "bg-shu text-white", edge: "border-l-shu/50", bg: "bg-shu-soft/40" };

/** 【服用開始日：…】 and the like: a small note in the chart's blue. */
function Tag({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] text-ai">【{children}】</span>;
}

/** Compare only what the chip displays, independent of drug and order id. */
const executionMarkKey = (p: ReturnType<typeof executionMarks>[number]) => JSON.stringify([p.verb, p.day, p.time]);

function ExecutionTags({ marks, today, now }: { marks: ReturnType<typeof executionMarks>; today: CalendarDate; now: number | null }) {
  return marks.length > 0 && (
    <span className="flex min-w-0 shrink-0 flex-wrap items-center gap-1">
      {marks.map((p, i) => (
        <span key={i} data-exec-mark className={`nums whitespace-nowrap rounded border px-1 text-[10px] ${isAhead(p, now) ? "border-mizu/60 text-mizu" : "border-rule text-ink-faint"}`}>
          {planVerb(p, now)} {whenText(today, p.day, p.time)}
        </span>
      ))}
    </span>
  );
}

function OrderRow({ sharedMarkKeys = [], grouped = false, hideStatus = false, hideStart = false, entry, today, now = null, place, rpNo, folded, onFold, onDo, onOpenImage, onOpenResult, takeBadge, patient, execute }: { sharedMarkKeys?: string[]; grouped?: boolean; hideStatus?: boolean; hideStart?: boolean; entry: OrderEntry; today: CalendarDate; /** The clock now (minutes from today 00:00), for 予定 or past on the marks; null when unknown. */ now?: number | null; place: string; rpNo?: number; folded: boolean; onFold: () => void; onDo?: (p: DoPayload) => void; onOpenImage?: (entryId: string) => void; onOpenResult?: () => void; takeBadge?: TakeBadge | null; patient?: Patient; execute?: ExecuteProps }) {
  const o = entry.order;
  const { main, detail } = orderLines(o, today);
  const stopped = entry.status === "中止";
  // 依頼日と実施日: when the order is carried out on another day (or is still ahead), say so in the heading.
  const marks = executionMarks(entry, now).filter((p) => !sharedMarkKeys.includes(executionMarkKey(p)));
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const doPayload: DoPayload = { kind: "order", entryId: entry.id };
  const canDo = !!onDo && ["prescription", "injection", "lab"].includes(o.type);
  // 実施・未実施 from this row: the order's occurrences today (the worksheet's), and the small mark of today's state.
  const canExec = !!execute && !!patient && canHaveExecution(entry);
  const nowAbs = execute ? abs(0, execute.nowTime) : 0;
  const todays = canExec && menu ? occurrencesOn(patient!, entry, 0, nowAbs) : null;
  const badge = canExec ? executionBadge(patient!, entry, execute!.records, execute!.sessionStart, nowAbs) : null;
  const hasMenu = canDo || canExec;
  const longPress = useLongPress<HTMLElement>(hasMenu ? setMenu : undefined);
  const extra: MenuExtra[] = canDo ? [{ label: "右へ写す（Do）", icon: Copy, onClick: () => onDo?.(doPayload) }] : [];
  const tone = stopped ? STOPPED_TONE : o.type === "procedure" && o.opd ? PLACE_COLORS.opd : ORDER_TONE;
  const strike = stopped ? "line-through" : "";
  const right = "shrink-0 whitespace-nowrap font-bold";
  const menuButton = hasMenu && (
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
  );
  const body =
    o.type === "prescription" ? (
      <div className="nums space-y-0.5">
        <div className="flex items-baseline gap-2">
          {rpNo && <span className="w-7 shrink-0 text-ink-faint">Rp{rpNo}</span>}
          <span className={`min-w-0 flex-1 ${strike}`}>{oralName(o.drugCode)}</span>
          <span className={right}>
            1回{o.amount}
            {o.unit}
          </span>
          {grouped && menuButton}
        </div>
        <div className="flex flex-wrap items-baseline justify-end gap-x-3 text-ink-soft">
          <span className="rounded bg-paper px-1 text-[11px]">{o.category}</span>
          <span>{timingText(o)}</span>
          <span className="font-bold text-ink">{o.days ? `${o.days}日分` : "継続"}</span>
        </div>
        <div className="text-right">
          {!hideStart && <Tag>
            服用開始日：{whenText(today, o.start.day)}
            {o.start.timing ? ` ${o.start.timing}` : ""}
          </Tag>}
          {o.dailyAmount && (
            <Tag>
              1日量：{o.dailyAmount}
              {o.unit}
            </Tag>
          )}
        </div>
        {(o.comment || o.acks?.length) && <div className="text-xs text-ink-soft">{[o.comment, ...(o.acks ?? [])].filter(Boolean).join("　")}</div>}
      </div>
    ) : o.type === "injection" ? (
      <div className="nums space-y-0.5">
        {o.items.map((it, i) => (
          <div key={i} className="flex items-baseline gap-2">
            <span className="w-7 shrink-0 text-ink-faint">{i === 0 ? "" : "＋"}</span>
            <span className={`min-w-0 flex-1 ${strike}`}>{drugName(it.drugCode)}</span>
            <span className={right}>
              {it.amount}
              {it.unit}
            </span>
            {grouped && i === 0 && menuButton}
          </div>
        ))}
        <div className="flex flex-wrap items-baseline justify-end gap-x-3 text-ink-soft">
          <span>{o.route}</span>
          <span>{scheduleTextFor(o)}</span>
          {o.minutesPerDose ? <span>1回{durationText(o.minutesPerDose)}</span> : null}
          {o.rateMlPerH ? <span>{o.rateMlPerH}mL/時</span> : null}
          <span className="font-bold text-ink">{o.days ? `${o.days}日間` : "継続"}</span>
        </div>
        <div className="text-right">
          {!hideStart && <Tag>開始：{whenText(today, o.start.day, o.start.time)}</Tag>}
        </div>
        {o.comment && <div className="text-xs text-ink-soft">{o.comment}</div>}
      </div>
    ) : o.type === "lab" ? (
      <div className="nums space-y-0.5">
        <div className={`flex flex-wrap items-baseline gap-x-3 ${strike}`}>
          <span className="min-w-0 flex-1">{main}</span>
          <span className="shrink-0 text-ink-soft">
            採取 {whenText(today, o.collect.day, o.collect.time)}　{o.priority}
          </span>
        </div>
        <ul aria-label="検査の内訳" className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[12px] text-ink-soft">
          {labItems(o.codes).map((x, i) => (
            <li key={`${x}-${i}`}>・{x}</li>
          ))}
        </ul>
        {o.comment && <div className="text-xs text-ink-soft">{o.comment}</div>}
        {onOpenResult && !stopped && (
          <button type="button" onClick={onOpenResult} className="mt-1 rounded border border-ai/50 px-2 py-0.5 text-[11px] font-bold text-ai hover:bg-ai-soft pointer-coarse:py-1.5">
            結果を表示
          </button>
        )}
      </div>
    ) : (
      <div className="nums">
        <div className={strike}>{o.type === "procedure" && o.consult ? "コンサルト" : main}{o.type === "procedure" && o.consult && <ConsultStatus id={entry.id} />}</div>
        <div className="text-xs text-ink-soft">{detail}</div>
        {o.type === "imaging" && onOpenImage && !stopped && (
          <button type="button" onClick={() => onOpenImage(entry.id)} className="mt-1 rounded border border-ai/50 px-2 py-0.5 text-[11px] font-bold text-ai hover:bg-ai-soft pointer-coarse:py-1.5">
            画像を開く（PACS）
          </button>
        )}
      </div>
    );
  return (
    <Card
      row={grouped}
      mark={orderMark(o)}
      when={whenText(today, entry.day, entry.time)}
      place={place}
      tone={tone}
      folded={folded}
      onFold={onFold}
      dragHandle={canDo}
      tag={<ExecutionTags marks={marks} today={today} now={now} />}
      article={{
        ...longPress,
        "data-order-id": entry.id,
        draggable: canDo,
        onDragStart: canDo ? dragDo(doPayload) : undefined,
        onContextMenu: (e: React.MouseEvent) => {
          if (!hasMenu) return;
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        },
        title: canDo && canExec ? "右へドラッグで同じオーダを写せます（Do）。右クリック（iPad は長押し）で Do と実施・未実施の記録" : canDo ? "右へドラッグするか右クリックで、同じオーダを写せます（Do）" : canExec ? "右クリック（iPad は長押し）か ⋯ で実施・未実施を記録" : undefined,
        className: `${stopped ? "opacity-70" : ""} ${canDo ? "cursor-grab active:cursor-grabbing" : ""}`,
      }}
      meta={
        <>
          {menu && canExec && todays && <ExecuteMenu at={menu} onClose={() => setMenu(null)} title={main} occurrences={occurrenceStates(todays.timed, execute!.records, execute!.sessionStart, nowAbs)} untimed={todays.untimed} day={0} execute={execute} extra={extra} />}
          {menu && !canExec && <Menu at={menu} onClose={() => setMenu(null)} items={extra} />}
          {!grouped && <><span>第1版：{whenText(today, entry.day, entry.time)}</span>
          <span className="font-bold text-ink">{entry.author}</span></>}
          {entry.verbal && <VerbalReview entry={entry} />}
          {entry.verbal && <span className="rounded border border-yamabuki/50 px-1 text-yamabuki">口頭指示 {entry.verbal.doctor} → 受け {entry.verbal.takenBy}</span>}
          <CosignMark refId={entry.id} />
          {takeBadge && <TakeBadgeMark badge={takeBadge} />}
          {badge && (
            <span data-exec-badge={badge.tone} title={badge.title} className={`rounded border px-1 ${EXEC_BADGE_STYLE[badge.tone]}`}>
              {badge.text}
            </span>
          )}
        <OrderReportMark orderId={entry.id} />
          {!hideStatus && <span className={`ml-auto rounded border px-1 ${STATUS_STYLE[entry.status]}`}>
            {entry.status}
            {stopped && entry.stoppedOn === 0 ? "（今日）" : ""}
          </span>}
          {!grouped && menuButton}
        </>
      }
    >
      {body}
    </Card>
  );
}

/** One heading per order batch; each child still owns its menu, drag payload and execution marks. */
function RxCard({ entries, rpNo, takeBadgeOf, ...props }: {
  entries: OrderEntry[]; rpNo: Map<string, number>; takeBadgeOf?: Props["takeBadgeOf"];
  today: CalendarDate; now: number | null; place: string; folded: boolean; onFold: () => void;
  onDo?: Props["onDo"]; patient: Patient; execute?: ExecuteProps;
}) {
  const first = entries[0];
  const sameStatus = entries.every((e) => e.status === first.status && (e.status !== "中止" || e.stoppedOn === first.stoppedOn));
  const sameStart = entries.every((e) => rxStartKey(e) === rxStartKey(first));
  const markLists = entries.map((entry) => executionMarks(entry, props.now));
  const sharedMarks = markLists[0].filter((p) => markLists.every((marks) => marks.some((other) => executionMarkKey(other) === executionMarkKey(p))));
  const sharedMarkKeys = sharedMarks.map(executionMarkKey);
  const o = first.order;
  return (
    <Card mark={orderMark(o)} when={whenText(props.today, first.day, first.time)} place={props.place}
      tone={entries.every((e) => e.status === "中止") ? STOPPED_TONE : ORDER_TONE}
      folded={props.folded} onFold={props.onFold} dragHandle={!!props.onDo}
      tag={<ExecutionTags marks={sharedMarks} today={props.today} now={props.now} />}
      meta={<><span>第1版：{whenText(props.today, first.day, first.time)}</span><span className="font-bold text-ink">{first.author}</span>
        {sameStatus && <span className={`ml-auto rounded border px-1 ${STATUS_STYLE[first.status]}`}>{first.status}{first.status === "中止" && first.stoppedOn === 0 ? "（今日）" : ""}</span>}</>}>
      {entries.map((entry) => <OrderRow key={entry.id} {...props} entry={entry} rpNo={rpNo.get(entry.id)} grouped sharedMarkKeys={sharedMarkKeys} hideStatus={sameStatus} hideStart={sameStart} takeBadge={takeBadgeOf?.(entry.id)} />)}
      {sameStart && <div className="text-right"><Tag>{o.type === "prescription" ? `服用開始日：${whenText(props.today, o.start.day)}${o.start.timing ? ` ${o.start.timing}` : ""}` : o.type === "injection" ? `開始：${whenText(props.today, o.start.day, o.start.time)}` : ""}</Tag></div>}
    </Card>
  );
}
