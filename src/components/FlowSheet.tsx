"use client";

import { Copy, ClipboardPaste } from "lucide-react";
import { TabChoice } from "./TabChoice";
import { VITAL_RANGES, vitalsIn, vitalsText, type VitalRange } from "@/lib/vitals-text";
import { useEffect, useRef, useState } from "react";
import { addDays, formatShort, minutesOf, type CalendarDate } from "@/lib/dates";
import { abs, doseTimes, fluidByDay, orderInterval } from "@/lib/flowsheet";
import { durationText, labName, scheduleTextFor } from "@/lib/format";
import { findDrug } from "@/lib/master";
import { news2 } from "@/lib/news2";
import type { DayOffset, HistoryEntry, ImagingOrder, InjectionOrder, OrderEntry, Patient, PhysioOrder, VitalSign } from "@/lib/types";
import type { CareOrder, CareRecord } from "@/lib/care-orders";
import { CareFlowRows } from "./CareFlowRows";
import { ioLines } from "@/lib/io-balance";
import { IoFlowRows, type FlowIo } from "./IoFlowRows";
import type { DietOrder } from "@/lib/diet";
import { examAt } from "@/lib/exams";
import { dietDayCell, mealDiets } from "@/lib/flow-diet";
import { hospitalDayText } from "@/lib/flow-days";
import type { MoveEvent } from "./DietCalendar";
import { FlowDayRows, type FlowDays } from "./FlowDayRows";
import { FlowLabRows } from "./FlowLabRows";
import type { PendingDraw } from "@/lib/lab-table";
import { useFlowPrefs } from "@/lib/flow-prefs";
import { useMe } from "./RoleContext";
import { FlowGlucoseRows, FlowOralRows, type FlowMar } from "./FlowMedRows";
import { glucosePoints, insulinOrders, isGlucoseCare } from "@/lib/flow-meds";
import type { NoteGroupKey } from "@/lib/flow-notes";
import { FlowNoteRows } from "./FlowNoteRows";

// Series colors (validated with the dataviz palette checker against the sheet color):
// temperature blue and pulse red follow the paper temperature-chart convention.
const C_BT = "#2a78d6";
const C_HR = "#e34948";
const C_BP = "#1baf7a";
const GRID = "#ebe4d4";
const SURFACE = "#fffdf7";

const LABEL_W = 76;
const MIN_COL = 64;

export interface FlowSheetProps {
  patient: Patient;
  entries: HistoryEntry[];
  today: CalendarDate;
  nowTime: string;
  selectedDay: DayOffset | null;
  onSelectDay: (d: DayOffset) => void;
  /** Put copied vital-sign lines into the O) of today's note. */
  onInsertVitals?: (text: string) => void;
  /** 看護ケア指示 of this patient and their records, shown as rows under 観察・記録. */
  care?: { orders: CareOrder[]; records: CareRecord[]; sessionStart: number };
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
  onOpenRecord?: (day: DayOffset, kind: NoteGroupKey) => void;
  onWriteNote?: () => void;
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
export function FlowSheet({ patient: p, entries, today, nowTime, selectedDay, onSelectDay, onInsertVitals, care, io, diets = [], moves = [], dayInfo, pendingLabs = [], mar, onOpenRecord, onWriteNote }: FlowSheetProps) {
  const [wrap, width] = useWidth<HTMLDivElement>();
  const me = useMe();
  const [prefs, setPrefs] = useFlowPrefs(me.name);
  const [range, setRange] = useState<VitalRange>("latest");
  const [copied, setCopied] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const days: DayOffset[] = [];
  for (let d = p.admittedOn; d <= 1; d++) days.push(d);
  const plotW = Math.max((width || 600) - LABEL_W, days.length * MIN_COL);
  const colW = plotW / days.length;
  const t0 = p.admittedOn * 1440;
  const xAbs = (a: number) => ((a - t0) / 1440) * colW;
  const x = (day: DayOffset, time: string) => xAbs(abs(day, time));
  /** Where a day's cell sits on the time axis. */
  const dayBox = (d: DayOffset) => ({ left: xAbs(d * 1440), width: xAbs((d + 1) * 1440) - xAbs(d * 1440) });
  const nowAbs = abs(0, nowTime);

  const vitals = p.vitals;
  const orders = entries.filter((e): e is OrderEntry => e.kind === "order");
  const injections = orders.filter((o) => o.order.type === "injection");
  const labs = orders.filter((o) => o.order.type === "lab" && o.status !== "中止");
  const fluid = fluidByDay(orders, days, nowAbs);
  const meals = mealDiets(diets, orders, p.id, days, examTime);
  const marRecs: FlowMar = mar ?? { records: io?.records ?? {}, sessionStart: io?.sessionStart ?? care?.sessionStart ?? nowAbs };
  const glucose = care ? glucosePoints(care.orders, care.records, p.labs) : glucosePoints([], [], p.labs);
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

  const dayBands = (
    <>
      {selectedDay !== null && selectedDay <= 1 && (
        <rect x={(selectedDay - p.admittedOn) * colW} y={0} width={colW} height="100%" fill="#e6ecf6" opacity={0.6} />
      )}
      <rect x={(1 - p.admittedOn) * colW} y={0} width={colW} height="100%" fill="#f5f1e6" opacity={0.7} />
      {days.map((d, i) => (i > 0 ? <line key={d} x1={i * colW} x2={i * colW} y1={0} y2="100%" stroke={GRID} strokeWidth={1} /> : null))}
    </>
  );
  const nowLine = <line x1={xAbs(nowAbs)} x2={xAbs(nowAbs)} y1={0} y2="100%" stroke="#8c8473" strokeWidth={1} />;
  const crosshair = hovered && <line x1={x(hovered.day, hovered.time)} x2={x(hovered.day, hovered.time)} y1={0} y2="100%" stroke="#26221c" strokeWidth={1} opacity={0.5} />;

  return (
    <div ref={wrap} className="scroll-thin min-h-0 flex-1 overflow-auto px-3 pb-24 pt-2">
      <div className="mb-2 flex items-center gap-3 text-[11px] text-ink-faint">
        <span>グラフに触れると、その時刻の値が出ます（キーボードは ← →）。</span>
        <button type="button" onClick={() => setShowTable(!showTable)} className="ml-auto rounded border border-rule px-2 py-0.5 text-ink-soft hover:text-ink">
          {showTable ? "グラフで見る" : "表で見る"}
        </button>
      </div>
      <VitalCopy
        vitals={vitalsIn(vitals, range, nowAbs, selectedDay)}
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

      {showTable ? (
        <VitalTable vitals={vitals} today={today} />
      ) : (
        <div style={{ width: LABEL_W + plotW }} className="nums text-[11px]">
          {/* Date header */}
          <Row label="" sub="病日">
            <div className="relative h-9">
              {days.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  disabled={d > 0}
                  onClick={() => onSelectDay(d)}
                  title={`${formatShort(addDays(today, d))}　入院${hospitalDayText(p.admittedOn, d)}${d === 0 ? "（今日）" : d > 0 ? "（明日・予定）" : ""}`}
                  className={`absolute top-0 flex h-9 flex-col items-center justify-center border-l border-rule-soft text-center ${
                    d === selectedDay ? "bg-ai text-white" : d > 0 ? "text-ink-faint" : d === 0 ? "text-ai hover:bg-sheet" : "hover:bg-sheet"
                  }`}
                  style={{ left: i * colW, width: colW }}
                >
                  <span className="font-bold">{formatShort(addDays(today, d))}</span>
                  <span className={`text-[10px] ${d === selectedDay ? "text-white/80" : "text-ink-faint"}`}>
                    {hospitalDayText(p.admittedOn, d)}
                    {d === 0 && colW >= 84 ? "・今日" : ""}
                  </span>
                </button>
              ))}
            </div>
          </Row>
          <FlowDayRows days={days} box={dayBox} entries={orders} moves={moves} info={dayInfo} labelW={LABEL_W} today={today} admittedOn={p.admittedOn} />

          {/* Vital strips with one shared crosshair */}
          <div
            className="relative outline-none"
            tabIndex={0}
            aria-label="バイタルのグラフ。左右の矢印キーで測定時刻を移動"
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const px = e.clientX - r.left - LABEL_W;
              if (px >= 0) pickNearest(px);
            }}
            onPointerLeave={() => setHover(null)}
            onKeyDown={(e) => {
              if (!vitals.length) return;
              if (e.key === "ArrowRight") setHover((h) => Math.min((h ?? -1) + 1, vitals.length - 1));
              if (e.key === "ArrowLeft") setHover((h) => Math.max((h ?? vitals.length) - 1, 0));
              if (e.key === "Escape") setHover(null);
            }}
          >
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

            {/* Values at each measurement */}
            <PointRow label="呼吸数" vitals={vitals} x={x} value={(v) => (v.rr ? String(v.rr) : "")} />
            <PointRow label="SpO2" vitals={vitals} x={x} value={(v) => (v.spo2 ? `${v.spo2}` : "")} />
            <PointRow label="酸素" vitals={vitals} x={x} value={(v) => (v.o2 && v.o2 !== "室内気" ? v.o2.replace("鼻カニュラ ", "") : "")} />

            {hovered && <Tooltip v={hovered} left={LABEL_W + x(hovered.day, hovered.time)} plotW={plotW} today={today} />}
          </div>

          {/* Daily nursing record */}
          <Section title="観察・記録" />
          <DietRow days={days} colW={colW} cell={(d) => dietDayCell(meals, d)} />
          <DayRow label="食事（割）" days={days} colW={colW} value={(d) => {
            const r = p.daily.find((x) => x.day === d);
            if (!r?.meals) return "";
            if (r.meals === "絶食") return "絶食";
            return r.meals.map((m) => (m === null ? "−" : m)).join("/");
          }} />
          <DayRow label="尿量 mL" sub="0〜24時" days={days} colW={colW} value={(d) => p.daily.find((x) => x.day === d)?.urineMl?.toLocaleString("ja-JP") ?? ""} />
          <DayRow label="便 回" days={days} colW={colW} value={(d) => {
            const s = p.daily.find((x) => x.day === d)?.stools;
            return s === undefined ? "" : String(s);
          }} />
          <DayRow label="体重 kg" days={days} colW={colW} value={(d) => p.daily.find((x) => x.day === d)?.weightKg?.toFixed(1) ?? ""} />
          <DayRow
            label="点滴量 mL"
            sub="オーダから計算"
            days={days}
            colW={colW}
            value={(d) => (fluid[d] ? `${d > 0 ? "（" : ""}${fluid[d].toLocaleString("ja-JP")}${d > 0 ? "）" : ""}` : "")}
          />

          {/* 血糖測定 has its own row with the values (below), so it is not repeated with the care rows. */}
          {care && <CareFlowRows {...care} orders={care.orders.filter((o) => !isGlucoseCare(o))} days={days} colW={colW} labelW={LABEL_W} nowX={xAbs(nowAbs)} nowAbs={nowAbs} />}
          {/* 水分出納: recorded and planned kept apart, one cell per 24 hours from the close */}
          {io && ioRows && <IoFlowRows lines={ioRows} orders={orders} nowAbs={nowAbs} t0={t0} endAbs={2 * 1440} xAbs={xAbs} plotW={plotW} labelW={LABEL_W} standingIo={io.standingIo} />}

          {/* Injections as bars over time */}
          <FlowOralRows orders={orders} mar={marRecs} nowAbs={nowAbs} days={days} box={dayBox} labelW={LABEL_W} />
          <FlowGlucoseRows points={glucose} insulin={insulin} mar={marRecs} nowAbs={nowAbs} days={days} box={dayBox} labelW={LABEL_W} xAbs={xAbs} lo={t0} hi={2 * 1440} />

          <Section title="注射" />
          {injections.length === 0 && <Row label=""><div className="h-6 text-ink-faint">なし</div></Row>}
          {injections.map((e) => (
            <InjectionBar key={e.id} entry={e} xAbs={xAbs} plotW={plotW} nowAbs={nowAbs} endAbs={2 * 1440} startAbs={t0} />
          ))}

          {/* Blood draws */}
          <Section title="検体検査" />
          <Row label="採血・採取">
            <div className="relative h-7">
              {labs.map((e) => {
                const o = e.order;
                if (o.type !== "lab") return null;
                const a = abs(o.collect.day, o.collect.time);
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
          <FlowLabRows patient={p} pending={pendingLabs} orders={orders} nowAbs={nowAbs} days={days} box={dayBox} labelW={LABEL_W} analytes={prefs.analytes} onAnalytes={(codes) => setPrefs((x) => ({ ...x, analytes: codes }))} />
          <FlowNoteRows entries={entries} days={days} box={dayBox} labelW={LABEL_W} onOpen={onOpenRecord} onWrite={onWriteNote} />
          <p className="hint pl-[76px] pt-0.5 text-[10px] text-ink-faint">記録の印（医＝医師、看＝看護師、他＝ほかの職種の記事の数）を押すと、左の「経過」でその日のその記事だけを開きます。</p>
          <p className="mt-2 pl-[76px] text-[10px] text-ink-faint">
            ● 採取済み　○ 予定（印に触れると項目が出ます）。検査値はその日の最後の値で、H（赤）・L（青）はマスターの基準範囲（共用基準範囲・SRL）との比べです。「採取待ち」「検査中」は結果がまだの採血、○ は予定の採血。結果が確定すると自動で入ります。点滴量はオーダから計算した概算で、実測ではありません。食種は食事オーダーから読んでいます（青い枠はその日に食種が変わった日、黄色は検査・外泊などで止めた食事がある日）。<span className="hint">食種に触れると朝・昼・夕が出ます。</span>
          </p>
        </div>
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

function Section({ title }: { title: string }) {
  return <div className="mt-3 border-b border-rule py-1 text-[11px] font-bold text-ink-soft">{title}</div>;
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

function PointRow({ label, vitals, x, value }: { label: string; vitals: VitalSign[]; x: (d: number, t: string) => number; value: (v: VitalSign) => string }) {
  return (
    <Row label={label}>
      <div className="relative h-5">
        {vitals.map((v, i) => (
          <span key={i} className="absolute top-0.5 -translate-x-1/2 whitespace-nowrap text-[10px] text-ink-soft" style={{ left: x(v.day, v.time) }}>
            {value(v)}
          </span>
        ))}
      </div>
    </Row>
  );
}

function DayRow({ label, sub, days, colW, value }: { label: string; sub?: string; days: DayOffset[]; colW: number; value: (d: DayOffset) => string }) {
  return (
    <Row label={label} sub={sub}>
      <div className="relative h-6">
        {days.map((d, i) => (
          <span key={d} className={`absolute top-1 text-center ${d > 0 ? "text-ink-faint" : "text-ink"}`} style={{ left: i * colW, width: colW }}>
            {value(d)}
          </span>
        ))}
      </div>
    </Row>
  );
}

/** 食種: the diet of each day from the diet orders; a change in the day is marked, the meals are on touch. */
function DietRow({ days, colW, cell }: { days: DayOffset[]; colW: number; cell: (d: DayOffset) => ReturnType<typeof dietDayCell> }) {
  return (
    <Row label="食種" sub="食事オーダー">
      <div className="relative h-6">
        {days.map((d, i) => {
          const c = cell(d);
          if (c.empty) return null;
          return (
            <span
              key={d}
              title={c.title}
              className={`absolute top-0.5 truncate rounded-sm px-0.5 text-center leading-5 ${c.held ? "bg-yamabuki-soft text-yamabuki" : c.text.startsWith("絶食") ? "text-yamabuki" : d > 0 ? "text-ink-faint" : "text-ink"} ${c.changed ? "font-bold ring-1 ring-inset ring-ai/50" : ""}`}
              style={{ left: i * colW + 1, width: colW - 2 }}
            >
              {c.text}
            </span>
          );
        })}
      </div>
    </Row>
  );
}

function InjectionBar({ entry, xAbs, plotW, nowAbs, startAbs, endAbs }: { entry: OrderEntry; xAbs: (a: number) => number; plotW: number; nowAbs: number; startAbs: number; endAbs: number }) {
  const o = entry.order as InjectionOrder;
  const { from, to } = orderInterval(entry, nowAbs);
  const x1 = Math.max(0, xAbs(Math.max(from, startAbs)));
  const x2 = Math.min(plotW, xAbs(Math.min(to ?? endAbs, endAbs)));
  const stopped = entry.status === "中止";
  const ticks = doseTimes(entry, nowAbs, startAbs, endAbs);
  const main = o.items[0];
  const title = `${o.items.map((it) => `${findDrug(it.drugCode)?.name ?? it.drugCode} ${it.amount}${it.unit}`).join(" ＋ ")}　${o.route} ${scheduleTextFor(o)}${
    o.minutesPerDose ? ` 1回${durationText(o.minutesPerDose)}` : ""
  }${o.rateMlPerH ? ` ${o.rateMlPerH}mL/時` : ""}${stopped ? "（中止）" : ""}`;
  return (
    <Row label={shortDrug(main.drugCode)}>
      <div className="relative h-6" title={title}>
        <span
          className="absolute top-2.5 h-1 rounded-full"
          style={{ left: x1, width: Math.max(2, x2 - x1), background: stopped ? "#b9b09c" : "#5f584b" }}
        />
        {ticks.map((t) => (
          <span key={t} className="absolute top-1 h-4 w-0.5 -translate-x-1/2 rounded" style={{ left: xAbs(t), background: t > nowAbs ? "#b9b09c" : "#5f584b" }} />
        ))}
        {stopped && (
          <span className="absolute top-0.5 -translate-x-1/2 text-[10px] font-bold text-shu" style={{ left: x2 + 10 }}>
            中止
          </span>
        )}
        {!stopped && to === null && (
          <span className="absolute top-0.5 text-[10px] text-ink-faint" style={{ left: Math.min(plotW - 12, x2 - 12) }}>
            →
          </span>
        )}
      </div>
    </Row>
  );
}

function Tooltip({ v, left, plotW, today }: { v: VitalSign; left: number; plotW: number; today: CalendarDate }) {
  const flip = left > plotW * 0.6;
  const rows: [string, string, string | undefined][] = [
    [C_BT, "体温", v.bt !== undefined ? `${v.bt.toFixed(1)}℃` : undefined],
    [C_HR, "脈拍", v.hr !== undefined ? `${v.hr}/分` : undefined],
    [C_BP, "血圧", v.sbp !== undefined ? `${v.sbp}/${v.dbp}` : undefined],
    ["transparent", "呼吸数", v.rr !== undefined ? `${v.rr}/分` : undefined],
    ["transparent", "SpO2", v.spo2 !== undefined ? `${v.spo2}%（${v.o2 ?? "室内気"}）` : undefined],
  ];
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-2 z-10 rounded-md border border-rule bg-sheet px-2.5 py-1.5 shadow-lg"
      style={flip ? { right: `calc(100% - ${left - 12}px)` } : { left: left + 12 }}
    >
      <div className="mb-1 text-[10px] text-ink-faint">
        {formatShort(addDays(today, v.day))} {v.time}
      </div>
      {rows.map(([color, name, val]) =>
        val ? (
          <div key={name} className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: color }} />
            <b className="text-[12px] text-ink">{val}</b>
            <span className="text-[10px] text-ink-faint">{name}</span>
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
      {vitals.length > 0 ? <pre className="nums mt-1 whitespace-pre-wrap font-sans text-[11px] text-ink-soft">{text}</pre> : <p className="mt-1 text-[11px] text-ink-faint">この範囲の測定はありません。</p>}
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
