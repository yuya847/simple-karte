"use client";

import { FlowInlineEntry } from "./FlowInlineEntry";
import { FlowObservationAdder } from "./FlowObservationAdder";
import { observationOrder } from "@/lib/flow-observation";
import { jcsText, gcsText } from "@/lib/consciousness";
import { FlowOrderedRows, FlowRow } from "./FlowOrderedRows";
import { orderedRows, careRowKey } from "@/lib/flow-layout";
import { displayText } from "@/lib/display-text";
import { StandingMeasurements, type StandingMeasurementSource } from "./StandingMeasurements";

import { Check, ChevronLeft, ChevronRight, Copy, ClipboardPaste, Printer, Rows3 } from "lucide-react";
import { vitalsPasteText } from "@/lib/lab-paste";
import { TabChoice } from "./TabChoice";
import { VITAL_RANGES, vitalsIn, vitalsText, type VitalRange } from "@/lib/vitals-text";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { addDays, formatShort, minutesOf, type CalendarDate } from "@/lib/dates";
import { abs, doseTimes, fluidByDay, orderInterval } from "@/lib/flowsheet";
import { durationText, labName, scheduleTextFor } from "@/lib/format";
import { findDrug } from "@/lib/master";
import { news2 } from "@/lib/news2";
import type { DayOffset, HistoryEntry, ImagingOrder, InjectionOrder, OrderEntry, Patient, PhysioOrder, VitalSign } from "@/lib/types";
import type { CareOrder, CareRecord } from "@/lib/care-orders";
import { CareFlowRows } from "./CareFlowRows";
import { ioLines } from "@/lib/io-balance";
import { IoFlowRows, IoHeading, type FlowIo } from "./IoFlowRows";
import type { DietOrder } from "@/lib/diet";
import { examAt } from "@/lib/exams";
import { dietDayCell, mealDiets, mealText, type MealDiet } from "@/lib/flow-diet";
import { FLOW_SCALES, anchorFor, canStep, daysIn, flowWindow, stepAnchor, type FlowScale, type FlowWindow } from "@/lib/flow-scale";
import type { FlowZoom } from "./CareFlowRows";
import { hospitalDayText } from "@/lib/flow-days";
import type { MoveEvent } from "./DietCalendar";
import { FlowDayRows, type DayBox, type FlowDays } from "./FlowDayRows";
import { FlowLabRows } from "./FlowLabRows";
import type { PendingDraw } from "@/lib/lab-table";
import { useFlowPrefs } from "@/lib/flow-prefs";
import { useDeny, useMe } from "./RoleContext";
import { ENTRY_ACTION, ENTRY_LABEL, cellWindow, timeAtX, type FlowEntry } from "@/lib/flow-entry";
import { timedOral } from "@/lib/flow-meds";
import { FlowCellMenu, type CellAction } from "./FlowCellMenu";
import { FlowStickyLane } from "./FlowStickyLane";
import { notesIn, type GraphNote } from "@/lib/flow-stickies";
import { FlowGlucoseRows, FlowOralRows, type FlowMar } from "./FlowMedRows";
import { glucosePoints,insulinOrders,isGlucoseCare } from "@/lib/flow-meds";
import { nursingNotesByTime, type NoteGroupKey } from "@/lib/flow-notes";
import { FlowNoteRows, WriteNoteButton } from "./FlowNoteRows";
import { FlowGroup, FlowLayoutPanel } from "./FlowLayoutPanel";
import { FLOW_GROUPS, careShown, groupOrder, groupShown, type FlowGroupKey, type FlowLayout } from "@/lib/flow-layout";

// Series colors (validated with the dataviz palette checker against the sheet color):
// temperature blue and pulse red follow the paper temperature-chart convention.
const C_BT = "#2a78d6";
const C_HR = "#e34948";
const C_BP = "#1baf7a";
const GRID = "#ebe4d4";
const SURFACE = "#fffdf7";

const LABEL_W = 76;
/** The sheet's width on A4 landscape (297 mm − margins, at 96 px an inch). */
const PRINT_W = 1000;

const clock = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

/** "11/2（月）〜11/4（水）", "11/4（水） 日勤 8:30〜17:00", "11/4（水） 10:00〜11:00". */
function windowLabel(w: FlowWindow, today: CalendarDate): string {
  const dayOf = (t: number) => formatShort(addDays(today, Math.floor(t / 1440)));
  const lastDay = Math.floor((w.hi - 1) / 1440);
  if (w.byDay || w.scale === "3d") return `${dayOf(w.lo)}〜${formatShort(addDays(today, lastDay))}`;
  if (w.scale === "1d") return dayOf(w.lo);
  if (w.scale === "shift") return `${dayOf(w.lo)} ${w.shift === "day" ? "日勤" : "夜勤"} ${clock(w.lo)}〜${w.shift === "night" ? "翌" : ""}${clock(w.hi)}`;
  return `${dayOf(w.lo)} ${clock(w.lo)}〜${clock(w.hi)}`;
}

export interface FlowSheetProps {
  standingMeasurements?: StandingMeasurementSource;
  patient: Patient;
  entries: HistoryEntry[];
  today: CalendarDate;
  nowTime: string;
  selectedDay: DayOffset | null;
  onSelectDay: (d: DayOffset) => void;
  /** Put copied vital-sign lines into the O) of today's note. */
  onInsertVitals?: (text: string) => void;
  /** 看護ケア指示 of this patient and their records, shown as rows under 観察・記録. */
  care?: { orders: CareOrder[]; records: CareRecord[]; sessionStart: number; onAdd?: (o: CareOrder) => void; onLimits?: (id: string, limits: { low: number; high: number }) => void; onRecord?: (r: CareRecord) => void; onVoid?: (r: CareRecord, reason: string) => void };
  /** 水分出納 (IN/OUT) rows. */
  io?: FlowIo;
  /** 食事オーダー, for the 食種 row. */
  diets?: DietOrder[];
  /** 移動 (入院・転床・転棟・転科・外泊・外出・退院) on the days, as on the 移動・食事 calendar. */
  moves?: MoveEvent[];
  /** 術後日数 and the days a person chose to count from. */
  dayInfo?: FlowDays;
  /** Draws of this patient without a result yet (採取待ち・検査中), for the lab rows. */
  pendingLabs?: PendingDraw[];
  /** 与薬の記録 (MAR) for the 内服 and insulin rows (else those of the IN/OUT). */
  mar?: FlowMar;
  /** Open a day of 経過 with one kind of note (the 記録 marks), and start a note on the right. */
  onOpenRecord?: (day: DayOffset, kind: NoteGroupKey, noteId?: string) => void;
  onWriteNote?: () => void;
  /** The scale to open on (入院から when not given). */
  initialScale?: FlowScale;
  /** The scale kept outside (the chart), so the left tab and the sheet's own window show the same zoom. */
  scale?: FlowScale;
  onScale?: (s: FlowScale) => void;
  /** Open the chart's own entry for a pressed cell (バイタル・看護ケア・水分出納・与薬・指示受け). */
  onEntry?: (req: FlowEntry) => void;
  onSaveVital?: (v: VitalSign) => void;
  /** Orders of this patient a nurse has not taken yet (指示受け). */
  untaken?: string[];
  /** Printed as 温度板 (for the audit log). */
  onPrint?: () => void;
  /** 付箋 on the graph, putting one (the 記事 permission) and taking off one's own. */
  graphNotes?: GraphNote[];
  onAddNote?: (n: { at: number; text: string }) => void;
  onRemoveNote?: (id: string) => void;
}

const examTime = (e: OrderEntry) => examAt(e.order as ImagingOrder | PhysioOrder, abs(e.day, e.time));

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const shortDrug = (code: string) => {
  const d = findDrug(code);
  return d ? (d.aliases[0] ?? d.name) : code;
};

/**
 * Flow sheet: vital signs as aligned strips on one time axis (no shared multi-scale plot),
 * then nursing records, injections as bars over time, and blood draws.
 */
export function FlowSheet({ standingMeasurements, patient: p, entries, today, nowTime, selectedDay, onSelectDay, onInsertVitals, care, io, diets = [], moves = [], dayInfo, pendingLabs = [], mar, onOpenRecord, onWriteNote, initialScale = "all", scale: scaleProp, onScale, onEntry: externalEntry, onSaveVital, untaken = [], onPrint, graphNotes = [], onAddNote, onRemoveNote }: FlowSheetProps) {
  const [inlineReq, setInlineReq] = useState<FlowEntry | null>(null);
  const onEntry = externalEntry ? (req: FlowEntry) => {
    if ((req.kind === "vitals" && onSaveVital) || (req.kind === "io" && io?.onAdd) || (req.kind === "care" && care?.onRecord && care?.onVoid)) setInlineReq(req);
    else externalEntry(req);
  } : undefined;
  const [wrap, width] = useWidth<HTMLDivElement>();
  const me = useMe();
  const [prefs, setPrefs] = useFlowPrefs(me.name);
  const [range, setRange] = useState<VitalRange>("latest");
  const [copied, setCopied] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const nowAbs = abs(0, nowTime);
  // 表示期間: 入院から (one column a day) unless a person chooses another; `anchor` null follows now.
  const [ownScale, setOwnScale] = useState<FlowScale>(initialScale);
  const scale = scaleProp ?? ownScale;
  const setScale = (s: FlowScale) => {
    setOwnScale(s);
    onScale?.(s);
  };
  const [anchor, setAnchor] = useState<number | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  // 温度板の印刷: the period shown, drawn at the width of A4 landscape while the print dialog is open.
  const [printing, setPrinting] = useState(false);
  const print = () => {
    flushSync(() => {
      setPrinting(true);
      setHover(null);
      setMenu(null);
    });
    const done = () => {
      setPrinting(false);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
    onPrint?.();
  };
  // A pressed cell with more than one entry (or one this person may not make) shows its choices.
  const deny = useDeny();
  const [menu, setMenu] = useState<{ x: number; y: number; title: string; reqs: FlowEntry[]; extra?: CellAction[] } | null>(null);
  const [noteDraft, setNoteDraft] = useState<number | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const win = flowWindow(scale, anchor ?? nowAbs, p.admittedOn);
  const { lo: t0, hi: t1 } = win;

  const days: DayOffset[] = daysIn(win);
  const plotW = printing ? PRINT_W - LABEL_W : Math.max((width || 600) - LABEL_W, win.minWidth);
  const xAbs = (a: number) => ((a - t0) / (t1 - t0)) * plotW;
  const x = (day: DayOffset, time: string) => xAbs(abs(day, time));
  /** Where a day's cell sits on the time axis (cut to the window). */
  const dayBox = (d: DayOffset) => {
    const l = Math.max(0, xAbs(d * 1440));
    return { left: l, width: Math.max(0, Math.min(plotW, xAbs((d + 1) * 1440)) - l) };
  };
  const inWin = (a: number) => a >= t0 && a <= t1;
  /** Zoomed in, the rows put each item at its time. */
  const zoom = win.byDay ? undefined : { lo: t0, hi: t1, xAbs };
  const nowIn = inWin(nowAbs);

  const vitals = p.vitals.filter((v) => inWin(abs(v.day, v.time)));
  const orders = entries.filter((e): e is OrderEntry => e.kind === "order");
  const injections = orders.filter((o) => o.order.type === "injection");
  const labs = orders.filter((o) => o.order.type === "lab" && o.status !== "中止");
  const fluid = fluidByDay(orders, days, nowAbs);
  const meals = mealDiets(diets, orders, p.id, days, examTime);
  const marRecs: FlowMar = mar ?? { records: io?.records ?? {}, sessionStart: io?.sessionStart ?? care?.sessionStart ?? nowAbs };
  const glucose = glucosePoints(care?.orders ?? [], care?.records ?? [], p.labs, Object.values(marRecs.records).filter(r=>r.patientId === p.id));
  const insulin = insulinOrders(orders);
  const ioRows = io ? ioLines({ patientId: p.id, entries: orders, typed: io.typed, records: io.records, sessionStart: io.sessionStart, nowAbs, from: t0 - 1440 }) : null;

  const hovered = hover === null ? null : vitals[hover];

  const pickNearest = (px: number) => {
    let best = 0;
    let bestD = Infinity;
    vitals.forEach((v, i) => {
      const d = Math.abs(x(v.day, v.time) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(vitals.length ? best : null);
  };

  const band = (d: DayOffset, fill: string, opacity: number) => {
    if (!days.includes(d)) return null;
    const b = dayBox(d);
    return <rect x={b.left} y={0} width={b.width} height="100%" fill={fill} opacity={opacity} />;
  };
  const dayBands = (
    <>
      {selectedDay !== null && selectedDay <= 1 && band(selectedDay, "#e6ecf6", 0.6)}
      {band(1, "#f5f1e6", 0.7)}
      {win.ticks.map((t) => (t.at > t0 && t.at < t1 ? <line key={t.at} x1={xAbs(t.at)} x2={xAbs(t.at)} y1={0} y2="100%" stroke={t.major ? "#d9cfba" : GRID} strokeWidth={1} /> : null))}
      {/* 付箋: a dashed line at its time through the strips */}
      {notesIn(graphNotes, t0, t1).map((n) => (
        <line key={n.id} x1={xAbs(n.at)} x2={xAbs(n.at)} y1={0} y2="100%" stroke="#9a6512" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
      ))}
    </>
  );
  const nowLine = nowIn ? <line x1={xAbs(nowAbs)} x2={xAbs(nowAbs)} y1={0} y2="100%" stroke="#8c8473" strokeWidth={1} /> : null;
  const crosshair = hovered && <line x1={x(hovered.day, hovered.time)} x2={x(hovered.day, hovered.time)} y1={0} y2="100%" stroke="#26221c" strokeWidth={1} opacity={0.5} />;

  // 行の設定 (kept per user in this browser): groups, hidden rows, folded groups, sets of care rows.
  // セルから入力: the chart's own entries, opened with the row and the time of the cell.
  const fmtAt = (a: number) => `${formatShort(addDays(today, Math.floor(a / 1440)))} ${clock(a)}`;
  // `direct`: one choice this person may make opens at once (the graph always asks first: a touch there also shows values).
  const press = (e: React.MouseEvent, title: string, reqs: FlowEntry[], direct = true) => {
    if (!onEntry || !reqs.length) return;
    e.stopPropagation();
    if (direct && reqs.length === 1 && !deny(ENTRY_ACTION[reqs[0].kind])) return onEntry(reqs[0]);
    setMenu({ x: e.clientX, y: e.clientY, title, reqs });
  };
  /** The time under the pointer on the axis (not cut to now). */
  const timeOf = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return t0 + ((e.clientX - r.left) / plotW) * (t1 - t0);
  };
  const untakenSet = new Set(untaken);
  const takeReq = (ids: string[]): FlowEntry => ({ kind: "take", orderIds: ids });
  const glucoseItem = care?.orders.find(isGlucoseCare)?.item;

  const layout = prefs.layout;
  const setLayout = (l: FlowLayout) => setPrefs((x) => ({ ...x, layout: l }));
  const show = (k: string) => !layout.hidden.includes(k);
  const careOrders = care ? orderedRows(care.orders.filter((o) => !isGlucoseCare(o)).map(o => ({ ...o, key: careRowKey(o.item) })), layout) : [];
  const careItems = [...new Set(careOrders.map((o) => o.item))];

  const groups: Record<FlowGroupKey, { show: boolean; extra?: React.ReactNode; body: React.ReactNode }> = {
    vitals: {
      show: true,
      body: (
        <>
        {/* 付箋 at their time, above the strips */}
        {/* Vital strips with one shared crosshair */}
        <div
          className="relative outline-none"
          tabIndex={0}
          aria-label="バイタルのグラフ。左右の矢印キーで測定時刻を移動"
          onPointerMove={(e) => {
            // Over the values box: keep it (so its copy button can be pressed).
            if ((e.target as HTMLElement).closest?.("[data-vital-tip]")) return;
            const r = e.currentTarget.getBoundingClientRect();
            const px = e.clientX - r.left - LABEL_W;
            if (px >= 0) pickNearest(px);
          }}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest?.("[data-vital-tip]")) return;
            const r = e.currentTarget.getBoundingClientRect();
            const px = e.clientX - r.left - LABEL_W;
            if (px < 0 || (!onEntry && !onAddNote)) return;
            const at = timeAtX(px, plotW, t0, t1, nowAbs);
            // The graph always asks first (a touch there also shows the values): バイタル, or a 付箋 at that time.
            setMenu({ x: e.clientX, y: e.clientY, title: `${fmtAt(at)}`, reqs: onEntry ? [{ kind: "vitals", at }] : [], extra: onAddNote ? [{ label: "この時刻に付箋を貼る", onClick: () => setNoteDraft(at) }] : [] });
          }}
          onKeyDown={(e) => {
            if (!vitals.length) return;
            if (e.key === "ArrowRight") setHover((h) => Math.min((h ?? -1) + 1, vitals.length - 1));
            if (e.key === "ArrowLeft") setHover((h) => Math.max((h ?? vitals.length) - 1, 0));
            if (e.key === "Escape") setHover(null);
            if ((e.metaKey || e.ctrlKey) && e.key === "c" && hover !== null && vitals[hover]) void navigator.clipboard?.writeText(vitalText(vitals[hover], today));
          }}
        >
          <FlowOrderedRows layout={layout}><FlowRow key="vitals.notes" id="vitals.notes">        {(graphNotes.length > 0 || onAddNote) && show("vitals.notes") && (
          <FlowStickyLane notes={notesIn(graphNotes, t0, t1)} xAbs={xAbs} lo={t0} hi={t1} plotW={plotW} labelW={LABEL_W} meName={me.name} fmtAt={fmtAt} draftAt={noteDraft} defaultAt={Math.min(t1, Math.max(t0, nowAbs))} onDraft={setNoteDraft} onAdd={onAddNote} onRemove={onRemoveNote} />
        )}
</FlowRow><FlowRow key="vitals.bt" id="vitals.bt">{show("vitals.bt") && (
            <Strip label="体温" unit="℃" color={C_BT} height={96} domain={[35, 41]} ticks={[36, 37, 38, 39, 40]} plotW={plotW}>
              {(y) => (
                <>
                  {dayBands}
                  {nowLine}
                  {crosshair}
                  <Series points={vitals.filter((v) => v.bt !== undefined).map((v) => [x(v.day, v.time), y(v.bt!)])} color={C_BT} />
                  <EndLabel vitals={vitals} pick={(v) => v.bt?.toFixed(1)} x={x} y={(v) => y(v.bt!)} />
                </>
              )}
            </Strip>
          )}</FlowRow>
          <FlowRow key="vitals.hr" id="vitals.hr">{show("vitals.hr") && (
            <Strip label="脈拍" unit="/分" color={C_HR} height={72} domain={[40, 160]} ticks={[60, 80, 100, 120, 140]} plotW={plotW}>
              {(y) => (
                <>
                  {dayBands}
                  {nowLine}
                  {crosshair}
                  <Series points={vitals.filter((v) => v.hr !== undefined).map((v) => [x(v.day, v.time), y(v.hr!)])} color={C_HR} />
                  <EndLabel vitals={vitals} pick={(v) => String(v.hr)} x={x} y={(v) => y(v.hr!)} />
                </>
              )}
            </Strip>
          )}</FlowRow>
          <FlowRow key="vitals.bp" id="vitals.bp">{show("vitals.bp") && (
            <Strip label="血圧" unit="mmHg" color={C_BP} height={84} domain={[60, 180]} ticks={[80, 100, 120, 140, 160]} plotW={plotW}>
              {(y) => (
                <>
                  {dayBands}
                  {nowLine}
                  {crosshair}
                  {vitals
                    .filter((v) => v.sbp !== undefined && v.dbp !== undefined)
                    .map((v, i) => {
                      const cx = x(v.day, v.time);
                      return (
                        <g key={i} stroke={C_BP} strokeWidth={2} strokeLinecap="round">
                          <line x1={cx} x2={cx} y1={y(v.sbp!)} y2={y(v.dbp!)} />
                          <line x1={cx - 4} x2={cx + 4} y1={y(v.sbp!)} y2={y(v.sbp!)} />
                          <line x1={cx - 4} x2={cx + 4} y1={y(v.dbp!)} y2={y(v.dbp!)} />
                        </g>
                      );
                    })}
                </>
              )}
            </Strip>
          )}</FlowRow>

          {/* Values at each measurement */}
          <FlowRow key="vitals.rr" id="vitals.rr">{show("vitals.rr") && <PointRow label="呼吸数" vitals={vitals} x={x} value={(v) => (v.rr ? String(v.rr) : "")} />}</FlowRow>
          <FlowRow key="vitals.spo2" id="vitals.spo2">{show("vitals.spo2") && <PointRow label="SpO2" vitals={vitals} x={x} value={(v) => (v.spo2 ? `${v.spo2}` : "")} />}</FlowRow>
          <FlowRow key="vitals.o2" id="vitals.o2">{show("vitals.o2") && <PointRow label="酸素" vitals={vitals} x={x} value={(v) => (v.o2 && v.o2 !== "室内気" ? v.o2.replace("鼻カニュラ ", "") : "")} />}</FlowRow>
          <FlowRow id="vitals.acvpu">{show("vitals.acvpu") && <PointRow label="ACVPU" vitals={vitals} x={x} value={v => v.avpu ?? ""} />}</FlowRow>
          <FlowRow id="vitals.jcs">{show("vitals.jcs") && <PointRow label="JCS" vitals={vitals} x={x} value={jcsText} />}</FlowRow>
          <FlowRow id="vitals.gcs">{show("vitals.gcs") && <PointRow label="GCS" vitals={vitals} x={x} value={gcsText} />}</FlowRow>
          {/* NEWS2 from each set of vitals (code, RCP 2017): ＊ when a part is missing, bold red at 5 or more or a single 3. */}
          <FlowRow key="vitals.news2" id="vitals.news2">{show("vitals.news2") && (
            <PointRow
              label="NEWS2"
              vitals={vitals}
              x={x}
              value={(v) => {
                const s = news2(v);
                return s.missing.length === s.parts.length ? "" : `${s.total}${s.missing.length ? "＊" : ""}`;
              }}
              tone={(v) => {
                const s = news2(v);
                return s.total >= 5 || s.red ? "font-bold text-shu" : s.total >= 1 ? "text-ink" : "";
              }}
            />
          )}</FlowRow>

          <FlowRow key="vitals.nursing" id="vitals.nursing">{show("vitals.nursing") && <div className="flex border-b border-rule-soft">
            <div className="shrink-0 py-1 pr-2 text-right text-ink-soft" style={{ width: LABEL_W }}>看護記録</div>
            <div className="relative flex-1" style={{ minHeight: 28 }}>
              {days.flatMap((d) => nursingNotesByTime(entries, d)).filter((n) => inWin(abs(n.day, n.time))).map((n, i) => (
                <button key={n.key} type="button" disabled={!onOpenRecord} title={n.full} aria-label={`${n.time} ${n.summary}を経過で開く`}
                  onClick={() => onOpenRecord?.(n.day, "nurse", n.key)}
                  className="relative block truncate rounded border border-wakatake/40 bg-sheet px-1 text-left text-[10px] text-wakatake hover:bg-paper"
                  style={{ marginLeft: Math.max(0, x(n.day, n.time)), maxWidth: Math.max(40, plotW - Math.max(0, x(n.day, n.time))) }} data-nursing-note={i}>{n.summary || "看護記録"}</button>
              ))}
            </div>
          </div>}</FlowRow>

          </FlowOrderedRows>
          {hovered && <Tooltip v={hovered} left={LABEL_W + x(hovered.day, hovered.time)} plotW={plotW} today={today} />}
        </div>
        </>
      ),
    },
    obs: {
      show: true,
      body: (
        <>
          <FlowOrderedRows layout={layout}><FlowRow key="obs.diet" id="obs.diet">{show("obs.diet") && <DietRow days={days} box={dayBox} cell={(d) => dietDayCell(meals, d)} meals={meals} zoom={zoom} />}</FlowRow>
          <FlowRow key="obs.meals" id="obs.meals">{show("obs.meals") && (
            <DayRow
              label="食事（割）"
              days={days}
              box={dayBox}
              value={(d) => {
                const r = p.daily.find((x) => x.day === d);
                if (!r?.meals) return "";
                if (r.meals === "絶食") return "絶食";
                return r.meals.map((m, i) => `${m === null ? "−" : m}${r.mealSides ? `・${r.mealSides[i] ?? "−"}` : ""}`).join("/");
              }}
            />
          )}</FlowRow>
          <FlowRow key="obs.urine" id="obs.urine">{show("obs.urine") && <DayRow label="尿量 mL" sub="0〜24時" days={days} box={dayBox} value={(d) => p.daily.find((x) => x.day === d)?.urineMl?.toLocaleString("ja-JP") ?? ""} />}</FlowRow>
          <FlowRow key="obs.stools" id="obs.stools">{show("obs.stools") && (
            <DayRow
              label="便 回"
              days={days}
              box={dayBox}
              value={(d) => {
                const s = p.daily.find((x) => x.day === d)?.stools;
                return s === undefined ? "" : String(s);
              }}
            />
          )}</FlowRow>
          <FlowRow key="obs.weight" id="obs.weight">{show("obs.weight") && <DayRow label="体重 kg" days={days} box={dayBox} value={(d) => p.daily.find((x) => x.day === d)?.weightKg?.toFixed(1) ?? ""} />}</FlowRow>
          <FlowRow key="obs.fluid" id="obs.fluid">{show("obs.fluid") && <DayRow label="点滴量 mL" sub="オーダから計算" days={days} box={dayBox} value={(d) => (fluid[d] ? `${d > 0 ? "（" : ""}${fluid[d].toLocaleString("ja-JP")}${d > 0 ? "）" : ""}` : "")} />}</FlowRow>
          </FlowOrderedRows>
        </>
      ),
    },
    care: {
      show: !!care,
      extra: care?.onAdd && !deny("mar") ? <FlowObservationAdder patientId={p.id} nowTime={nowTime} onAdd={care.onAdd} /> : layout.activeSet ? <span className="font-normal text-ai">セット「{layout.activeSet}」の行だけ</span> : undefined,
      // 血糖測定 has its own row with the values (血糖・インスリン), so it is not repeated with the care rows.
      body: care && <CareFlowRows {...care} orders={careOrders} days={days} box={dayBox} labelW={LABEL_W} nowX={nowIn ? xAbs(nowAbs) : null} nowAbs={nowAbs} zoom={zoom} shown={(item) => careShown(layout, item)} onCell={onEntry ? (e, item, d, at) => press(e, `${item}（${at === null ? formatShort(addDays(today, d)) : fmtAt(at)}）`, [{ kind: "care", item, ...cellWindow(d, at) }]) : undefined} />,
    },
    io: {
      show: !!(io && ioRows),
      extra: io ? <><IoHeading byTime={!win.byDay} standingIo={io.standingIo} />{onEntry && !deny("vitals") && <button type="button" className="rounded border border-rule px-2 py-1" onClick={() => onEntry({ kind: "io", at: nowAbs })}>入力</button>}</> : undefined,
      // 水分出納: recorded and planned kept apart, one cell per 24 hours from the close.
      body: io && ioRows && (
        <div
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = e.clientX - r.left - LABEL_W;
            // The rows only (not the note under them).
            if (px < 0 || !onEntry || (e.target as HTMLElement).closest("p")) return;
            const at = timeAtX(px, plotW, t0, t1, nowAbs);
            press(e, `${fmtAt(at)} の水分出納`, [{ kind: "io", at }]);
          }}
          className={onEntry ? "cursor-pointer" : ""}
        >
          <IoFlowRows layout={layout} lines={ioRows} orders={orders} nowAbs={nowAbs} t0={t0} endAbs={t1} xAbs={xAbs} plotW={plotW} labelW={LABEL_W} standingIo={io.standingIo} byTime={!win.byDay} />
        </div>
      ),
    },
    oral: { show: true, extra: <span className="font-normal text-ink-faint">定期・持参薬など、時刻の決まった分</span>, body: (
        <FlowOralRows
          orders={orders}
          mar={marRecs}
          nowAbs={nowAbs}
          days={days}
          box={dayBox}
          labelW={LABEL_W}
          zoom={zoom}
          onCell={
            onEntry
              ? (e, timing, d, at) => {
                  const ids = timedOral(orders)
                    .filter((x) => x.order.type === "prescription" && x.order.timings.includes(timing))
                    .map((x) => x.id);
                  const title = `${formatShort(addDays(today, d))} ${timing}（${clock(at)}）の内服`;
                  const waiting = ids.filter((id) => untakenSet.has(id));
                  press(e, title, [{ kind: "mar", orderIds: ids, lo: at, hi: at + 1, label: title }, ...(waiting.length ? [takeReq(waiting)] : [])]);
                }
              : undefined
          }
        />
      ),
    },
    glucose: {
      show: true,
      body: (
        <FlowGlucoseRows
          layout={layout}
          limits={care?.orders.find(isGlucoseCare)?.glucoseLimits}
          onLimits={care?.onLimits && glucoseItem && !deny("mar") ? limits => care.onLimits?.(care.orders.find(isGlucoseCare)!.id, limits) : undefined}
          onInsulin={onEntry ? (e, id) => { const at = timeOf(e); const d = Math.floor(at / 1440); press(e, "インスリンの実施", [{ kind: "mar", orderIds: [id], ...cellWindow(d, win.byDay ? null : at), label: "インスリン" }]); } : undefined}
          points={glucose}
          insulin={insulin}
          mar={marRecs}
          nowAbs={nowAbs}
          days={days}
          box={dayBox}
          labelW={LABEL_W}
          xAbs={xAbs}
          lo={t0}
          hi={t1}
          zoom={zoom}
          onGlucose={
            onEntry && (glucoseItem || care?.onAdd)
              ? (e) => {
                  const at = Math.min(nowAbs, timeOf(e));
                  const d = Math.floor(at / 1440);
                  const item = glucoseItem ?? "血糖測定（簡易血糖測定器）";
                  if (!glucoseItem) care?.onAdd?.(observationOrder({ id: crypto.randomUUID(), item, inputKind: "number", unit: "mg/dL", schedule: { kind: "prn" }, patientId: p.id, by: me.name, time: clock(at).padStart(5, "0"), day: d }));
                  press(e, `${item}（${win.byDay ? formatShort(addDays(today, d)) : fmtAt(at)}）`, [{ kind: "care", item, ...cellWindow(d, win.byDay ? null : at) }, ...(insulin.length ? [{ kind: "mar" as const, orderIds: insulin.map(o => o.id), ...cellWindow(d, win.byDay ? null : at), label: "血糖・インスリン" }] : [])]);
                }
              : undefined
          }
        />
      ),
    },
    inj: {
      show: true,
      // Injections as bars over time.
      body: (
        <>
          {injections.length === 0 && (
            <Row label="">
              <div className="h-6 text-ink-faint">なし</div>
            </Row>
          )}
          {injections.map((e) => (
            <InjectionBar
              key={e.id}
              entry={e}
              xAbs={xAbs}
              plotW={plotW}
              nowAbs={nowAbs}
              endAbs={t1}
              startAbs={t0}
              untaken={untakenSet.has(e.id)}
              onTake={onEntry ? (ev) => press(ev, `${shortDrug((e.order as InjectionOrder).items[0].drugCode)} の指示受け`, [takeReq([e.id])]) : undefined}
              onPress={
                onEntry
                  ? (ev) => {
                      const at = timeOf(ev);
                      const d = Math.floor(at / 1440);
                      const w = cellWindow(d, win.byDay ? null : at);
                      const title = `${shortDrug((e.order as InjectionOrder).items[0].drugCode)}（${win.byDay ? formatShort(addDays(today, d)) : fmtAt(at)}）`;
                      press(ev, title, [{ kind: "mar", orderIds: [e.id], ...w, label: `${title}の実施` }, ...(untakenSet.has(e.id) ? [takeReq([e.id])] : [])]);
                    }
                  : undefined
              }
            />
          ))}
        </>
      ),
    },
    lab: {
      show: true,
      body: (
        <>
          <Row label="採血・採取">
            <div className="relative h-7">
              {labs.map((e) => {
                const o = e.order;
                if (o.type !== "lab") return null;
                const a = abs(o.collect.day, o.collect.time);
                if (!inWin(a)) return null;
                const done = a <= nowAbs;
                return (
                  <span
                    key={e.id}
                    title={`${formatShort(addDays(today, o.collect.day))} ${o.collect.time}　${o.codes.map(labName).join("、")}${done ? "" : "（予定）"}`}
                    className="absolute top-1.5 h-3 w-3 -translate-x-1/2 rounded-full border-2"
                    style={{ left: xAbs(a), borderColor: "#5f584b", background: done ? "#5f584b" : SURFACE, boxShadow: `0 0 0 2px ${SURFACE}` }}
                  />
                );
              })}
            </div>
          </Row>
          <FlowLabRows patient={p} pending={pendingLabs} orders={orders} nowAbs={nowAbs} days={days} box={dayBox} labelW={LABEL_W} analytes={prefs.analytes} onAnalytes={(codes) => setPrefs((x) => ({ ...x, analytes: codes }))} zoom={zoom} />
        </>
      ),
    },
    notes: { show: true, extra: onWriteNote ? <WriteNoteButton onWrite={onWriteNote} /> : undefined, body: <FlowNoteRows entries={entries} days={days} box={dayBox} labelW={LABEL_W} onOpen={onOpenRecord} zoom={zoom} /> },
  };

  // The sheet itself: on the screen, and the same on paper (温度板) when printing.
  const sheet = (
    <div style={{ width: LABEL_W + plotW }} className="nums text-[11px]">
      {/* Date header */}
      <Row label="" sub="病日">
        <div className={`relative ${win.byDay ? "h-9" : "h-12"}`}>
          {days.map((d) => {
            const b = dayBox(d);
            return (
              <button
                key={d}
                type="button"
                disabled={d > 0 || d < p.admittedOn}
                onClick={() => onSelectDay(d)}
                title={displayText(`${formatShort(addDays(today, d))}　入院${hospitalDayText(p.admittedOn, d)}${d === 0 ? "（今日）" : d > 0 ? "（明日・予定）" : ""}`)}
                className={`absolute top-0 flex h-9 flex-col items-center justify-center overflow-hidden border-l border-rule-soft text-center ${
                  d === selectedDay && !printing ? "bg-ai text-white" : d > 0 || d < p.admittedOn ? "text-ink-faint" : d === 0 ? "text-ai hover:bg-sheet" : "hover:bg-sheet"
                }`}
                style={{ left: b.left, width: b.width }}
              >
                <span className="whitespace-nowrap font-bold">{formatShort(addDays(today, d))}</span>
                <span className={`whitespace-nowrap text-[10px] ${d === selectedDay && !printing ? "text-white/80" : "text-ink-faint"}`}>
                  {displayText(hospitalDayText(p.admittedOn, d))}
                  {d === 0 && b.width >= 84 ? "・今日" : ""}
                </span>
              </button>
            );
          })}
          {!win.byDay &&
            win.ticks.map((t) =>
              t.label ? (
                <span key={t.at} className={`absolute top-9 -translate-x-1/2 whitespace-nowrap text-[10px] ${t.major ? "font-bold text-ink-soft" : "text-ink-faint"}`} style={{ left: Math.min(plotW - 8, Math.max(8, xAbs(t.at))) }}>
                  {t.label}
                </span>
              ) : null,
            )}
        </div>
      </Row>
      <FlowDayRows days={days} box={dayBox} entries={orders} moves={moves} info={dayInfo} labelW={LABEL_W} today={today} admittedOn={p.admittedOn} />

      {/* The groups in the order the person chose (行の設定), each can be folded. */}
      {groupOrder(layout.order)
        .filter((k) => groupShown(layout, k) && groups[k].show)
        .map((k) => (
          <FlowGroup key={k} id={k} title={FLOW_GROUPS.find((g) => g.key === k)!.title} layout={layout} onLayout={setLayout} extra={groups[k].extra}>
            {groups[k].body}
            {!printing && inlineReq && ((k === "vitals" && inlineReq.kind === "vitals") || (k === "io" && inlineReq.kind === "io") || ((k === "care" || k === "glucose") && inlineReq.kind === "care" && (k === "glucose" ? /血糖/.test(inlineReq.item) : !/血糖/.test(inlineReq.item)))) && <FlowInlineEntry key={JSON.stringify(inlineReq)} req={inlineReq} patient={p} entries={orders} today={today} nowTime={nowTime} care={care} io={io} onSaveVital={onSaveVital} onClose={() => setInlineReq(null)} />}
          </FlowGroup>
        ))}


      <p className="text-xs text-ink-faint">点滴量は概算です。</p>
    </div>
  );

  return (
    <div ref={wrap} className="scroll-thin min-h-0 flex-1 overflow-auto px-3 pb-24 pt-2">
      <div className="mb-2 flex items-center gap-3 text-[11px] text-ink-faint">
        <span>グラフに触れると、その時刻の値が出ます（キーボードは ← →）。</span>
        <button type="button" onClick={() => setShowTable(!showTable)} className="ml-auto rounded border border-rule px-2 py-0.5 text-ink-soft hover:text-ink">
          {showTable ? "グラフで見る" : "表で見る"}
        </button>
      </div>
      <StandingMeasurements source={standingMeasurements} day={selectedDay ?? 0} />
      <VitalCopy
        vitals={vitalsIn(p.vitals, range, nowAbs, selectedDay)}
        today={today}
        range={range}
        onRange={(r) => {
          setRange(r);
          setCopied(null);
        }}
        dayLabel={selectedDay === null ? null : formatShort(addDays(today, selectedDay))}
        copied={copied}
        onCopied={setCopied}
        onInsert={onInsertVitals}
      />

      {!showTable && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
          <b className="text-ink-soft">表示</b>
          <TabChoice
            label="表示期間と時間の目盛り"
            options={FLOW_SCALES.map((s) => ({ value: s.key, label: s.label, title: s.title }))}
            value={scale}
            onChange={(s) => {
              setScale(s);
              setAnchor(anchorFor(selectedDay, nowAbs));
            }}
          />
          {scale !== "all" && (
            <>
              <button type="button" disabled={!canStep(win, -1, p.admittedOn)} onClick={() => setAnchor(stepAnchor(win, anchor ?? nowAbs, -1, p.admittedOn))} aria-label="前へ" className="flex items-center rounded border border-rule px-1.5 py-0.5 text-ink-soft hover:text-ink disabled:opacity-40">
                <ChevronLeft size={13} />前
              </button>
              <button type="button" onClick={() => setAnchor(null)} className={`rounded border px-2 py-0.5 ${anchor === null ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule text-ink-soft hover:text-ink"}`}>
                いま
              </button>
              <button type="button" disabled={!canStep(win, 1, p.admittedOn)} onClick={() => setAnchor(stepAnchor(win, anchor ?? nowAbs, 1, p.admittedOn))} aria-label="次へ" className="flex items-center rounded border border-rule px-1.5 py-0.5 text-ink-soft hover:text-ink disabled:opacity-40">
                次<ChevronRight size={13} />
              </button>
            </>
          )}
          <span className="nums text-ink-soft">{windowLabel(win, today)}</span>
          <button type="button" onClick={() => setConfigOpen((v) => !v)} aria-expanded={configOpen} className={`ml-auto flex items-center gap-1 rounded border px-2 py-0.5 ${configOpen ? "border-ai text-ai" : "border-rule text-ink-soft hover:text-ink"}`}>
            <Rows3 size={12} />
            行の設定
          </button>
          <button type="button" onClick={print} title="いま出している期間と行を、A4横・カラーで印刷します" className="flex items-center gap-1 rounded border border-ai px-2 py-0.5 text-ai hover:bg-ai hover:text-white">
            <Printer size={12} />
            温度板を印刷（A4横）
          </button>
        </div>
      )}
      {!showTable && configOpen && <FlowLayoutPanel layout={layout} onLayout={setLayout} careItems={careItems} onClose={() => setConfigOpen(false)} />}
      {!showTable && untaken.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-yamabuki/50 bg-yamabuki-soft/40 px-2 py-1 text-[11px]">
          <b className="text-yamabuki">指示受けがまだのオーダ {untaken.length}件</b>
          <span className="text-ink-soft">（注射の行に「未受」）</span>
          {onEntry && (
            <button type="button" onClick={(e) => press(e, "指示受け", [takeReq([])])} className="rounded border border-yamabuki px-2 py-0.5 font-bold text-yamabuki hover:bg-yamabuki hover:text-white">
              指示受けを開く
            </button>
          )}
        </div>
      )}

      {menu && <FlowCellMenu at={menu} title={menu.title} actions={[...menu.reqs.map((r) => ({ label: ENTRY_LABEL[r.kind], disabled: deny(ENTRY_ACTION[r.kind]), onClick: () => onEntry?.(r) })), ...(menu.extra ?? [])]} onClose={closeMenu} />}
      {showTable ? <VitalTable vitals={p.vitals} today={today} /> : sheet}
      {printing &&
        createPortal(
          <div className="print-sheet print-color hidden bg-white p-[4mm] text-ink print:block">
            <div className="mb-1.5 flex items-baseline gap-4 border-b-2 border-ink pb-1 text-[10pt]">
              <b className="text-[13pt]">温度板（経過表）</b>
              <span>
                {p.name}（{p.id}）{p.sex} {p.age}歳　{p.room}　{p.department}　主治医 {p.attending}
              </span>
              <span>入院 {formatShort(addDays(today, p.admittedOn))}</span>
              <b>{windowLabel(win, today)}</b>
              <span className="ml-auto">
                印刷 {formatShort(today)} {nowTime} {me.name}
              </span>
            </div>
            {sheet}
          </div>,
          document.body,
        )}
    </div>
  );
}

function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex border-b border-rule-soft">
      <div className="shrink-0 py-1 pr-2 text-right text-ink-soft" style={{ width: LABEL_W }}>
        {label}
        {sub && <div className="text-[9px] text-ink-faint">{sub}</div>}
      </div>
      <div className="relative flex-1">{children}</div>
    </div>
  );
}

function Strip({
  label,
  unit,
  color,
  height,
  domain,
  ticks,
  plotW,
  children,
}: {
  label: string;
  unit: string;
  color: string;
  height: number;
  domain: [number, number];
  ticks: number[];
  plotW: number;
  children: (y: (v: number) => number) => React.ReactNode;
}) {
  const pad = 6;
  const y = (v: number) => pad + (1 - (v - domain[0]) / (domain[1] - domain[0])) * (height - pad * 2);
  return (
    <div className="flex border-b border-rule-soft">
      <div className="relative shrink-0" style={{ width: LABEL_W, height }}>
        {/* Title on the left, tick values on the right, so they never overlap. */}
        <div className="absolute left-1 top-1 text-left">
          <div className="flex items-center gap-1 font-bold text-ink">
            <span className="inline-block h-0.5 w-2.5 rounded" style={{ background: color }} />
            {label}
          </div>
          <div className="pl-3.5 text-[9px] text-ink-faint">{unit}</div>
        </div>
        {ticks.map((t) => (
          <span key={t} className="absolute right-1.5 -translate-y-1/2 text-[9px] text-ink-faint" style={{ top: y(t) }}>
            {t}
          </span>
        ))}
      </div>
      <svg width={plotW} height={height} className="block overflow-visible">
        {ticks.map((t) => (
          <line key={t} x1={0} x2={plotW} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
        ))}
        {children(y)}
      </svg>
    </div>
  );
}

function Series({ points, color }: { points: [number, number][]; color: string }) {
  if (points.length === 0) return null;
  return (
    <g>
      <polyline points={points.map((p) => p.join(",")).join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={4} fill={color} stroke={SURFACE} strokeWidth={2} />
      ))}
    </g>
  );
}

function EndLabel({ vitals, pick, x, y }: { vitals: VitalSign[]; pick: (v: VitalSign) => string | undefined; x: (d: number, t: string) => number; y: (v: VitalSign) => number }) {
  const last = [...vitals].reverse().find((v) => pick(v) !== undefined);
  if (!last) return null;
  return (
    <text x={x(last.day, last.time) + 8} y={y(last) + 4} fontSize={11} fontWeight={700} fill="#26221c" stroke={SURFACE} strokeWidth={3} paintOrder="stroke">
      {pick(last)}
    </text>
  );
}

function PointRow({ label, vitals, x, value, tone }: { label: string; vitals: VitalSign[]; x: (d: number, t: string) => number; value: (v: VitalSign) => string; tone?: (v: VitalSign) => string }) {
  return (
    <Row label={label}>
      <div className="relative h-5">
        {vitals.map((v, i) => (
          <span key={i} className={`absolute top-0.5 -translate-x-1/2 whitespace-nowrap text-[10px] ${tone?.(v) || "text-ink-soft"}`} style={{ left: x(v.day, v.time) }}>
            {value(v)}
          </span>
        ))}
      </div>
    </Row>
  );
}

function DayRow({ label, sub, days, box, value }: { label: string; sub?: string; days: DayOffset[]; box: DayBox; value: (d: DayOffset) => string }) {
  return (
    <Row label={label} sub={sub}>
      <div className="relative h-6">
        {days.map((d) => {
          const b = box(d);
          return (
            <span key={d} className={`absolute top-1 truncate text-center ${d > 0 ? "text-ink-faint" : "text-ink"}`} style={{ left: b.left, width: b.width }}>
              {value(d)}
            </span>
          );
        })}
      </div>
    </Row>
  );
}

/**
 * 食種: the diet of each day from the diet orders; a change in the day is marked, the meals are on touch.
 * Zoomed in, each meal sits at its serving time.
 */
function DietRow({ days, box, cell, meals, zoom }: { days: DayOffset[]; box: DayBox; cell: (d: DayOffset) => ReturnType<typeof dietDayCell>; meals: MealDiet[]; zoom?: FlowZoom }) {
  return (
    <Row label="食種" sub="食事オーダー">
      <div className="relative h-6">
        {zoom
          ? meals
              .filter((m) => m.at >= zoom.lo && m.at < zoom.hi && (m.order || m.holds.length))
              .map((m) => (
                <span
                  key={m.at}
                  title={displayText(`${m.meal}：${m.holds.length ? `${mealText(m)}（${m.holds.map((h) => h.label).join("、")}）` : m.label}`)}
                  className={`absolute top-0.5 -translate-x-1/2 whitespace-nowrap rounded-sm px-0.5 leading-5 ${m.holds.length ? "bg-yamabuki-soft text-yamabuki" : m.order?.kind === "絶食" ? "text-yamabuki" : "text-ink"}`}
                  style={{ left: zoom.xAbs(m.at) }}
                >
                  {m.meal} {displayText(mealText(m))}
                </span>
              ))
          : days.map((d) => {
              const c = cell(d);
              if (c.empty) return null;
              const b = box(d);
              return (
                <span
                  key={d}
                  title={c.title}
                  className={`absolute top-0.5 truncate rounded-sm px-0.5 text-center leading-5 ${c.held ? "bg-yamabuki-soft text-yamabuki" : c.text.startsWith("絶食") ? "text-yamabuki" : d > 0 ? "text-ink-faint" : "text-ink"} ${c.changed ? "font-bold ring-1 ring-inset ring-ai/50" : ""}`}
                  style={{ left: b.left + 1, width: Math.max(0, b.width - 2) }}
                >
                  {displayText(c.text)}
                </span>
              );
            })}
      </div>
    </Row>
  );
}

function InjectionBar({ entry, xAbs, plotW, nowAbs, startAbs, endAbs, untaken, onTake, onPress }: { entry: OrderEntry; xAbs: (a: number) => number; plotW: number; nowAbs: number; startAbs: number; endAbs: number; untaken?: boolean; onTake?: (e: React.MouseEvent) => void; onPress?: (e: React.MouseEvent<HTMLDivElement>) => void }) {
  const o = entry.order as InjectionOrder;
  const { from, to } = orderInterval(entry, nowAbs);
  const x1 = Math.max(0, xAbs(Math.max(from, startAbs)));
  const x2 = Math.min(plotW, xAbs(Math.min(to ?? endAbs, endAbs)));
  // The order runs at some time of the period shown.
  const shown = from < endAbs && (to === null || to > startAbs);
  const stopped = entry.status === "中止";
  const ticks = doseTimes(entry, nowAbs, startAbs, endAbs);
  const main = o.items[0];
  const title = `${o.items.map((it) => `${findDrug(it.drugCode)?.name ?? it.drugCode} ${it.amount}${it.unit}`).join(" ＋ ")}　${o.route} ${scheduleTextFor(o)}${
    o.minutesPerDose ? ` 1回${durationText(o.minutesPerDose)}` : ""
  }${o.rateMlPerH ? ` ${o.rateMlPerH}mL/時` : ""}${stopped ? "（中止）" : ""}`;
  return (
    <div className="flex border-b border-rule-soft">
      <div className="flex shrink-0 items-start justify-end gap-1 py-1 pr-2 text-right text-ink-soft" style={{ width: LABEL_W }}>
        {untaken && (
          <button type="button" disabled={!onTake} onClick={onTake} title="指示受けがまだのオーダ" className="rounded bg-yamabuki-soft px-0.5 text-[9px] font-bold leading-4 text-yamabuki">
            未受
          </button>
        )}
        <span className="min-w-0 truncate">{shortDrug(main.drugCode)}</span>
      </div>
      <div className={`relative h-6 flex-1 ${onPress ? "cursor-pointer hover:bg-ai-soft/30" : ""}`} title={title} onClick={onPress}>
        {shown && (
          <span
            className="absolute top-2.5 h-1 rounded-full"
            style={{ left: x1, width: Math.max(2, x2 - x1), background: stopped ? "#b9b09c" : "#5f584b" }}
          />
        )}
        {ticks.map((t) => (
          <span key={t} className="absolute top-1 h-4 w-0.5 -translate-x-1/2 rounded" style={{ left: xAbs(t), background: t > nowAbs ? "#b9b09c" : "#5f584b" }} />
        ))}
        {shown && stopped && to !== null && to <= endAbs && (
          <span className="absolute top-0.5 -translate-x-1/2 text-[10px] font-bold text-shu" style={{ left: Math.min(plotW - 12, x2 + 10) }}>
            中止
          </span>
        )}
        {shown && !stopped && to === null && (
          <span className="absolute top-0.5 text-[10px] text-ink-faint" style={{ left: Math.min(plotW - 12, x2 - 12) }}>
            →
          </span>
        )}
      </div>
    </div>
  );
}

/** One measurement as text for a note or a letter (the same form as 「ばいたる」). */
function vitalText(v: VitalSign, today: CalendarDate): string {
  return vitalsPasteText({ vitals: [v] }, today) ?? "";
}

function Tooltip({ v, left, plotW, today }: { v: VitalSign; left: number; plotW: number; today: CalendarDate }) {
  const flip = left > plotW * 0.6;
  const [copied, setCopied] = useState(false);
  const rows: [string, string, string | undefined][] = [
    ["transparent", "JCS", jcsText(v) || undefined],
    ["transparent", "GCS", gcsText(v) || undefined],
    [C_BT, "体温", v.bt !== undefined ? `${v.bt.toFixed(1)}℃` : undefined],
    [C_HR, "脈拍", v.hr !== undefined ? `${v.hr}/分` : undefined],
    [C_BP, "血圧", v.sbp !== undefined ? `${v.sbp}/${v.dbp}` : undefined],
    ["transparent", "呼吸数", v.rr !== undefined ? `${v.rr}/分` : undefined],
    ["transparent", "SpO2", v.spo2 !== undefined ? `${v.spo2}%（${v.o2 ?? "室内気"}）` : undefined],
  ];
  return (
    <div
      role="status"
      data-vital-tip
      className="absolute top-2 z-10 rounded-md border border-rule bg-sheet px-2.5 py-1.5 shadow-lg"
      style={flip ? { right: `calc(100% - ${left - 12}px)` } : { left: left + 12 }}
    >
      <div className="mb-1 flex items-center gap-2 text-[10px] text-ink-faint">
        {formatShort(addDays(today, v.day))} {v.time}
        <button
          type="button"
          aria-label="この測定値をコピー"
          title={copied ? "コピーしました" : "コピー（⌘C）"}
          onClick={(e) => {
            e.stopPropagation();
            void navigator.clipboard?.writeText(vitalText(v, today)).then(() => setCopied(true));
          }}
          className={`ml-auto rounded p-0.5 hover:bg-paper ${copied ? "text-wakatake" : "text-ink-faint hover:text-ink"}`}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
      {rows.map(([color, name, val]) =>
        val ? (
          <div key={name} className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: color }} />
            <b className="text-[12px] text-ink">{val}</b>
            <span className="text-[10px] text-ink-faint">{displayText(name)}</span>
          </div>
        ) : null,
      )}
    </div>
  );
}

function VitalTable({ vitals, today }: { vitals: VitalSign[]; today: CalendarDate }) {
  const sorted = [...vitals].sort((a, b) => a.day - b.day || minutesOf(a.time) - minutesOf(b.time));
  return (
    <table className="nums w-full border-collapse text-[12px]">
      <thead>
        <tr className="border-b border-rule text-[11px] text-ink-faint">
          <th className="py-1 text-left font-normal">日時</th>
          <th className="py-1 text-right font-normal">体温</th>
          <th className="py-1 text-right font-normal">脈拍</th>
          <th className="py-1 text-right font-normal">血圧</th>
          <th className="py-1 text-right font-normal">呼吸数</th>
          <th className="py-1 text-right font-normal">SpO2</th>
          <th className="py-1 pl-3 text-left font-normal">酸素</th>
          <th>ACVPU</th><th>JCS</th><th>GCS</th>
          <th className="py-1 pl-3 text-right font-normal" title="NEWS2（RCP 2017）をコードで計算">NEWS2</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((v, i) => (
          <tr key={i} className="border-b border-rule-soft">
            <td className="py-1">
              {formatShort(addDays(today, v.day))} {v.time}
            </td>
            <td className="py-1 text-right">{v.bt?.toFixed(1)}</td>
            <td className="py-1 text-right">{v.hr}</td>
            <td className="py-1 text-right">
              {v.sbp}/{v.dbp}
            </td>
            <td className="py-1 text-right">{v.rr}</td>
            <td className="py-1 text-right">{v.spo2}</td>
            <td className="py-1 pl-3">{v.o2}</td>
            <td>{v.avpu}</td><td>{jcsText(v)}</td><td>{gcsText(v)}</td>
            <td className={`py-1 pl-3 text-right ${news2(v).total >= 5 || news2(v).red ? "font-bold text-shu" : ""}`}>
              {news2(v).total}
              {news2(v).missing.length ? "＊" : ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Copy the vital signs of a range as text (to paste anywhere), or put them straight into O) of the note. */
function VitalCopy({ vitals, today, range, onRange, dayLabel, copied, onCopied, onInsert }: { vitals: VitalSign[]; today: CalendarDate; range: VitalRange; onRange: (r: VitalRange) => void; dayLabel: string | null; copied: string | null; onCopied: (m: string | null) => void; onInsert?: (text: string) => void }) {
  const text = vitalsText(vitals, today);
  const copy = () => {
    const done = `${vitals.length}件をコピーしました。記事などに貼り付けられます`;
    if (copyText(text)) return onCopied(done);
    // Fall back to the Clipboard API; it may wait for permission, so do not wait forever.
    const failed = () => onCopied("コピーできませんでした。下の文を選んでコピーしてください");
    if (!navigator.clipboard) return failed();
    const timer = setTimeout(failed, 1500);
    navigator.clipboard.writeText(text).then(
      () => {
        clearTimeout(timer);
        onCopied(done);
      },
      () => {
        clearTimeout(timer);
        failed();
      },
    );
  };
  return (
    <div className="mb-2 rounded-md border border-rule bg-sheet px-2 py-1.5 text-[12px]">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-ink-soft">バイタルをコピー</b>
        <TabChoice label="コピーする範囲" options={VITAL_RANGES.map((r) => ({ ...r, label: r.value === "day" ? `選んだ日${dayLabel ? `（${dayLabel}）` : ""}` : r.label, disabled: r.value === "day" && !dayLabel, title: r.value === "day" && !dayLabel ? "上の日付を押して日を選ぶ" : undefined }))} value={range} onChange={onRange} />
        <button type="button" disabled={!vitals.length} onClick={copy} className="flex items-center gap-1 rounded border border-ai px-2 py-0.5 text-ai hover:bg-ai hover:text-white disabled:opacity-40">
          <Copy size={12} />
          コピー
        </button>
        {onInsert && (
          <button
            type="button"
            disabled={!vitals.length}
            onClick={() => {
              onInsert(text);
              onCopied(`${vitals.length}件を記事の O) に入れました`);
            }}
            className="flex items-center gap-1 rounded border border-rule px-2 py-0.5 text-ink-soft hover:text-ink disabled:opacity-40"
          >
            <ClipboardPaste size={12} />
            記事の O) に入れる
          </button>
        )}
        {copied && <span className="text-wakatake">{copied}</span>}
      </div>
      {vitals.length > 0 ? <pre className="nums mt-1 whitespace-pre-wrap font-sans text-[11px] text-ink-soft">{displayText(text)}</pre> : <p className="mt-1 text-[11px] text-ink-faint">この範囲の測定はありません。</p>}
    </div>
  );
}

/**
 * Copy through a hidden text box, inside the click itself. This works in every browser here,
 * including Safari on iPad, and never waits for a permission prompt.
 */
function copyText(text: string): boolean {
  const back = document.activeElement as HTMLElement | null;
  const t = document.createElement("textarea");
  t.value = text;
  t.setAttribute("readonly", "");
  Object.assign(t.style, { position: "fixed", top: "0", left: "-9999px", fontSize: "16px" });
  document.body.appendChild(t);
  t.select();
  t.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  t.remove();
  back?.focus();
  return ok;
}

/* Help migration source (references and dynamic wording):
<p >記録の印（医＝医師、看＝看護師、他＝ほかの職種の記事の数）を押すと、左の「経過」でその日のその記事だけを開きます。</p>
<span >食種に触れると朝・昼・夕が出ます。</span>
<p >
          セルを押すと、その行とその時刻の入力が開きます：グラフはバイタルか付箋（付箋の行を押しても貼れます）、看護ケア・観察と血糖はその記録、水分出納は IN/OUT、内服と注射は実施（与薬の記録）、「未受」は指示受け。入れたものはワークシートや右のツールで入れたものと同じところに残ります。
        </p>
*/

/* ヘルプへ移動した説明:
● 採取済み ○ 予定（印に触れると項目が出ます）。検査値はその日の最後の値で、H（赤）・L（青）はマスターの基準範囲（共用基準範囲・SRL）との比べです。「採取待ち」「検査中」は結果がまだの採血、○ は予定の採血。結果が確定すると自動で入ります。点滴量はオーダから計算した概算で、実測ではありません。食種は食事オーダーから読んでいます（青い枠はその日に食種が変わった日、黄色は検査・外泊などで止めた食事がある日）。
*/
