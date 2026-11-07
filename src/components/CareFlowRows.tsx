"use client";

import { FlowRow } from "./FlowOrderedRows";
import { careRowKey } from "@/lib/flow-layout";
import { displayText } from "@/lib/display-text";
import { careFlowMarks, careFlowRows, type CareFlowCell, type CareOrder, type CareRecord } from "@/lib/care-orders";
import type { DayOffset } from "@/lib/types";
import type { DayBox } from "./FlowDayRows";

const TONE: Record<CareFlowCell["tone"], string> = {
  done: "text-ink",
  not: "font-bold text-shu",
  late: "font-bold text-yamabuki",
  plan: "text-ink-faint",
};

/** The time axis when the flow sheet is zoomed in (3日・1日・勤務帯・1時間): items sit at their time. */
export interface FlowZoom {
  lo: number;
  hi: number;
  xAbs: (a: number) => number;
}

/**
 * 看護ケア・観察 rows of the flow sheet: one row per item, one cell per day. Past days show 済 (or 済 n/m,
 * 不可, 未) or what was seen; days ahead show a dot with how many times. A line marks now. Zoomed in, each
 * task sits at its time instead.
 */
export function CareFlowRows({ orders, records, days, box, labelW, nowX, nowAbs, sessionStart, zoom, shown = () => true, onCell }: { orders: CareOrder[]; records: CareRecord[]; days: DayOffset[]; box: DayBox; labelW: number; nowX: number | null; nowAbs: number; sessionStart: number; zoom?: FlowZoom; shown?: (item: string) => boolean; onCell?: (e: React.MouseEvent, item: string, day: DayOffset, at: number | null) => void }) {
  const Cell = onCell ? "button" : "span";
  const rows = (zoom ? careFlowMarks(orders, records, zoom.lo, zoom.hi, nowAbs, sessionStart) : careFlowRows(orders, records, days, nowAbs, sessionStart)).filter((r) => shown(r.label));
  return (
    <>
      {rows.length === 0 && (
        <div className="flex border-b border-rule-soft">
          <div className="shrink-0" style={{ width: labelW }} />
          <div className="h-6 py-1 text-ink-faint">なし</div>
        </div>
      )}
      {rows.map((r) => (
        <FlowRow key={r.key} id={careRowKey(r.label)}><div className="flex border-b border-rule-soft">
          <div className="shrink-0 py-1 pr-2 text-right text-ink-soft" style={{ width: labelW }}>
            {r.label}
            <div className="text-[9px] text-ink-faint">{r.sub}</div>
          </div>
          <div className="relative min-h-6 flex-1">
            {nowX !== null && <span className="absolute inset-y-0 w-px bg-ink-faint/60" style={{ left: nowX }} aria-hidden />}
            {"marks" in r && zoom
              ? r.marks.map((m) => (
                  <Cell key={m.id} type={onCell ? "button" : undefined} onClick={onCell ? (e: React.MouseEvent) => onCell(e, r.label, Math.floor(m.at / 1440), m.at) : undefined} title={m.title} className={`absolute top-1 -translate-x-1/2 whitespace-nowrap ${onCell ? "rounded hover:bg-ai-soft" : ""} ${TONE[m.tone]}`} style={{ left: zoom.xAbs(m.at) }}>
                    {displayText(m.text)}
                  </Cell>
                ))
              : "cells" in r &&
                days.map((d) => {
                  const c = r.cells[d];
                  if (!c) return null;
                  const b = box(d);
                  return (
                    <Cell key={d} type={onCell ? "button" : undefined} onClick={onCell ? (e: React.MouseEvent) => onCell(e, r.label, d, null) : undefined} title={c.title} className={`absolute top-1 truncate px-0.5 text-center ${onCell ? "rounded hover:bg-ai-soft" : ""} ${TONE[c.tone]}`} style={{ left: b.left, width: b.width }}>
                      {displayText(c.text)}
                    </Cell>
                  );
                })}
          </div>
        </div></FlowRow>
      ))}
    </>
  );
}
