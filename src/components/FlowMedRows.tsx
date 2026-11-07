"use client";

import { glucoseMark } from "@/lib/flow-observation";
import { FlowOrderedRows, FlowRow } from "./FlowOrderedRows";
import type { FlowLayout } from "@/lib/flow-layout";
import { useState } from "react";
import { displayText } from "@/lib/display-text";
import { WARD_RULES, findDrug } from "@/lib/master";
import { abs } from "@/lib/flowsheet";
import { glucoseDayCell, insulinDoses, medCell, oralSlots, timingsOf, type GlucosePoint, type MedCell } from "@/lib/flow-meds";
import type { AdminRecord } from "@/lib/mar";
import type { DayOffset, DoseTiming, OrderEntry } from "@/lib/types";
import type { FlowZoom } from "./CareFlowRows";
import type { DayBox } from "./FlowDayRows";

const TONE: Record<MedCell["tone"], string> = { done: "text-ink", not: "font-bold text-shu", late: "font-bold text-yamabuki", plan: "text-ink-faint", stop: "font-bold text-shu" };

export interface FlowMar {
  records: Record<string, AdminRecord>;
  sessionStart: number;
}

function Line({ label, sub, labelW, children, onPlot }: { label: string; sub?: string; labelW: number; children?: React.ReactNode; onPlot?: (e: React.MouseEvent<HTMLDivElement>) => void }) {
  return (
    <div className="flex border-b border-rule-soft">
      <div className="shrink-0 py-1 pr-2 text-right text-ink-soft" style={{ width: labelW }}>
        {label}
        {sub && <div className="text-[9px] text-ink-faint">{sub}</div>}
      </div>
      <div className={`relative min-h-6 flex-1 ${onPlot ? "cursor-pointer hover:bg-ai-soft/30" : ""}`} onClick={onPlot}>
        {children}
      </div>
    </div>
  );
}

const at = (x: number) => ({ left: x });
const inZoom = (z: FlowZoom, t: number) => t >= z.lo && t < z.hi;

/**
 * 内服（定時の分）: one row per timing (朝・昼・夕・眠前), each day 済 / 不可 / 未 / 中止 from the 与薬の記録,
 * the drugs and who gave them on touch. Zoomed in, each timing sits at its clock time.
 */
export function FlowOralRows({ orders, mar, nowAbs, days, box, labelW, zoom, onCell }: { orders: OrderEntry[]; mar: FlowMar; nowAbs: number; days: DayOffset[]; box: DayBox; labelW: number; zoom?: FlowZoom; onCell?: (e: React.MouseEvent, timing: DoseTiming, day: DayOffset, at: number) => void }) {
  const Cell = onCell ? "button" : "span";
  const press = (t: DoseTiming, d: DayOffset, time: number) => (onCell ? { type: "button" as const, onClick: (e: React.MouseEvent) => onCell(e, t, d, time) } : {});
  const timings = timingsOf(orders);
  return (
    <>
      {timings.length === 0 && (
        <Line label="" labelW={labelW}>
          <span className="absolute top-1 text-ink-faint">なし</span>
        </Line>
      )}
      {timings.map((t) => (
        <Line key={t} label={t} sub={WARD_RULES.medTimes[t]} labelW={labelW}>
          {days.map((d) => {
            const time = abs(d, WARD_RULES.medTimes[t]);
            if (zoom && !inZoom(zoom, time)) return null;
            const s = oralSlots(orders, d, t, mar.records, mar.sessionStart, nowAbs);
            const c = medCell(s.slots, s.stopped);
            if (!c) return null;
            const b = box(d);
            return zoom ? (
              <Cell key={d} {...press(t, d, time)} title={c.title} className={`absolute top-1 -translate-x-1/2 whitespace-nowrap ${onCell ? "rounded hover:bg-ai-soft" : ""} ${TONE[c.tone]}`} style={at(zoom.xAbs(time))}>
                {displayText(c.text)}
              </Cell>
            ) : (
              <Cell key={d} {...press(t, d, time)} title={c.title} className={`absolute top-1 truncate px-0.5 text-center ${onCell ? "rounded hover:bg-ai-soft" : ""} ${TONE[c.tone]}`} style={{ left: b.left, width: b.width }}>
                {displayText(c.text)}
              </Cell>
            );
          })}
        </Line>
      ))}
      {timings.length > 0 && (
        <p className="pl-[76px] pt-0.5 text-[10px] text-ink-faint">
          与薬の記録から：済＝実施、不可＝未実施、未＝時刻を過ぎて記録がまだ、・＝予定、中止＝その日に中止したオーダ。

        </p>
      )}
    </>
  );
}

/** 血糖 (the values of each day, or each at its time when zoomed in) and one row per insulin order with its doses. */
export function FlowGlucoseRows({ layout, points, insulin, mar, nowAbs, days, box, labelW, xAbs, lo, hi, zoom, onGlucose, onInsulin, limits = { low: 70, high: 300 }, onLimits }: { layout: FlowLayout; limits?: { low: number; high: number }; onLimits?: (v: { low: number; high: number }) => void; onInsulin?: (e: React.MouseEvent<HTMLDivElement>, id: string) => void; points: GlucosePoint[]; insulin: OrderEntry[]; mar: FlowMar; nowAbs: number; days: DayOffset[]; box: DayBox; labelW: number; xAbs: (a: number) => number; lo: number; hi: number; zoom?: FlowZoom; onGlucose?: (e: React.MouseEvent<HTMLDivElement>) => void }) {
  const [limitDraft, setLimitDraft] = useState<{ low: string; high: string } | null>(null);
  const graphMax = Math.max(400, ...points.map(p => Math.ceil(p.value / 100) * 100));
  const thresholds = limitDraft ?? { low: String(limits.low), high: String(limits.high) };
  return (
    <FlowOrderedRows layout={layout}>
      <FlowRow id="glucose.value">{!layout.hidden.includes("glucose.value") && <Line label="血糖" sub="mg/dL" labelW={labelW} onPlot={onGlucose}>
        {zoom
          ? points
              .filter((p) => inZoom(zoom, p.at))
              .map((p) => (
                <span key={`${p.at}-${p.source}`} title={p.title} className={`absolute top-1 -translate-x-1/2 whitespace-nowrap ${glucoseMark(p.value, limits) ? "font-bold text-shu" : "text-ink"}`} style={at(zoom.xAbs(p.at))}>
                  {p.value}{glucoseMark(p.value, limits)}
                </span>
              ))
          : days.map((d) => {
              const c = glucoseDayCell(points, d);
              if (!c) return null;
              const b = box(d);
              return (
                <span key={d} title={c.title} className="absolute top-1 truncate px-0.5 text-center text-ink" style={{ left: b.left, width: b.width }}>
                  {points.filter(p => Math.floor(p.at / 1440) === d).map(p => `${p.value}${glucoseMark(p.value, limits)}`).join("/")}
                </span>
              );
            })}
      </Line>}</FlowRow>
      <FlowRow id="glucose.graph">{!layout.hidden.includes("glucose.graph") && <Line label="血糖グラフ" labelW={labelW} onPlot={onGlucose}>
        <svg width="100%" height={80} role="img" aria-label="血糖 mg/dL の点グラフ"><text x={2} y={10} fontSize={9}>{graphMax}</text><text x={2} y={77} fontSize={9}>0</text>{points.filter(p => p.at >= lo && p.at < hi).map((p, i) => <circle key={i} cx={xAbs(p.at)} cy={74 - p.value / graphMax * 68} r={4} fill={glucoseMark(p.value, limits) ? "#c33c36" : "#2a78d6"}><title>{p.title}</title></circle>)}</svg>
      </Line>}</FlowRow>
      {onLimits && <details className="px-2 py-1 text-xs"><summary>血糖の印</summary><label>低値 &lt; <input aria-label="血糖の低値閾値" type="number" className="w-16 border border-rule" value={thresholds.low} onChange={e => setLimitDraft({ ...thresholds, low: e.target.value })} /></label><label> 高値 &gt; <input aria-label="血糖の高値閾値" type="number" className="w-16 border border-rule" value={thresholds.high} onChange={e => setLimitDraft({ ...thresholds, high: e.target.value })} /></label><button type="button" disabled={!thresholds.low || !thresholds.high || Number(thresholds.low) < 0 || Number(thresholds.high) <= Number(thresholds.low)} onClick={() => { onLimits({ low: Number(thresholds.low), high: Number(thresholds.high) }); setLimitDraft(null); }}>保存</button></details>}
      <FlowRow id="glucose.insulin">{!layout.hidden.includes("glucose.insulin") && <>
      {!insulin.length && <Line label="インスリン" sub="指示なし" labelW={labelW} />}
      {insulin.map((e) => {
        const drug = e.order.type === "injection" ? findDrug(e.order.items[0].drugCode) : undefined;
        return (
          <Line key={e.id} label={drug ? (drug.name) : "インスリン"} sub="インスリン" labelW={labelW} onPlot={onInsulin ? ev => onInsulin(ev, e.id) : undefined}>
            {insulinDoses(e, lo, hi, mar.records, mar.sessionStart, nowAbs).map((x) => (
              <span
                key={x.at}
                title={displayText(`${x.state}${x.record ? ` ${x.record.doneAt} ${x.record.by}${x.record.insulin ? `・${x.record.insulin.units}単位` : ""}` : ""}`)}
                className={`absolute top-1 h-4 min-w-1 text-[10px] text-white -translate-x-1/2 rounded ${x.state === "未実施" ? "bg-shu" : x.state === "未入力" ? "bg-yamabuki" : x.state === "予定" ? "bg-rule" : "bg-ink-soft"}`}
                style={{ left: xAbs(x.at) }}
              >{x.record?.insulin ? `${x.record.insulin.units}単位` : ""}</span>
            ))}
          </Line>
        );
      })}

      </>}</FlowRow>
    </FlowOrderedRows>
  );
}

/* Help migration source (references and dynamic wording):
<span >この画面を開く前の分は前の勤務帯が記録したものとして扱います。時刻は朝 {WARD_RULES.medTimes.朝}・昼 {WARD_RULES.medTimes.昼}・夕 {WARD_RULES.medTimes.夕}・眠前 {WARD_RULES.medTimes.眠前}。</span>
<p >血糖は看護ケア・観察の「血糖測定」とインスリン実施時に入れた値（簡易血糖）、検体検査の Glu を、測った順に並べています。インスリンは注射オーダと与薬の記録から。</p>
*/
