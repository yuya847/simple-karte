"use client";

import { careFlowRows, type CareFlowCell, type CareOrder, type CareRecord } from "@/lib/care-orders";
import type { DayOffset } from "@/lib/types";

const TONE: Record<CareFlowCell["tone"], string> = {
  done: "text-ink",
  not: "font-bold text-shu",
  late: "font-bold text-yamabuki",
  plan: "text-ink-faint",
};

/**
 * 看護ケア・観察 rows of the flow sheet: one row per item, one cell per day. Past days show 済 (or 済 n/m,
 * 不可, 未) or what was seen; days ahead show a dot with how many times. A line marks now.
 */
export function CareFlowRows({ orders, records, days, colW, labelW, nowX, nowAbs, sessionStart }: { orders: CareOrder[]; records: CareRecord[]; days: DayOffset[]; colW: number; labelW: number; nowX: number; nowAbs: number; sessionStart: number }) {
  const rows = careFlowRows(orders, records, days, nowAbs, sessionStart);
  return (
    <>
      <div className="mt-3 border-b border-rule py-1 text-[11px] font-bold text-ink-soft">看護ケア・観察（看護師の指示）</div>
      {rows.length === 0 && (
        <div className="flex border-b border-rule-soft">
          <div className="shrink-0" style={{ width: labelW }} />
          <div className="h-6 py-1 text-ink-faint">なし</div>
        </div>
      )}
      {rows.map((r) => (
        <div key={r.key} className="flex border-b border-rule-soft">
          <div className="shrink-0 py-1 pr-2 text-right text-ink-soft" style={{ width: labelW }}>
            {r.label}
            <div className="text-[9px] text-ink-faint">{r.sub}</div>
          </div>
          <div className="relative min-h-6 flex-1">
            <span className="absolute inset-y-0 w-px bg-ink-faint/60" style={{ left: nowX }} aria-hidden />
            {days.map((d, i) =>
              r.cells[d] ? (
                <span key={d} title={r.cells[d].title} className={`absolute top-1 truncate px-0.5 text-center ${TONE[r.cells[d].tone]}`} style={{ left: i * colW, width: colW }}>
                  {r.cells[d].text}
                </span>
              ) : null,
            )}
          </div>
        </div>
      ))}
    </>
  );
}
