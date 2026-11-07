"use client";
import { resizedPrescriptionDays } from "@/lib/prescription-calendar";
import { PrescriptionCalendarMenu } from "./PrescriptionCalendarMenu";
import { InjectionOrderMenu } from "./InjectionOrderMenu";
import { insulinDoseText } from "@/lib/insulin-doses";
import { patternCourse } from "@/lib/day-pattern";

import { displayText } from "@/lib/display-text";
import { ArrowLeftRight, ArrowRight, Check, Plus, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { injectionCell, prescriptionCell, procedureCell } from "@/lib/calendar";
import { addDays, formatShort, hospitalDay, type CalendarDate } from "@/lib/dates";
import { abs, fluidByDay } from "@/lib/flowsheet";
import { durationText, oralName, procedureLines, scheduleLabel, scheduleTextFor, timingText } from "@/lib/format";
import { findProc } from "@/lib/procedures";
import { WARD_RULES, findDrug } from "@/lib/master";
import { ordersOf } from "@/lib/record";
import { InsulinAdjustment } from "./InsulinAdjustment";
import { isInsulin, type InsulinChange } from "@/lib/insulin";
import { InjectionDoseToggle } from "./InjectionDoseToggle";
import { ExecuteTarget, type ExecuteProps } from "./ExecuteMenu";
import { FlowCellMenu, type CellAction } from "./FlowCellMenu";
import { useLongPress } from "@/lib/use-long-press";
import { orderEndDay, type InjectionDraft } from "@/lib/drafts";
import { START_BANDS, doStartOf, draftSpan, startAt, type InjStart } from "@/lib/inj-calendar";
import type { DayOffset, HistoryEntry, InjectionOrder, OrderEntry, Patient, PrescriptionOrder, ProcedureOrder } from "@/lib/types";

export interface CalendarProps {
  onToggleDose?: (entry: OrderEntry, at: number) => void;
  onNewPrescription?: (day: number, from?: OrderEntry) => void;
  onPrescriptionStop?: (entry: OrderEntry, day: number) => void;
  onAdjustInsulin?: (entry: OrderEntry, change: InsulinChange) => void;
  patient: Patient;
  entries: HistoryEntry[];
  today: CalendarDate;
  nowTime: string;
  selectedDay: DayOffset | null;
  onSelectDay: (d: DayOffset) => void;
  /** Put a stop draft for this order into today's drafts. The doctor confirms it there. */
  onStopDraft: (entry: OrderEntry, time?: string) => void;
  draftedStops: string[];
  pendingStopTimes?: Record<string, string>;
  /** 延長: add days to an order with an end. 修正: stop it and copy it into the 注射 tab. */
  onExtendDraft?: (entry: OrderEntry, days: number) => void;
  onModify?: (entry: OrderEntry, change?: import("@/lib/injection-change").InjectionChange) => void;
  /** Extensions waiting as drafts: order id → days added (shown dotted until confirmed). */
  pendingExtends?: Record<string, number>;
  /** The ward's 実施・未実施 record of a dose (order id, minutes from today 00:00), shown on the dose. */
  marOf?: (orderId: string, at: number) => { status: "実施" | "未実施"; by: string; doneAt: string; reason?: string } | undefined;
  /**
   * 新規 (injection calendar): a new injection starting on the day pressed (and its time band), entered in the
   * 注射 tab as always; `from` is the order to copy for Do (同じ内容で続けて新規). Absent when the viewer cannot order.
   */
  onNewInjection?: (start: InjStart, from?: InjectionOrder) => void;
  /** Injection drafts not confirmed yet, shown as dashed rows so the new order is seen on the calendar at once. */
  pendingNew?: InjectionDraft[];
  /** 実施・未実施 of a dose from its cell (right click, long press). Absent: the cells only show. */
  execute?: ExecuteProps;
}

/** The note under a calendar about recording from its cells, when that is possible. */

/** 実施 / 未実施 as the nurse recorded it, next to a dose. */
function MarMark({ r }: { r?: { status: "実施" | "未実施"; by: string; doneAt: string; reason?: string } }) {
  if (!r) return null;
  return (
    <span className={`whitespace-nowrap text-[10px] font-bold ${r.status === "実施" ? "text-wakatake" : "text-shu"}`} title={displayText(`${r.status} ${r.doneAt} ${r.by}${r.reason ? `（${r.reason}）` : ""}`)}>
      {displayText(r.status === "実施" ? "済" : `未実施${r.reason ? `：${r.reason}` : ""}`)}
    </span>
  );
}

const HEAD_W = 230;
const COL_W = 92;
const AHEAD = 3;

function calendarDays(p: Patient, ahead = AHEAD): DayOffset[] {
  const days: DayOffset[] = [];
  for (let d = p.admittedOn; d <= ahead; d++) days.push(d);
  return days;
}
/** The injection calendar looks a week ahead, so a drip can be extended by tapping or dragging. */
const INJ_AHEAD = 7;

function Frame({
  days,
  today,
  patient,
  selectedDay,
  onSelectDay,
  children,
  allowFuture = false,
  nearToday = false,
}: {
  allowFuture?: boolean;
  nearToday?: boolean;
  days: DayOffset[];
  today: CalendarDate;
  patient: Patient;
  selectedDay: DayOffset | null;
  onSelectDay: (d: DayOffset) => void;
  children: React.ReactNode;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const firstDay = days[0] ?? 0;
  useEffect(() => {
    if (nearToday && scroll.current) scroll.current.scrollLeft = Math.max(0, -2 - firstDay) * COL_W;
  }, [nearToday, patient.id, firstDay]);
  return (
    <div ref={scroll} className="scroll-thin min-h-0 flex-1 overflow-auto pb-4">
      <table className="nums border-separate border-spacing-0 text-[12px]" style={{ width: HEAD_W + days.length * COL_W }}>
        <colgroup>
          <col style={{ width: HEAD_W }} />
          {days.map((d) => (
            <col key={d} style={{ width: COL_W }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-20 border-b border-rule bg-sheet" />
            {days.map((d) => (
              <th key={d} className={`sticky top-0 z-10 border-b border-l border-rule bg-sheet p-0 font-normal ${d === 0 ? "bg-ai-soft" : ""}`}>
                <button
                  type="button"
                  disabled={d > 0 && !allowFuture}
                  onClick={() => onSelectDay(d)}
                  className={`flex w-full flex-col items-center py-1 ${d === selectedDay ? "bg-ai text-white" : d > 0 ? "text-ink-faint" : "hover:bg-paper"}`}
                >
                  <b>{formatShort(addDays(today, d))}</b>
                  <span className={`text-[10px] ${d === selectedDay ? "text-white/80" : "text-ink-faint"}`}>
                    {d === 0 ? "今日" : d > 0 ? "予定" : `${hospitalDay(patient.admittedOn, d)}日目`}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>

    </div>
  );
}

function GroupRow({ title, span }: { title: string; span: number }) {
  return (
    <tr>
      <td colSpan={span} className="sticky left-0 border-b border-rule bg-paper px-3 pb-0.5 pt-3 text-[11px] font-bold text-ink-soft">
        {title}
      </td>
    </tr>
  );
}

function RowHead({
  entry,
  title,
  lines,
  onStopDraft,
  drafted,
  onExtend,
  onModify,
  onDo,
  endLabel,
  rxOptions,
}: {
  rxOptions?: CalendarProps;
  entry: OrderEntry;
  title: string;
  lines: string[];
  onStopDraft: (e: OrderEntry) => void;
  drafted: boolean;
  onExtend?: (days: number) => void;
  onModify?: () => void;
  /** Do: the same order again as a new one (from the day after it ends, or today). */
  onDo?: () => void;
  /** "〜11/5" when the order has an end; null when it runs until changed. */
  endLabel?: string | null;
}) {
  const stopped = entry.status === "中止";
  const active = entry.status === "有効";
  // 処置: its own right-click menu (処方 and 注射 have theirs around the row).
  const own = !rxOptions && entry.order.type !== "injection";
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenuAt(null), []);
  const longPress = useLongPress<HTMLDivElement>(own ? setMenuAt : undefined);
  const ownActions: CellAction[] = [
    ...(active && onExtend && endLabel ? [3, 7].map((n) => ({ label: `${n}日延長`, onClick: () => onExtend(n) })) : []),
    ...(active && !drafted ? [{ label: "中止の下書き", onClick: () => onStopDraft(entry) }] : []),
    ...(active && !drafted && onModify ? [{ label: "修正", onClick: onModify }] : []),
  ];
  const hoverOnly = "opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 pointer-coarse:opacity-100";
  let content = <>
      <div className={`font-bold ${stopped ? "text-ink-faint line-through" : "text-ink"}`}>{title}</div>
      {rxOptions?.pendingExtends?.[entry.id] && <div className="text-xs text-ai">日数変更の下書き：{rxOptions.pendingExtends[entry.id] > 0 ? "+" : ""}{rxOptions.pendingExtends[entry.id]}日</div>}
      {lines.map((l) => (
        <div key={l} className="text-[11px] text-ink-soft">
          {l}
        </div>
      ))}
      {endLabel !== undefined && active && <div className="text-[11px] text-ink-soft">{endLabel ? `${endLabel}まで` : "終了日なし（変えるまで続く）"}</div>}
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className={`rounded border px-1 ${stopped ? "border-shu/40 text-shu" : "border-wakatake/40 text-wakatake"}`}>{entry.status}</span>
        {active && drafted && <span className="text-yamabuki">中止の下書きあり</span>}
        <span className={`flex flex-wrap items-center gap-1.5 ${hoverOnly}`}>
          {active && !drafted && (
            <>
              <button type="button" onClick={() => onStopDraft(entry)} className="rounded border border-rule px-1.5 text-ink-soft hover:border-shu hover:text-shu pointer-coarse:py-1">
                中止の下書き
              </button>
              {onModify && (
                <button type="button" onClick={onModify} title="このオーダを止め、同じ内容を入力欄に写して直す" className="rounded border border-rule px-1.5 text-ink-soft hover:border-ai hover:text-ai pointer-coarse:py-1">
                  修正
                </button>
              )}
            </>
          )}
          {onDo && (
            <button
              type="button"
              onClick={onDo}
              title={active && endLabel ? "同じ内容で新しい注射を出す（終わりの翌日から。注射のタブに写します）" : "同じ内容で新しい注射を出す（今日から。注射のタブに写します）"}
              className="rounded border border-rule px-1.5 text-ink-soft hover:border-ai hover:text-ai pointer-coarse:py-1"
            >
              同じ内容で新規
            </button>
          )}
        </span>
      </div>
    </>;
  if (entry.order.type === "injection") content = <InjectionOrderMenu nowTime="00:00" text={[title, ...lines].join("\n")} onDo={onDo}>{content}</InjectionOrderMenu>;
  else if (own && ownActions.length)
    content = (
      <div
        tabIndex={0}
        className="rounded outline-none focus-visible:ring-2 focus-visible:ring-ai/40"
        {...longPress}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuAt({ x: e.clientX, y: e.clientY });
        }}
        onKeyDown={(e) => {
          if (e.key !== "ContextMenu" && !(e.shiftKey && e.key === "F10")) return;
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          setMenuAt({ x: r.left, y: r.bottom });
        }}
      >
        {content}
        {menuAt && <FlowCellMenu at={menuAt} title={title} actions={ownActions} onClose={closeMenu} />}
      </div>
    );
  return <th className="sticky left-0 z-[5] border-b border-rule-soft bg-sheet px-3 py-1.5 text-left align-top font-normal">{rxOptions ? <PrescriptionCalendarMenu entry={entry} day={rxOptions.selectedDay ?? 0} options={rxOptions} focusable>{content}</PrescriptionCalendarMenu> : content}</th>;
}

function Cell({ day, children }: { day: DayOffset; children?: React.ReactNode }) {
  return <td data-cal-day={day} className={`relative border-b border-l border-rule-soft px-1.5 py-1.5 align-top ${day === 0 ? "bg-ai-soft/30" : day > 0 ? "bg-paper/50" : ""}`}>{children}</td>;
}

function Chip({ state, children }: { state: "done" | "planned" | "now"; children: React.ReactNode }) {
  const style =
    state === "done" ? "bg-tab text-ink-soft" : state === "now" ? "bg-ai text-white" : "border border-ai/50 bg-sheet text-ai";
  return (
    <span className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded px-1 py-px text-[11px] ${style}`}>
      {state === "done" && <Check size={10} />}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------

const INJ_GROUPS: { title: string; test: (o: InjectionOrder) => boolean }[] = [
  { title: "抗菌薬", test: (o) => findDrug(o.items[0]?.drugCode)?.kind === "抗菌薬" },
  { title: "輸液", test: (o) => findDrug(o.items[0]?.drugCode)?.kind === "輸液" },
  { title: "その他", test: (o) => findDrug(o.items[0]?.drugCode)?.kind === "その他" },
];

export function InjectionCalendar({ patient, entries, today, nowTime, selectedDay, onSelectDay, onStopDraft, draftedStops, pendingStopTimes = {}, onExtendDraft, onModify, pendingExtends = {}, onNewInjection, pendingNew = [], execute, onAdjustInsulin, onToggleDose }: CalendarProps) {
  const days = calendarDays(patient, INJ_AHEAD);
  // The end being dragged (or moved with ← →) on one order, before it becomes a draft.
  const [drag, setDrag] = useState<{ id: string; to: DayOffset } | null>(null);
  // The day pressed on the ＋ 新しい注射 row, while its time band is being chosen.
  const [pick, setPick] = useState<DayOffset | null>(null);
  const lastDay = days[days.length - 1];
  const fmt = (d: DayOffset) => formatShort(addDays(today, d));
  const nowAbs = abs(0, nowTime);
  const orders = ordersOf(entries).filter((e) => e.order.type === "injection");
  const fluid = fluidByDay(orders, days, nowAbs);

  return (
    <Frame
      nearToday
      days={days}
      today={today}
      patient={patient}
      selectedDay={selectedDay}
      onSelectDay={onSelectDay}
    >
      {INJ_GROUPS.map((g) => {
        const rows = orders.filter((e) => g.test(e.order as InjectionOrder));
        if (rows.length === 0) return null;
        return [
          <GroupRow key={g.title} title={g.title} span={days.length + 1} />,
          ...rows.map((e) => {
            const o = e.order as InjectionOrder;
            const main = findDrug(o.items[0].drugCode);
            const lines = [
              o.insulinDoses ? `${findDrug(o.items[0].drugCode)?.name ?? ""} ${insulinDoseText(o.insulinDoses)}` : o.items.map((it) => `${findDrug(it.drugCode)?.name ?? it.drugCode} ${it.amount}${it.unit}`).join(" ＋ "),
              [o.route, scheduleTextFor(o), o.dayPattern ? patternCourse(o.dayPattern, o.start.day, o.days, false, today) : null, o.minutesPerDose ? `1回${durationText(o.minutesPerDose)}` : null, o.rateMlPerH ? `${o.rateMlPerH?.toFixed(1)}mL/時` : null]
                .filter(Boolean)
                .join("　"),
            ];
            return (
              <tr key={e.id} className="group/row">
                <RowHead
                  entry={e}
                  title={main?.aliases[0] ?? main?.name ?? ""}
                  lines={lines}
                  onStopDraft={onStopDraft}
                  drafted={draftedStops.includes(e.id)}
                  endLabel={orderEndDay(o) === null ? null : `〜${formatShort(addDays(today, orderEndDay(o)!))}`}
                  onExtend={onExtendDraft ? (n) => onExtendDraft(e, n) : undefined}
                  onModify={onModify ? () => onModify(e) : undefined}
                  onDo={onNewInjection && (e.status === "有効" || e.status === "中止" || e.status === "終了") ? () => onNewInjection(doStartOf(o, e.status === "有効" ? "有効" : "中止"), o) : undefined}
                />
                {days.map((d) => {
                  let c = injectionCell(e, d, nowAbs);
                  const end = e.status === "有効" && onExtendDraft ? orderEndDay(o) : null;
                  const extendable = end !== null && d > end && d >= 0;
                  // A stopped order: today's and later cells start the same order again from that day (Do).
                  const redoable = !!onNewInjection && (e.status === "中止" || e.status === "終了") && d >= 0;
                  const to = drag?.id === e.id ? drag.to : end !== null && pendingExtends[e.id] ? end + pendingExtends[e.id] : null;
                  const inPreview = end !== null && to !== null && d > end && d <= to;
                  if (inPreview && to !== null) c = injectionCell({ ...e, order: { ...o, days: to - o.start.day + 1, end: undefined } }, d, nowAbs);
                  return (
                    <td
                      key={d}
                      data-cal-day={d}
                      title={extendable ? `ここまで延長（〜${fmt(d)}、${d - end!}日）` : redoable ? `${fmt(d)}から同じ内容で新規（Do）` : undefined}
                      className={`group/ext relative border-b border-l border-rule-soft px-1.5 py-1.5 align-top ${d === 0 ? "bg-ai-soft/30" : d > 0 ? "bg-paper/50" : ""} ${extendable || redoable ? "cursor-pointer hover:bg-ai-soft/70" : ""}`}
                    >
                      {d === days[days.length-1] && isInsulin(o) && e.status === "有効" && onAdjustInsulin && <InsulinAdjustment order={o} onSave={change=>onAdjustInsulin(e,change)}/>}
                      <InjectionOrderMenu nowTime={nowTime} text={lines.join("\n")}
                        onRate={e.status === "有効" && onModify && !isInsulin(o) ? change => onModify(e, change) : undefined}
                        onStop={e.status === "有効" && onModify ? time => onStopDraft(e, time) : undefined}
                        onExtend={end !== null && onExtendDraft ? n => onExtendDraft(e, n) : undefined}
                        onDo={onNewInjection ? () => onNewInjection(doStartOf(o, e.status === "有効" ? "有効" : "中止"), o) : undefined}>
                      <div className="flex flex-col items-start min-h-8 gap-1">
                        {(extendable || redoable) && <div className={`w-full divide-y divide-rule-soft border-y border-rule-soft ${inPreview ? "" : "opacity-0 group-hover/ext:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100"}`}>
                          {["0–6", "6–12", "12–18", "18–24"].map((band, index) => <button key={band} type="button" aria-label={`${fmt(d)} ${band} ${extendable ? "ここまで延長" : "同じ内容で新規"}`} onClick={ev => { ev.stopPropagation(); if (extendable) onExtendDraft!(e, d - end!); else onNewInjection!(startAt(d, o.start.time), o); }} className={`block min-h-6 w-full text-left text-[10px] text-ink-faint hover:bg-ai-soft hover:text-ai ${inPreview ? "border border-dashed border-ai" : ""}`}><span>{band}</span>{inPreview && c.doses.filter(x => Math.floor(Number(x.time.slice(0, 2)) / 6) === index).map(x => <span key={x.time} className="block text-[11px] text-ai">◯ {x.time}</span>)}</button>)}
                        </div>}

                        {inPreview && <span className="block w-full whitespace-nowrap rounded border-2 border-dashed border-ai px-1 py-px text-[11px] text-ai">延長{drag?.id === e.id ? "" : "（下書き）"}</span>}
                        {extendable && !inPreview && <span className="invisible text-[11px] text-ai/70 group-hover/ext:visible pointer-coarse:visible pointer-coarse:text-ai/40">＋延長</span>}
                        {redoable && <span className="invisible text-[11px] text-ai/70 group-hover/ext:visible pointer-coarse:visible pointer-coarse:text-ai/40">＋新規（Do）</span>}
                        {(draftedStops.includes(e.id) || pendingNew.some(x => x.sourceText !== "（カレンダーから回を取り消し）" && x.duplicate?.action === "replace" && x.duplicate.orderId === e.id)) && d >= 0 && (c.running || inPreview) && <span className="border border-dashed border-shu px-1 text-[10px] text-shu" style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 4px, #b34b4520 4px, #b34b4520 6px)" }}>{d === 0 ? `${pendingStopTimes[e.id] ?? pendingNew.find(x => x.duplicate?.orderId === e.id)?.start.time ?? nowTime}〜 ` : ""}中止（下書き）</span>}
                        {(inPreview ? [] : c.doses).map((x) => {
                          const at = d * 1440 + Number(x.time.slice(0, 2)) * 60 + Number(x.time.slice(3, 5));
                          return (
                            <ExecuteTarget key={x.time} execute={execute} patient={patient} entry={e} at={at} title={lines[0]} className={`inline-flex w-full items-center gap-0.5 border-b border-rule-soft py-1 hover:bg-ai-soft/40 ${inPreview ? "border border-dashed border-ai" : ""}`}>
                              {isInsulin(o) && execute?.records[`${e.id}|${at}`]?.insulin && <small className="block text-[10px]">{execute.records[`${e.id}|${at}`].insulin!.glucose != null ? `血糖 ${execute.records[`${e.id}|${at}`].insulin!.glucose}・` : ""}{execute.records[`${e.id}|${at}`].insulin!.units}単位</small>}
                              <InjectionDoseToggle execute={execute} patientId={patient.id} orderId={e.id} at={at} time={x.time} record={execute?.records[`${e.id}|${at}`]}
                                onToggle={onToggleDose && !inPreview && e.status === "有効" ? () => onToggleDose(e, at) : undefined}
                                omitted={pendingNew.some(draft => draft.sourceText === "（カレンダーから回を取り消し）" && draft.duplicate?.orderId === e.id && draft.omittedDoses?.some(slot => ((draft.start.day ?? 0) + slot.day) * 1440 + Number(slot.time.slice(0, 2)) * 60 + Number(slot.time.slice(3)) === at))} />
                            </ExecuteTarget>
                          );
                        })}
                        {o.continuous && c.running && <Chip state={d < 0 ? "done" : "planned"}>継続</Chip>}
                        {c.infusion && (
                          <Chip state={c.infusion.state}>
                            {c.infusion.state === "now" ? "投与中 " : ""}
                            {c.infusion.volumeMl.toLocaleString("ja-JP")}mL
                          </Chip>
                        )}
                        {c.stopped && <span className="whitespace-nowrap text-[11px] font-bold text-shu">{c.stopped.beforeStart ? "開始前に中止" : `中止${c.stopped.time ? ` ${c.stopped.time}` : ""}`}</span>}
                      </div>
                      </InjectionOrderMenu>
                      {end !== null && d === end && (
                        <ExtendHandle
                          label={`${main?.aliases[0] ?? main?.name ?? ""}の終わりの日（〜${fmt(end)}）`}
                          end={end}
                          max={lastDay}
                          value={drag?.id === e.id ? drag.to : end}
                          fmt={fmt}
                          onMove={(t) => setDrag({ id: e.id, to: t })}
                          onDone={(t) => {
                            setDrag(null);
                            if (t > end) onExtendDraft!(e, t - end);
                          }}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          }),
        ];
      })}
      {orders.length === 0 && (
        <tr>
          <td colSpan={days.length + 1} className="px-3 py-6 text-ink-faint">
            注射のオーダはありません
          </td>
        </tr>
      )}
      {pendingNew.some(d => d.sourceText !== "（カレンダーから回を取り消し）") && [
        <GroupRow key="pending" title="下書き（まだ確定していない新しい注射）" span={days.length + 1} />,
        ...pendingNew.filter(d => d.sourceText !== "（カレンダーから回を取り消し）").map((d) => {
          const main = d.items[0];
          const drug = main?.drugCode ? findDrug(main.drugCode) : undefined;
          const span = draftSpan(d.start, d.days, lastDay);
          const lines = [
            d.items.map((it) => `${it.drugCode ? (findDrug(it.drugCode)?.name ?? it.said) : it.said}${it.amount !== null ? ` ${it.amount}${it.unit ?? ""}` : ""}`).join(" ＋ "),
            [d.route, d.schedule ? scheduleLabel(d.schedule, main?.drugCode) : null, d.days ? `${d.days}日間` : "終了日なし"].filter(Boolean).join("　"),
          ];
          return (
            <tr key={d.id} className="text-ink-soft">
              <th className="sticky left-0 z-[5] border-b border-rule-soft bg-sheet px-3 py-1.5 text-left align-top font-normal">
                <div className="font-bold text-ink">{drug?.aliases[0] ?? drug?.name ?? main?.said ?? "（薬の未定）"}</div>
                {lines.map((l) => (
                  <div key={l} className="text-[11px]">
                    {l}
                  </div>
                ))}
                <div className="mt-1 text-[10px] text-yamabuki">下書き：記事の下で確定するとオーダになります</div>
              </th>
              {days.map((day) => (
                <td key={day} className={`border-b border-l border-rule-soft px-1.5 py-1.5 align-top ${day === 0 ? "bg-ai-soft/30" : day > 0 ? "bg-paper/50" : ""}`}>
                  {day >= span.from && day <= span.to && (
                    <span className="whitespace-nowrap rounded border border-dashed border-yamabuki px-1 py-px text-[11px] text-yamabuki">
                      {displayText(day === span.from && d.start.time ? `${d.start.time} ` : "")}
                      下書き
                    </span>
                  )}
                </td>
              ))}
            </tr>
          );
        }),
      ]}
      {onNewInjection && (
        <tr>
          <th className="sticky left-0 z-[5] border-b border-t border-rule bg-sheet px-3 py-1.5 text-left align-top font-normal">
            <button type="button" onClick={() => onNewInjection(startAt(0, null))} title="今日から（時刻なし）の新しい注射を注射のタブで入れる" className="flex items-center gap-1 font-bold text-ai hover:underline">
              <Plus size={13} />
              新しい注射
            </button>

          </th>
          {days.map((d) => (
            <td key={d} data-new-pick className={`group/new relative border-b border-l border-t border-rule px-1.5 py-1.5 align-top ${d === 0 ? "bg-ai-soft/30" : d > 0 ? "bg-paper/50" : ""}`}>
              {d >= 0 && (
                <button
                  type="button"
                  onClick={() => setPick((p) => (p === d ? null : d))}
                  aria-expanded={pick === d}
                  aria-haspopup="menu"
                  title={`${fmt(d)}から新しい注射（時刻帯を選びます）`}
                  className={`flex w-full items-center justify-center gap-0.5 rounded border border-dashed px-1 py-1 text-[11px] pointer-coarse:py-2 ${pick === d ? "border-ai bg-ai text-white" : "border-rule text-ink-faint opacity-0 hover:border-ai hover:text-ai focus-visible:opacity-100 group-hover/new:opacity-100 pointer-coarse:opacity-100"}`}
                >
                  <Plus size={11} />
                  新規
                </button>
              )}
              {pick === d && (
                <StartBandMenu
                  label={`${fmt(d)}から新しい注射の時刻帯`}
                  onPick={(time) => {
                    setPick(null);
                    onNewInjection(startAt(d, time));
                  }}
                  onClose={() => setPick(null)}
                  alignRight={d >= lastDay - 1}
                />
              )}
            </td>
          ))}
        </tr>
      )}
      <tr>
        <th className="sticky left-0 z-[5] border-t border-rule bg-paper px-3 py-1.5 text-left text-[11px] font-normal text-ink-soft">
          点滴量（オーダから計算）
        </th>
        {days.map((d) => (
          <td key={d} className="border-l border-t border-rule bg-paper px-1.5 py-1.5 text-right text-[11px]">
            {fluid[d] ? `${fluid[d].toLocaleString("ja-JP")}mL` : ""}
          </td>
        ))}
      </tr>
    </Frame>
  );
}


/**
 * The time bands for the start of a new injection, under the day pressed on the ＋ 新しい注射 row.
 * Esc or a press outside closes it. The clock times are the fictional hospital's rule (架空の病院の取り決め).
 */
function StartBandMenu({ label, onPick, onClose, alignRight }: { label: string; onPick: (time: string | null) => void; onClose: () => void; alignRight: boolean }) {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest("[data-new-pick]")) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div role="menu" aria-label={label} className={`absolute bottom-full z-30 mb-0.5 w-56 rounded-md border border-rule bg-sheet p-1.5 text-[12px] shadow-lg ${alignRight ? "right-0" : "left-0"}`}>
      <div className="px-1 pb-1 text-[11px] font-bold text-ink-soft">{label}</div>
      {START_BANDS.map((b) => (
        <button key={b.label} type="button" role="menuitem" onClick={() => onPick(b.time)} className="nums flex w-full items-baseline justify-between gap-2 rounded px-2 py-1 text-left hover:bg-ai-soft pointer-coarse:py-2">
          <span>{b.label}</span>
          {b.time && <span className="text-ink-faint">{b.time}</span>}
        </button>
      ))}

    </div>
  );
}

/**
 * The arrow at the end of a drip: drag it right to extend (finger or mouse), or with the keyboard,
 * ← → to choose the day and Enter to make the draft (Esc cancels).
 */
function ExtendHandle({ label, end, min = end, max, value, fmt, onMove, onDone, className = "" }: { label: string; end: DayOffset; /** Below `end` when the order can also be shortened. */ min?: DayOffset; max: DayOffset; value: DayOffset; fmt: (d: DayOffset) => string; onMove: (to: DayOffset) => void; onDone: (to: DayOffset) => void; className?: string }) {
  const dayAt = (x: number, y: number): DayOffset | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cal-day]");
    return el ? Number(el.dataset.calDay) : null;
  };
  const clamp = (d: number) => Math.min(max, Math.max(min, d));
  return (
    <button
      type="button"
      role="slider"
      aria-label={`${label}。${min < end ? "左右" : "右"}へ引くか ← → で${min < end ? "日数を変える" : "延長"}`}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={value > end ? `〜${fmt(value)}（${value - end}日延長）` : value < end ? `〜${fmt(value)}（${end - value}日短縮）` : `〜${fmt(end)}`}
      title={min < end ? "左右へ引くと日数を変える（← → と Enter でも）" : "右へ引くと延長（← → と Enter でも）"}
      style={{ touchAction: "none" }}
      onClick={(ev) => ev.stopPropagation()}
      onPointerDown={(ev) => {
        ev.stopPropagation();
        ev.currentTarget.setPointerCapture(ev.pointerId);
        onMove(end);
      }}
      onPointerMove={(ev) => {
        if (!ev.currentTarget.hasPointerCapture(ev.pointerId)) return;
        const d = dayAt(ev.clientX, ev.clientY);
        if (d !== null) onMove(clamp(d));
      }}
      onPointerUp={(ev) => {
        if (!ev.currentTarget.hasPointerCapture(ev.pointerId)) return;
        ev.currentTarget.releasePointerCapture(ev.pointerId);
        const d = dayAt(ev.clientX, ev.clientY);
        onDone(clamp(d ?? value));
      }}
      onPointerCancel={() => onDone(end)}
      onKeyDown={(ev) => {
        if (ev.key === "ArrowRight") onMove(clamp(value + 1));
        else if (ev.key === "ArrowLeft") onMove(clamp(value - 1));
        else if (ev.key === "Enter") onDone(value);
        else if (ev.key === "Escape") onDone(end);
        else return;
        ev.preventDefault();
      }}
      className={`absolute right-0 top-1/2 flex h-7 w-6 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-l bg-ai/90 text-white shadow outline-none focus-visible:ring-2 focus-visible:ring-ai/60 pointer-coarse:h-9 pointer-coarse:w-8 ${className}`}
    >
      {min < end ? <ArrowLeftRight size={14} /> : <ArrowRight size={14} />}
    </button>
  );
}

// ---------------------------------------------------------------------------

const RX_GROUPS: PrescriptionOrder["category"][] = ["定期", "臨時", "持参薬", "退院時"];

export function PrescriptionCalendar(options: CalendarProps) {
  const { patient, entries, today, nowTime, selectedDay, onSelectDay, onStopDraft, draftedStops, marOf, execute, onNewPrescription, onModify, onExtendDraft } = options;
  const nowAbs = abs(0, nowTime);
  const orders = ordersOf(entries).filter((e) => e.order.type === "prescription");
  // A few days past the last end, so the end can be dragged out.
  const days = calendarDays(patient, Math.max(7, ...orders.map(e => (orderEndDay(e.order) ?? 0) + (e.status === "有効" ? 3 : 0))));
  const lastDay = days[days.length - 1];
  const fmt = (d: DayOffset) => formatShort(addDays(today, d));
  // The end being dragged (or moved with ← →) on one prescription, before it becomes a draft.
  const [drag, setDrag] = useState<{ id: string; to: DayOffset } | null>(null);

  return (
    <>
    <Frame
      nearToday
      days={days}
      today={today}
      patient={patient}
      selectedDay={selectedDay}
      onSelectDay={onNewPrescription ?? onSelectDay}
      allowFuture={!!onNewPrescription}
    >
      {onNewPrescription && (
        <tr>
          <th className="sticky left-0 z-[5] border-b border-rule bg-sheet px-3 py-1.5 text-left align-top font-normal">
            <button type="button" onClick={() => onNewPrescription(0)} className="flex items-center gap-1 font-bold text-ai hover:underline">
              <Plus size={13} />
              新規処方
            </button>
          </th>
          {days.map((d) => (
            <td key={d} className="group/new border-b border-l border-rule p-0.5">
              <button type="button" onClick={() => onNewPrescription(d)} aria-label={`${fmt(d)}から処方`} className="w-full rounded py-1 text-[11px] text-ai opacity-0 hover:bg-ai-soft focus-visible:opacity-100 group-hover/new:opacity-100 pointer-coarse:opacity-60">
                ＋ 処方
              </button>
            </td>
          ))}
        </tr>
      )}
      <tr>
        <th className="sticky left-0 z-[5] border-b border-rule bg-paper px-3 py-1.5 text-left text-[11px] font-normal text-ink-soft">食事（主食・割）</th>
        {days.map((d) => {
          const r = patient.daily.find((x) => x.day === d);
          const text = !r?.meals ? "" : r.meals === "絶食" ? "絶食" : r.meals.map((m) => (m === null ? "−" : m)).join("/");
          return (
            <td key={d} className={`border-b border-l border-rule bg-paper px-1.5 py-1.5 text-center text-[11px] ${text === "絶食" ? "font-bold text-yamabuki" : ""}`}>
              {displayText(text)}
            </td>
          );
        })}
      </tr>
      {RX_GROUPS.map((cat) => {
        const rows = orders.filter((e) => (e.order as PrescriptionOrder).category === cat);
        if (rows.length === 0) return null;
        return [
          <GroupRow key={cat} title={cat} span={days.length + 1} />,
          ...rows.map((e) => {
            const o = e.order as PrescriptionOrder;
            const end = e.status === "有効" && onExtendDraft ? orderEndDay(o) : null;
            const to = drag?.id === e.id ? drag.to : null;
            return (
              <tr key={e.id} className="group/row">
                <RowHead
                  rxOptions={options}
                  entry={e}
                  title={oralName(o.drugCode)}
                  lines={[`${o.administration ? "総量" : "1回"}${o.amount}${o.unit}　${timingText(o)}${o.dayPattern ? `　${patternCourse(o.dayPattern, o.start.day, o.days, true, today)}` : o.days ? `　${o.days}日分` : ""}`, ...(o.comment ? [o.comment] : [])]}
                  onModify={onModify ? () => onModify(e) : undefined}
                  onExtend={onExtendDraft ? d => onExtendDraft(e, d) : undefined}
                  endLabel={orderEndDay(e.order) === null ? null : formatShort(addDays(today, orderEndDay(e.order)!))}
                  onStopDraft={onStopDraft}
                  drafted={draftedStops.includes(e.id)}
                />
                {days.map((d) => {
                  const c = prescriptionCell(e, d, nowAbs);
                  const added = end !== null && to !== null && d > end && d <= to;
                  const cut = end !== null && to !== null && d > to && d <= end;
                  return (
                    <Cell key={d} day={d}>
                      <PrescriptionCalendarMenu entry={e} day={d} options={options}><div className={`flex flex-wrap gap-1 ${cut ? "line-through opacity-40" : ""}`}>
                        {c.slots.map((s) =>
                          s.state ? (
                            (() => {
                              const at = abs(d, WARD_RULES.medTimes[s.timing]);
                              const r = marOf?.(e.id, at);
                              return (
                                <ExecuteTarget key={s.timing} execute={execute} patient={patient} entry={e} at={at} title={oralName(o.drugCode)} className={`inline-flex items-center gap-0.5 ${r?.status === "未実施" ? "line-through decoration-shu" : ""}`}>
                                  <Chip state={s.state}>{s.timing}</Chip>
                                  <MarMark r={r} />
                                </ExecuteTarget>
                              );
                            })()
                          ) : (
                            <span key={s.timing} className="inline-flex items-center px-1 text-[11px] text-ink-faint/50">
                              <Square size={8} />
                            </span>
                          ),
                        )}
                        {c.prnUses.map((t) => (
                          <Chip key={t} state="done">
                            {t} 使用
                          </Chip>
                        ))}
                        {c.stopped && <span className="whitespace-nowrap text-[11px] font-bold text-shu">中止</span>}
                        {added && <span className="whitespace-nowrap rounded border-2 border-dashed border-ai px-1 py-px text-[11px] text-ai">延長</span>}
                      </div>
                      </PrescriptionCalendarMenu>
                      {end !== null && d === end && (
                        <ExtendHandle
                          label={`${oralName(o.drugCode)}の終わりの日（〜${fmt(end)}）`}
                          end={end}
                          min={Math.min(end, Math.max(o.start.day, 0))}
                          max={lastDay}
                          value={to ?? end}
                          fmt={fmt}
                          className={to !== null ? "" : "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"}
                          onMove={(t) => setDrag({ id: e.id, to: t })}
                          onDone={(t) => {
                            setDrag(null);
                            const delta = t === end ? null : resizedPrescriptionDays(o.days ?? 0, (t - end) * COL_W, COL_W, o, today);
                            if (delta) onExtendDraft!(e, delta);
                          }}
                        />
                      )}
                    </Cell>
                  );
                })}
              </tr>
            );
          }),
        ];
      })}
      {orders.length === 0 && (
        <tr>
          <td colSpan={days.length + 1} className="px-3 py-6 text-ink-faint">
            処方はありません
          </td>
        </tr>
      )}
    </Frame>
    </>
  );
}

// ---------------------------------------------------------------------------

const PROC_GROUPS: { title: string; test: (o: ProcedureOrder) => boolean }[] = [
  { title: "酸素・留置", test: (o) => o.schedule.kind === "continuous" },
  { title: "決まった時刻", test: (o) => o.schedule.kind === "per_day" || o.schedule.kind === "every_days" || o.schedule.kind === "once" },
  { title: "必要時", test: (o) => o.schedule.kind === "prn" },
];

export function ProcedureCalendar({ patient, entries, today, nowTime, selectedDay, onSelectDay, onStopDraft, draftedStops, marOf, execute, onModify, onExtendDraft }: CalendarProps) {
  const days = calendarDays(patient);
  const nowAbs = abs(0, nowTime);
  const orders = ordersOf(entries).filter((e) => e.order.type === "procedure");

  return (
    <Frame
      days={days}
      today={today}
      patient={patient}
      selectedDay={selectedDay}
      onSelectDay={onSelectDay}
    >
      {PROC_GROUPS.map((g) => {
        const rows = orders.filter((e) => g.test(e.order as ProcedureOrder));
        if (rows.length === 0) return null;
        return [
          <GroupRow key={g.title} title={g.title} span={days.length + 1} />,
          ...rows.map((e) => {
            const o = e.order as ProcedureOrder;
            const { main, detail } = procedureLines(o, today);
            return (
              <tr key={e.id} className="group/row">
                <RowHead onModify={onModify ? () => onModify(e) : undefined} onExtend={onExtendDraft ? d => onExtendDraft(e, d) : undefined} endLabel={orderEndDay(e.order) === null ? null : formatShort(addDays(today, orderEndDay(e.order)!))} entry={e} title={main} lines={[detail]} onStopDraft={onStopDraft} drafted={draftedStops.includes(e.id)} />
                {days.map((d) => {
                  const c = procedureCell(e, d, nowAbs);
                  return (
                    <Cell key={d} day={d}>
                      <div className="flex flex-wrap gap-1">
                        {c.running && (
                          <Chip state={c.running.state}>
                            {o.o2 ? `${o.o2.lpm}L/分` : findProc(o.code)?.name === "膀胱留置カテーテル" ? "留置" : "実施中"}
                            {c.running.from && <span className="opacity-75">{displayText(c.running.from)}〜</span>}
                          </Chip>
                        )}
                        {c.times.map((t) => {
                          if (o.schedule.kind === "prn")
                            return (
                              <Chip key={t.time} state={t.state}>
                                {t.time} 実施
                              </Chip>
                            );
                          const at = abs(d, t.time);
                          const r = marOf?.(e.id, at);
                          return (
                            <ExecuteTarget key={t.time} execute={execute} patient={patient} entry={e} at={at} title={main} className={`inline-flex items-center gap-0.5 ${r?.status === "未実施" ? "line-through decoration-shu" : ""}`}>
                              <Chip state={t.state}>{t.time}</Chip>
                              <MarMark r={r} />
                            </ExecuteTarget>
                          );
                        })}
                        {c.stopped && <span className="whitespace-nowrap text-[11px] font-bold text-shu">中止{c.stopped.time ? ` ${c.stopped.time}` : ""}</span>}
                      </div>
                    </Cell>
                  );
                })}
              </tr>
            );
          }),
        ];
      })}
      {orders.length === 0 && (
        <tr>
          <td colSpan={days.length + 1} className="px-3 py-6 text-ink-faint">
            処置はありません
          </td>
        </tr>
      )}
    </Frame>
  );
}
