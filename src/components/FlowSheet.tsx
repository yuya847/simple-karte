"use client";

import { useEffect, useRef, useState } from "react";
import { addDays, formatShort, hospitalDay, minutesOf, type CalendarDate } from "@/lib/dates";
import { abs, doseTimes, fluidByDay, orderInterval } from "@/lib/flowsheet";
import { durationText, labName, scheduleTextFor } from "@/lib/format";
import { findDrug } from "@/lib/master";
import type { DayOffset, HistoryEntry, InjectionOrder, OrderEntry, Patient, VitalSign } from "@/lib/types";

// Series colors (validated with the dataviz palette checker against the sheet color):
// temperature blue and pulse red follow the paper temperature-chart convention.
const C_BT = "#2a78d6";
const C_HR = "#e34948";
const C_BP = "#1baf7a";
const GRID = "#ebe4d4";
const SURFACE = "#fffdf7";

const LABEL_W = 76;
const MIN_COL = 64;

interface Props {
  patient: Patient;
  entries: HistoryEntry[];
  today: CalendarDate;
  nowTime: string;
  selectedDay: DayOffset | null;
  onSelectDay: (d: DayOffset) => void;
}

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
export function FlowSheet({ patient: p, entries, today, nowTime, selectedDay, onSelectDay }: Props) {
  const [wrap, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const days: DayOffset[] = [];
  for (let d = p.admittedOn; d <= 1; d++) days.push(d);
  const plotW = Math.max((width || 600) - LABEL_W, days.length * MIN_COL);
  const colW = plotW / days.length;
  const t0 = p.admittedOn * 1440;
  const xAbs = (a: number) => ((a - t0) / 1440) * colW;
  const x = (day: DayOffset, time: string) => xAbs(abs(day, time));
  const nowAbs = abs(0, nowTime);

  const vitals = p.vitals;
  const orders = entries.filter((e): e is OrderEntry => e.kind === "order");
  const injections = orders.filter((o) => o.order.type === "injection");
  const labs = orders.filter((o) => o.order.type === "lab" && o.status !== "中止");
  const fluid = fluidByDay(orders, days, nowAbs);

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

      {showTable ? (
        <VitalTable vitals={vitals} today={today} />
      ) : (
        <div style={{ width: LABEL_W + plotW }} className="nums text-[11px]">
          {/* Date header */}
          <Row label="">
            <div className="relative h-9">
              {days.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  disabled={d > 0}
                  onClick={() => onSelectDay(d)}
                  className={`absolute top-0 flex h-9 flex-col items-center justify-center border-l border-rule-soft text-center ${
                    d === selectedDay ? "bg-ai text-white" : d > 0 ? "text-ink-faint" : "hover:bg-sheet"
                  }`}
                  style={{ left: i * colW, width: colW }}
                >
                  <span className="font-bold">{formatShort(addDays(today, d))}</span>
                  <span className={`text-[10px] ${d === selectedDay ? "text-white/80" : "text-ink-faint"}`}>
                    {d === 0 ? "今日" : d > 0 ? "予定" : `${hospitalDay(p.admittedOn, d)}日目`}
                  </span>
                </button>
              ))}
            </div>
          </Row>

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
          <DayRow label="食事（割）" days={days} colW={colW} value={(d) => {
            const r = p.daily.find((x) => x.day === d);
            if (!r?.meals) return "";
            if (r.meals === "絶食") return "絶食";
            return r.meals.map((m) => (m === null ? "−" : m)).join("/");
          }} />
          <DayRow label="尿量 mL" days={days} colW={colW} value={(d) => p.daily.find((x) => x.day === d)?.urineMl?.toLocaleString("ja-JP") ?? ""} />
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

          {/* Injections as bars over time */}
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
          <p className="mt-2 pl-[76px] text-[10px] text-ink-faint">
            ● 採取済み　○ 予定（印に触れると項目が出ます）。点滴量はオーダから計算した概算で、実測ではありません。
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
          </tr>
        ))}
      </tbody>
    </table>
  );
}
