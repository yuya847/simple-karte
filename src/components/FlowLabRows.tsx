"use client";

import { displayText } from "@/lib/display-text";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { DEFAULT_FLOW_ANALYTES, analyteChoices, findAnalyte, labDayCell, labMarks, labValueText, type LabMark } from "@/lib/flow-labs";
import type { PendingDraw } from "@/lib/lab-table";
import type { Analyte } from "@/lib/master";
import type { DayOffset, OrderEntry, Patient } from "@/lib/types";
import type { DayBox } from "./FlowDayRows";
import type { FlowZoom } from "./CareFlowRows";

const FLAG_STYLE = { H: "font-bold text-shu", L: "font-bold text-ai", "": "text-ink" } as const;
const PENDING_TEXT = { 採取待ち: "採取待ち", 検査中: "検査中", 予定: "○" } as const;

function MarkText({ a, m, more }: { a: Analyte; m: LabMark; more?: number }) {
  if (m.kind === "pending") return <span className={m.status === "予定" ? "text-ink-faint" : "text-[10px] font-bold text-yamabuki"}>{PENDING_TEXT[m.status]}</span>;
  return (
    <span className={FLAG_STYLE[m.flag]}>
      {displayText(labValueText(a, m.value))}
      {m.flag && <span className="text-[9px]">{m.flag}</span>}
      {!!more && <span className="ml-0.5 text-[9px] font-normal text-ink-faint">+{more}</span>}
    </span>
  );
}

/**
 * 検査値の行: one row per chosen analyte, each day's last value (H red, L blue, against the master's
 * reference range), draws waiting for their result and draws ahead. The choice is kept per user.
 */
export function FlowLabRows({ patient, pending, orders, nowAbs, days, box, labelW, analytes, onAnalytes, zoom }: { patient: Patient; pending: PendingDraw[]; orders: OrderEntry[]; nowAbs: number; days: DayOffset[]; box: DayBox; labelW: number; analytes: string[]; onAnalytes: (codes: string[]) => void; zoom?: FlowZoom }) {
  const [choosing, setChoosing] = useState(false);
  const rows = analytes.map(findAnalyte).filter((a): a is Analyte => !!a);
  return (
    <>
      {rows.map((a) => {
        const marks = labMarks(a, patient.labs, pending, orders, patient.sex, nowAbs);
        return (
          <div key={a.code} className="flex border-b border-rule-soft">
            <div className="shrink-0 py-1 pr-2 text-right text-ink-soft" style={{ width: labelW }}>
              {a.name}
              {a.unit && <div className="text-[9px] text-ink-faint">{a.unit}</div>}
            </div>
            <div className="relative min-h-6 flex-1">
              {zoom
                ? marks
                    .filter((m) => m.at >= zoom.lo && m.at < zoom.hi)
                    .map((m) => (
                      <span key={`${m.kind}-${m.at}`} title={m.title} className="absolute top-1 -translate-x-1/2 whitespace-nowrap" style={{ left: zoom.xAbs(m.at) }}>
                        <MarkText a={a} m={m} />
                      </span>
                    ))
                : days.map((d) => {
                const c = labDayCell(marks, d);
                if (!c) return null;
                const b = box(d);
                return (
                  <span key={d} title={c.title} className="absolute top-1 truncate px-0.5 text-center" style={{ left: b.left, width: b.width }}>
                    <MarkText a={a} m={c.mark} more={c.more} />
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="flex border-b border-rule-soft print:hidden">
        <div className="shrink-0" style={{ width: labelW }} />
        <div className="relative flex-1 py-0.5 text-[10px] text-ink-faint">
          <button type="button" onClick={() => setChoosing((v) => !v)} aria-expanded={choosing} className="flex items-center gap-1 rounded px-1 hover:bg-paper hover:text-ai">
            <SlidersHorizontal size={11} />
            出す検査値を選ぶ（{rows.map((a) => a.name).join("・") || "なし"}）
          </button>
          {choosing && <AnalytePicker patient={patient} value={analytes} onChange={onAnalytes} onClose={() => setChoosing(false)} />}
        </div>
      </div>
    </>
  );
}

function AnalytePicker({ patient, value, onChange, onClose }: { patient: Patient; value: string[]; onChange: (codes: string[]) => void; onClose: () => void }) {
  const { mine, others } = analyteChoices(patient.labs);
  const toggle = (code: string) => onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
  const box = (a: Analyte) => (
    <label key={a.code} className="flex cursor-pointer items-center gap-1 whitespace-nowrap">
      <input type="checkbox" className="accent-ai" checked={value.includes(a.code)} onChange={() => toggle(a.code)} />
      {a.name}
    </label>
  );
  return (
    <div className="mt-1 max-w-xl space-y-1.5 rounded-md border border-rule bg-sheet p-2 text-[11px] text-ink shadow">
      <div className="text-ink-soft">この患者に結果がある項目</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">{mine.length ? mine.map(box) : <span className="text-ink-faint">なし</span>}</div>
      <details>
        <summary className="cursor-pointer text-ink-soft">ほかの項目（マスター）</summary>
        <div className="mt-1 flex max-h-32 flex-wrap gap-x-3 gap-y-1 overflow-y-auto">{others.map(box)}</div>
      </details>
      <div className="flex items-center gap-2">
        <span className="text-ink-faint">この端末のこの利用者のみに適用されます。初期は WBC・CRP・Hb・Cre・K。</span>
        <button type="button" onClick={() => onChange(DEFAULT_FLOW_ANALYTES)} className="ml-auto rounded border border-rule px-2 py-0.5">
          初期に戻す
        </button>
        <button type="button" onClick={onClose} className="rounded bg-ai px-2 py-0.5 font-bold text-white">
          閉じる
        </button>
      </div>
    </div>
  );
}
