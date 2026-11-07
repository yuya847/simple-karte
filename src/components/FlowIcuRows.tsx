"use client";

// 経過表の「ICU・HCU の1時間の記録」: RASS・CPOT・CAM-ICU・瞳孔・GCS・MAP・CVP を、記録の時刻に並べる（ICU 記録の
// hourly）。量（尿量・ドレーンなど）は水分出納の行に出る。押すとその時刻の1時間の記録を入れる（FlowSheet）。

import { addDays, type CalendarDate } from "@/lib/dates";
import { abs } from "@/lib/flowsheet";
import { hourlyCell } from "@/lib/icu/hourly-entry";
import type { HourlyRecord } from "@/lib/icu/types";
import { labelsThatFit } from "@/lib/point-labels";
import { FlowOrderedRows, FlowRow } from "./FlowOrderedRows";
import type { FlowLayout } from "@/lib/flow-layout";

export const ICU_FLOW_ROWS: { key: keyof typeof hourlyCell; label: string; always?: boolean }[] = [
  { key: "rass", label: "RASS", always: true },
  { key: "cpot", label: "CPOT", always: true },
  { key: "cam", label: "CAM-ICU" },
  { key: "gcs", label: "GCS" },
  { key: "pupils", label: "瞳孔" },
  { key: "map", label: "MAP" },
  { key: "cvp", label: "CVP" },
];

export function FlowIcuRows({ records, lo, hi, xAbs, labelW, today, layout, shown }: { records: HourlyRecord[]; lo: number; hi: number; xAbs: (t: number) => number; labelW: number; today: CalendarDate; layout: FlowLayout; shown: (key: string) => boolean }) {
  const inWin = records.filter((r) => { const t = abs(r.at.day, r.at.time); return t >= lo && t <= hi; }).sort((a, b) => abs(a.at.day, a.at.time) - abs(b.at.day, b.at.time));
  return (
    <FlowOrderedRows layout={layout}>
      {ICU_FLOW_ROWS.map(({ key, label, always }) => {
        const marks = inWin.map((r) => ({ r, at: xAbs(abs(r.at.day, r.at.time)), text: hourlyCell[key](r) })).filter((m) => m.text);
        if (!shown(`icu.${key}`) || (!always && !marks.length)) return <FlowRow key={key} id={`icu.${key}`}>{null}</FlowRow>;
        const keep = labelsThatFit(marks);
        return (
          <FlowRow key={key} id={`icu.${key}`}>
            <div className="flex border-b border-rule-soft">
              <div className="shrink-0 py-1 pr-2 text-right text-ink-soft" style={{ width: labelW }}>{label}</div>
              <div className="relative h-5 flex-1">
                {marks.map(({ r, at, text }, i) => {
                  const d = addDays(today, r.at.day);
                  const tip = `${d.m}/${d.d} ${r.at.time} ${label} ${text}`;
                  return keep[i] ? (
                    <span key={r.id} title={tip} className="absolute top-0.5 -translate-x-1/2 whitespace-nowrap text-[10px] text-ink-soft" style={{ left: at }}>{text}</span>
                  ) : (
                    <span key={r.id} title={tip} aria-label={tip} className="absolute top-2 h-1 w-1 -translate-x-1/2 rounded-full bg-current text-ink-faint" style={{ left: at }} />
                  );
                })}
              </div>
            </div>
          </FlowRow>
        );
      })}
    </FlowOrderedRows>
  );
}
