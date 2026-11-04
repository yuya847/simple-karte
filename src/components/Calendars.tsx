"use client";

import { ArrowRight, Check, Plus, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { injectionCell, prescriptionCell, procedureCell } from "@/lib/calendar";
import { addDays, formatShort, hospitalDay, type CalendarDate } from "@/lib/dates";
import { abs, fluidByDay } from "@/lib/flowsheet";
import { durationText, oralName, procedureLines, scheduleLabel, scheduleTextFor, timingText } from "@/lib/format";
import { findProc } from "@/lib/procedures";
import { WARD_RULES, findDrug } from "@/lib/master";
import { ordersOf } from "@/lib/record";
import { InjectionDoseToggle } from "./InjectionDoseToggle";
import { ExecuteTarget, type ExecuteProps } from "./ExecuteMenu";
import { orderEndDay, type InjectionDraft } from "@/lib/drafts";
import { START_BANDS, doStartOf, draftSpan, startAt, type InjStart } from "@/lib/inj-calendar";
import type { DayOffset, HistoryEntry, InjectionOrder, OrderEntry, Patient, PrescriptionOrder, ProcedureOrder } from "@/lib/types";

export interface CalendarProps {
  patient: Patient;
  entries: HistoryEntry[];
  today: CalendarDate;
  nowTime: string;
  selectedDay: DayOffset | null;
  onSelectDay: (d: DayOffset) => void;
  /** Put a stop draft for this order into today's drafts. The doctor confirms it there. */
  onStopDraft: (entry: OrderEntry) => void;
  draftedStops: string[];
  /** 延長: add days to an order with an end. 修正: stop it and copy it into the 注射 tab. */
  onExtendDraft?: (entry: OrderEntry, days: number) => void;
  onModify?: (entry: OrderEntry) => void;
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
const EXEC_NOTE = (execute: ExecuteProps | undefined) => (execute ? "時刻の札を右クリック（iPad は長押し）すると、その回を実施・未実施にできます（ワークシートと同じ与薬・実施の記録。照合なし）。" : "");

/** 実施 / 未実施 as the nurse recorded it, next to a dose. */
function MarMark({ r }: { r?: { status: "実施" | "未実施"; by: string; doneAt: string; reason?: string } }) {
  if (!r) return null;
  return (
    <span className={`whitespace-nowrap text-[10px] font-bold ${r.status === "実施" ? "text-wakatake" : "text-shu"}`} title={`${r.status} ${r.doneAt} ${r.by}${r.reason ? `（${r.reason}）` : ""}`}>
      {r.status === "実施" ? "済" : `未実施${r.reason ? `：${r.reason}` : ""}`}
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
  note,
}: {
  days: DayOffset[];
  today: CalendarDate;
  patient: Patient;
  selectedDay: DayOffset | null;
  onSelectDay: (d: DayOffset) => void;
  children: React.ReactNode;
  note: string;
}) {
  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-auto pb-24">
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
                  disabled={d > 0}
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
      <p className="hint mt-2 px-3 text-[10px] text-ink-faint">{note}</p>
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
}: {
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
  return (
    <th className="sticky left-0 z-[5] border-b border-rule-soft bg-sheet px-3 py-1.5 text-left align-top font-normal">
      <div className={`font-bold ${stopped ? "text-ink-faint line-through" : "text-ink"}`}>{title}</div>
      {lines.map((l) => (
        <div key={l} className="text-[11px] text-ink-soft">
          {l}
        </div>
      ))}
      {endLabel !== undefined && active && <div className="text-[11px] text-ink-soft">{endLabel ? `${endLabel}まで` : "終了日なし（変えるまで続く）"}</div>}
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className={`rounded border px-1 ${stopped ? "border-shu/40 text-shu" : "border-wakatake/40 text-wakatake"}`}>{entry.status}</span>
        {active &&
          (drafted ? (
            <span className="text-yamabuki">中止の下書きあり</span>
          ) : (
            <>
              <button type="button" onClick={() => onStopDraft(entry)} className="rounded border border-rule px-1.5 text-ink-soft hover:border-shu hover:text-shu pointer-coarse:py-1">
                中止の下書き
              </button>
              {onModify && (
                <button type="button" onClick={onModify} title="このオーダを止め、同じ内容を注射のタブに写して直す" className="rounded border border-rule px-1.5 text-ink-soft hover:border-ai hover:text-ai pointer-coarse:py-1">
                  修正
                </button>
              )}
              {onExtend && endLabel && (
                <select
                  value=""
                  aria-label={`${title}を延長`}
                  onChange={(e) => e.target.value && onExtend(Number(e.target.value))}
                  className="rounded border border-rule bg-sheet px-1 text-ink-soft hover:border-ai pointer-coarse:py-1"
                >
                  <option value="">延長…</option>
                  {[1, 2, 3, 5, 7, 14].map((n) => (
                    <option key={n} value={n}>
                      ＋{n}日
                    </option>
                  ))}
                </select>
              )}
            </>
          ))}
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
      </div>
    </th>
  );
}

function Cell({ day, children }: { day: DayOffset; children?: React.ReactNode }) {
  return <td className={`border-b border-l border-rule-soft px-1.5 py-1.5 align-top ${day === 0 ? "bg-ai-soft/30" : day > 0 ? "bg-paper/50" : ""}`}>{children}</td>;
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

export function InjectionCalendar({ patient, entries, today, nowTime, selectedDay, onSelectDay, onStopDraft, draftedStops, onExtendDraft, onModify, pendingExtends = {}, onNewInjection, pendingNew = [], execute }: CalendarProps) {
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
      days={days}
      today={today}
      patient={patient}
      selectedDay={selectedDay}
      onSelectDay={onSelectDay}
      note={`✓ は与薬・実施の記録がある投与です。時刻を押すとその回をスキップ、もう一度押すと復活します（実施済みの回は「未実施に戻す」で取り消し）。枠だけのものはこれからの予定。${EXEC_NOTE(execute)}点滴量はオーダから計算した概算です。日数の決まった点滴は、終わりの日より右の空欄を押すか、終わりの日の → を右へ引くと延長の下書きになります（→ にカーソルを置いて ← → と Enter でも）。${onNewInjection ? "「＋ 新しい注射」の行で日付を押すと、その日と時刻帯を開始にした新しい注射を注射のタブで入れられます（時刻帯の時刻は架空の病院の取り決め）。中止したオーダの今日以降の欄を押すと、その日から同じ内容で新規（Do）。" : ""}`}
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
              o.items.map((it) => `${findDrug(it.drugCode)?.name ?? it.drugCode} ${it.amount}${it.unit}`).join(" ＋ "),
              [o.route, scheduleTextFor(o), o.minutesPerDose ? `1回${durationText(o.minutesPerDose)}` : null, o.rateMlPerH ? `${o.rateMlPerH}mL/時` : null]
                .filter(Boolean)
                .join("　"),
            ];
            return (
              <tr key={e.id}>
                <RowHead
                  entry={e}
                  title={main?.aliases[0] ?? main?.name ?? ""}
                  lines={lines}
                  onStopDraft={onStopDraft}
                  drafted={draftedStops.includes(e.id)}
                  endLabel={orderEndDay(o) === null ? null : `〜${formatShort(addDays(today, orderEndDay(o)!))}`}
                  onExtend={onExtendDraft ? (n) => onExtendDraft(e, n) : undefined}
                  onModify={onModify ? () => onModify(e) : undefined}
                  onDo={onNewInjection && (e.status === "有効" || e.status === "中止") ? () => onNewInjection(doStartOf(o, e.status as "有効" | "中止"), o) : undefined}
                />
                {days.map((d) => {
                  const c = injectionCell(e, d, nowAbs);
                  const end = e.status === "有効" && onExtendDraft ? orderEndDay(o) : null;
                  const extendable = end !== null && d > end;
                  // A stopped order: today's and later cells start the same order again from that day (Do).
                  const redoable = !!onNewInjection && e.status === "中止" && d >= 0;
                  const to = drag?.id === e.id ? drag.to : end !== null && pendingExtends[e.id] ? end + pendingExtends[e.id] : null;
                  const inPreview = end !== null && to !== null && d > end && d <= to;
                  return (
                    <td
                      key={d}
                      data-cal-day={d}
                      onClick={extendable ? () => onExtendDraft!(e, d - end!) : redoable ? () => onNewInjection!(startAt(d, o.start.time), o) : undefined}
                      title={extendable ? `ここまで延長（〜${fmt(d)}、${d - end!}日）` : redoable ? `${fmt(d)}から同じ内容で新規（Do）` : undefined}
                      className={`group/ext relative border-b border-l border-rule-soft px-1.5 py-1.5 align-top ${d === 0 ? "bg-ai-soft/30" : d > 0 ? "bg-paper/50" : ""} ${extendable || redoable ? "cursor-pointer hover:bg-ai-soft/70" : ""}`}
                    >
                      <div className="flex flex-col items-start gap-1">
                        {inPreview && <span className="whitespace-nowrap rounded border border-dashed border-ai px-1 py-px text-[11px] text-ai">延長{drag?.id === e.id ? "" : "（下書き）"}</span>}
                        {extendable && !inPreview && <span className="hidden text-[11px] text-ai/70 group-hover/ext:inline pointer-coarse:inline pointer-coarse:text-ai/40">＋延長</span>}
                        {redoable && <span className="hidden text-[11px] text-ai/70 group-hover/ext:inline pointer-coarse:inline pointer-coarse:text-ai/40">＋新規（Do）</span>}
                        {c.doses.map((x) => {
                          const at = d * 1440 + Number(x.time.slice(0, 2)) * 60 + Number(x.time.slice(3, 5));
                          return (
                            <ExecuteTarget key={x.time} execute={execute} patient={patient} entry={e} at={at} title={lines[0]} className="inline-flex items-center gap-0.5">
                              <InjectionDoseToggle execute={execute} patientId={patient.id} orderId={e.id} at={at} time={x.time} record={execute?.records[`${e.id}|${at}`]} />
                            </ExecuteTarget>
                          );
                        })}
                        {c.infusion && (
                          <Chip state={c.infusion.state}>
                            {c.infusion.state === "now" ? "投与中 " : ""}
                            {c.infusion.volumeMl.toLocaleString("ja-JP")}mL
                          </Chip>
                        )}
                        {c.stopped && <span className="whitespace-nowrap text-[11px] font-bold text-shu">中止{c.stopped.time ? ` ${c.stopped.time}` : ""}</span>}
                      </div>
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
      {pendingNew.length > 0 && [
        <GroupRow key="pending" title="下書き（まだ確定していない新しい注射）" span={days.length + 1} />,
        ...pendingNew.map((d) => {
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
                      {day === span.from && d.start.time ? `${d.start.time} ` : ""}
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
            <div className="hint mt-0.5 text-[10px] text-ink-faint">右の日付の欄を押すと、その日と時刻帯から。薬は注射のタブで選びます。</div>
          </th>
          {days.map((d) => (
            <td key={d} data-new-pick className={`relative border-b border-l border-t border-rule px-1.5 py-1.5 align-top ${d === 0 ? "bg-ai-soft/30" : d > 0 ? "bg-paper/50" : ""}`}>
              {d >= 0 && (
                <button
                  type="button"
                  onClick={() => setPick((p) => (p === d ? null : d))}
                  aria-expanded={pick === d}
                  aria-haspopup="menu"
                  title={`${fmt(d)}から新しい注射（時刻帯を選びます）`}
                  className={`flex w-full items-center justify-center gap-0.5 rounded border border-dashed px-1 py-1 text-[11px] pointer-coarse:py-2 ${pick === d ? "border-ai bg-ai text-white" : "border-rule text-ink-faint hover:border-ai hover:text-ai"}`}
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
      <p className="hint px-1 pt-1 text-[10px] text-ink-faint">時刻帯の時刻は架空の病院の取り決めです。注射のタブで時刻を打ち直せます。</p>
    </div>
  );
}

/**
 * The arrow at the end of a drip: drag it right to extend (finger or mouse), or with the keyboard,
 * ← → to choose the day and Enter to make the draft (Esc cancels).
 */
function ExtendHandle({ label, end, max, value, fmt, onMove, onDone }: { label: string; end: DayOffset; max: DayOffset; value: DayOffset; fmt: (d: DayOffset) => string; onMove: (to: DayOffset) => void; onDone: (to: DayOffset) => void }) {
  const dayAt = (x: number, y: number): DayOffset | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cal-day]");
    return el ? Number(el.dataset.calDay) : null;
  };
  const clamp = (d: number) => Math.min(max, Math.max(end, d));
  return (
    <button
      type="button"
      role="slider"
      aria-label={`${label}。右へ引くか ← → で延長`}
      aria-valuemin={end}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={value > end ? `〜${fmt(value)}（${value - end}日延長）` : `〜${fmt(end)}`}
      title="右へ引くと延長（← → と Enter でも）"
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
      className="absolute right-0 top-1/2 flex h-7 w-6 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-l bg-ai/90 text-white shadow outline-none focus-visible:ring-2 focus-visible:ring-ai/60 pointer-coarse:h-9 pointer-coarse:w-8"
    >
      <ArrowRight size={14} />
    </button>
  );
}

// ---------------------------------------------------------------------------

const RX_GROUPS: PrescriptionOrder["category"][] = ["定期", "臨時", "持参薬", "退院時"];

export function PrescriptionCalendar({ patient, entries, today, nowTime, selectedDay, onSelectDay, onStopDraft, draftedStops, marOf, execute }: CalendarProps) {
  const days = calendarDays(patient);
  const nowAbs = abs(0, nowTime);
  const orders = ordersOf(entries).filter((e) => e.order.type === "prescription");

  return (
    <Frame
      days={days}
      today={today}
      patient={patient}
      selectedDay={selectedDay}
      onSelectDay={onSelectDay}
      note={`✓ は服用の時刻を過ぎたもの、済・未実施は与薬の記録から（記録のない過去の分は架空）。服用の時刻は病棟の約束（朝 8:00・昼 12:00・夕 18:00・眠前 21:00）。頓用は使った時刻を出します。${EXEC_NOTE(execute)}`}
    >
      <tr>
        <th className="sticky left-0 z-[5] border-b border-rule bg-paper px-3 py-1.5 text-left text-[11px] font-normal text-ink-soft">食事（主食・割）</th>
        {days.map((d) => {
          const r = patient.daily.find((x) => x.day === d);
          const text = !r?.meals ? "" : r.meals === "絶食" ? "絶食" : r.meals.map((m) => (m === null ? "−" : m)).join("/");
          return (
            <td key={d} className={`border-b border-l border-rule bg-paper px-1.5 py-1.5 text-center text-[11px] ${text === "絶食" ? "font-bold text-yamabuki" : ""}`}>
              {text}
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
            return (
              <tr key={e.id}>
                <RowHead
                  entry={e}
                  title={oralName(o.drugCode)}
                  lines={[`1回${o.amount}${o.unit}　${timingText(o)}${o.days ? `　${o.days}日分` : ""}`, ...(o.comment ? [o.comment] : [])]}
                  onStopDraft={onStopDraft}
                  drafted={draftedStops.includes(e.id)}
                />
                {days.map((d) => {
                  const c = prescriptionCell(e, d, nowAbs);
                  return (
                    <Cell key={d} day={d}>
                      <div className="flex flex-wrap gap-1">
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
            処方はありません
          </td>
        </tr>
      )}
    </Frame>
  );
}

// ---------------------------------------------------------------------------

const PROC_GROUPS: { title: string; test: (o: ProcedureOrder) => boolean }[] = [
  { title: "酸素・留置", test: (o) => o.schedule.kind === "continuous" },
  { title: "決まった時刻", test: (o) => o.schedule.kind === "per_day" || o.schedule.kind === "every_days" || o.schedule.kind === "once" },
  { title: "必要時", test: (o) => o.schedule.kind === "prn" },
];

export function ProcedureCalendar({ patient, entries, today, nowTime, selectedDay, onSelectDay, onStopDraft, draftedStops, marOf, execute }: CalendarProps) {
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
      note={`決まった時刻の処置は、時刻を過ぎたものを ✓ に、済・未実施は実施の記録から（記録のない過去の分は架空）。時刻は病棟の約束（1日1回 10:00、1日2回 10:00・18:00、1日3回 6:00・14:00・22:00）。必要時の処置は、実施した時刻（架空の記録）を出します。${EXEC_NOTE(execute)}`}
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
              <tr key={e.id}>
                <RowHead entry={e} title={main} lines={[detail]} onStopDraft={onStopDraft} drafted={draftedStops.includes(e.id)} />
                {days.map((d) => {
                  const c = procedureCell(e, d, nowAbs);
                  return (
                    <Cell key={d} day={d}>
                      <div className="flex flex-wrap gap-1">
                        {c.running && (
                          <Chip state={c.running.state}>
                            {o.o2 ? `${o.o2.lpm}L/分` : findProc(o.code)?.name === "膀胱留置カテーテル" ? "留置" : "実施中"}
                            {c.running.from && <span className="opacity-75">{c.running.from}〜</span>}
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
