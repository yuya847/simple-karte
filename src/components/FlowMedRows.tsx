"use client";

import { WARD_RULES, findDrug } from "@/lib/master";
import { glucoseDayCell, insulinDoses, medCell, oralSlots, timingsOf, type GlucosePoint, type MedCell } from "@/lib/flow-meds";
import type { AdminRecord } from "@/lib/mar";
import type { DayOffset, OrderEntry } from "@/lib/types";
import type { DayBox } from "./FlowDayRows";

const TONE: Record<MedCell["tone"], string> = { done: "text-ink", not: "font-bold text-shu", late: "font-bold text-yamabuki", plan: "text-ink-faint", stop: "font-bold text-shu" };

export interface FlowMar {
  records: Record<string, AdminRecord>;
  sessionStart: number;
}

function Line({ label, sub, labelW, children }: { label: string; sub?: string; labelW: number; children: React.ReactNode }) {
  return (
    <div className="flex border-b border-rule-soft">
      <div className="shrink-0 py-1 pr-2 text-right text-ink-soft" style={{ width: labelW }}>
        {label}
        {sub && <div className="text-[9px] text-ink-faint">{sub}</div>}
      </div>
      <div className="relative min-h-6 flex-1">{children}</div>
    </div>
  );
}

/**
 * 内服（定時の分）: one row per timing (朝・昼・夕・眠前), each day 済 / 不可 / 未 / 中止 from the 与薬の記録,
 * the drugs and who gave them on touch.
 */
export function FlowOralRows({ orders, mar, nowAbs, days, box, labelW }: { orders: OrderEntry[]; mar: FlowMar; nowAbs: number; days: DayOffset[]; box: DayBox; labelW: number }) {
  const timings = timingsOf(orders);
  return (
    <>
      <div className="mt-3 border-b border-rule py-1 text-[11px] font-bold text-ink-soft">内服（定期・持参薬など、時刻の決まった分）</div>
      {timings.length === 0 && (
        <Line label="" labelW={labelW}>
          <span className="absolute top-1 text-ink-faint">なし</span>
        </Line>
      )}
      {timings.map((t) => (
        <Line key={t} label={t} sub={WARD_RULES.medTimes[t]} labelW={labelW}>
          {days.map((d) => {
            const s = oralSlots(orders, d, t, mar.records, mar.sessionStart, nowAbs);
            const c = medCell(s.slots, s.stopped);
            if (!c) return null;
            const b = box(d);
            return (
              <span key={d} title={c.title} className={`absolute top-1 truncate px-0.5 text-center ${TONE[c.tone]}`} style={{ left: b.left, width: b.width }}>
                {c.text}
              </span>
            );
          })}
        </Line>
      ))}
      {timings.length > 0 && (
        <p className="pl-[76px] pt-0.5 text-[10px] text-ink-faint">
          与薬の記録から：済＝実施、不可＝未実施、未＝時刻を過ぎて記録がまだ、・＝予定、中止＝その日に中止したオーダ。この画面を開く前の分は前の勤務帯が記録したものとして扱います（架空）。時刻は朝 {WARD_RULES.medTimes.朝}・昼 {WARD_RULES.medTimes.昼}・夕 {WARD_RULES.medTimes.夕}・眠前 {WARD_RULES.medTimes.眠前}（架空の病院の取り決め）。
        </p>
      )}
    </>
  );
}

/** 血糖 (the values of each day) and one row per insulin order with its doses from the 与薬の記録. */
export function FlowGlucoseRows({ points, insulin, mar, nowAbs, days, box, labelW, xAbs, lo, hi }: { points: GlucosePoint[]; insulin: OrderEntry[]; mar: FlowMar; nowAbs: number; days: DayOffset[]; box: DayBox; labelW: number; xAbs: (a: number) => number; lo: number; hi: number }) {
  if (!points.length && !insulin.length) return null;
  return (
    <>
      <div className="mt-3 border-b border-rule py-1 text-[11px] font-bold text-ink-soft">血糖・インスリン</div>
      <Line label="血糖" sub="mg/dL" labelW={labelW}>
        {days.map((d) => {
          const c = glucoseDayCell(points, d);
          if (!c) return null;
          const b = box(d);
          return (
            <span key={d} title={c.title} className="absolute top-1 truncate px-0.5 text-center text-ink" style={{ left: b.left, width: b.width }}>
              {c.text}
            </span>
          );
        })}
      </Line>
      {insulin.map((e) => {
        const drug = e.order.type === "injection" ? findDrug(e.order.items[0].drugCode) : undefined;
        return (
          <Line key={e.id} label={drug ? (drug.aliases[0] ?? drug.name) : "インスリン"} sub="与薬の記録" labelW={labelW}>
            {insulinDoses(e, lo, hi, mar.records, mar.sessionStart, nowAbs).map((x) => (
              <span
                key={x.at}
                title={`${x.state}${x.record ? ` ${x.record.doneAt} ${x.record.by}` : ""}`}
                className={`absolute top-1 h-4 w-1 -translate-x-1/2 rounded ${x.state === "未実施" ? "bg-shu" : x.state === "未入力" ? "bg-yamabuki" : x.state === "予定" ? "bg-rule" : "bg-ink-soft"}`}
                style={{ left: xAbs(x.at) }}
              />
            ))}
          </Line>
        );
      })}
      <p className="pl-[76px] pt-0.5 text-[10px] text-ink-faint">血糖は看護ケア・観察の「血糖測定」に入れた値（簡易血糖）と検体検査の Glu を、その日の測った順に並べています。インスリンは注射オーダと与薬の記録から。</p>
    </>
  );
}
