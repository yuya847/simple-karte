"use client";

import { Ambulance, BedDouble, CalendarPlus, Pill, Stethoscope } from "lucide-react";
import type { AdmissionRequest } from "@/lib/admission";
import { JTAS_LABEL } from "@/lib/er";
import { OPD_STATUSES } from "@/lib/opd";
import { ER_STATUSES, type Visit } from "./VisitChart";
import type { Revisit } from "./OpdOrders";

const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/**
 * The strip under the patient bar of a 救急外来・外来 patient opened in the ward's chart screen: what the
 * visit is (来院・主訴・トリアージ), its status, and the visit's own actions (入院申込, 外来処方, 再診予約).
 * Everything else is the same chart as a ward patient.
 */
export function VisitStrip({ visit, request, revisit, rxCount, fmtDay, canOrder, onStatus, onOpenRequest, onCancelRequest, onOpenChart, onOpenRx, onOpenRevisit }: { visit: Visit; request?: AdmissionRequest; revisit?: Revisit; rxCount: number; fmtDay: (d: number) => string; canOrder: boolean; onStatus: (s: string) => void; onOpenRequest: () => void; onCancelRequest: (id: string) => void; onOpenChart: (patientId: string) => void; onOpenRx: () => void; onOpenRevisit: () => void }) {
  const status = visit.kind === "er" ? visit.er.status : visit.op.status;
  const admittedAs = request?.admittedAs ?? (visit.kind === "er" ? visit.er.admittedAs : undefined);
  const fixed = status === "入院済" || status === "搬送中";
  const statuses = visit.kind === "er" ? (fixed ? [status] : ER_STATUSES) : OPD_STATUSES;
  const btn = "inline-flex items-center gap-1 rounded-md border border-rule bg-sheet px-2 py-1 text-[12px] hover:border-ai disabled:opacity-40";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-rule bg-ai-soft/40 px-5 py-1.5 text-[12px]">
      <span className="inline-flex items-center gap-1 font-bold text-ai">
        {visit.kind === "er" ? <Ambulance size={14} /> : <Stethoscope size={14} />}
        {visit.kind === "er" ? "救急外来" : `外来・${visit.op.department}`}
      </span>
      {visit.kind === "er" ? (
        <>
          <span className="nums">
            来院 {hhmm(visit.er.arrivedAbs)}（{visit.er.arrival}）
          </span>
          <span>主訴：{visit.er.complaint}</span>
          {visit.er.jtas && (
            <span className="rounded border border-shu/50 px-1 text-shu">
              JTAS {visit.er.jtas}　{JTAS_LABEL[visit.er.jtas]}
            </span>
          )}
        </>
      ) : (
        <>
          <span className="nums">{visit.op.slot ? `予約 ${visit.op.slot}` : "予約なし"}（{visit.op.kind}）</span>
          <span>目的：{visit.op.reason}</span>
        </>
      )}
      <label className="flex items-center gap-1">
        <span className="text-ink-soft">状態</span>
        <select value={status} onChange={(e) => onStatus(e.target.value)} disabled={fixed} className="rounded border border-rule bg-sheet px-1.5 py-0.5 text-[12px]">
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <span className="ml-auto flex flex-wrap items-center gap-1.5">
        {admittedAs ? (
          <button type="button" onClick={() => onOpenChart(admittedAs)} className={`${btn} border-wakatake text-wakatake`}>
            <BedDouble size={13} />
            入院しました・病棟のカルテを開く
          </button>
        ) : request && request.status === "申込" ? (
          <span className="inline-flex items-center gap-2 rounded-md border border-yamabuki/60 bg-yamabuki-soft px-2 py-1 text-yamabuki">
            <BedDouble size={13} />
            入院申込済み・病棟でベッドを決めるのを待っています（{request.urgency}・{request.ward}）
            <button type="button" onClick={() => onCancelRequest(request.id)} className="text-[11px] text-ink-faint underline hover:text-shu">
              取り消す
            </button>
          </span>
        ) : (
          <button type="button" onClick={onOpenRequest} disabled={!canOrder} title={canOrder ? "病棟にベッドを申し込む" : "医師が出します"} className={btn}>
            <BedDouble size={13} />
            入院申込
          </button>
        )}
        {visit.kind === "opd" && (
          <>
            <button type="button" onClick={onOpenRx} className={btn}>
              <Pill size={13} />
              外来処方{rxCount ? `（${rxCount}）` : ""}
            </button>
            <button type="button" onClick={onOpenRevisit} className={btn}>
              <CalendarPlus size={13} />
              再診予約{revisit ? `（${fmtDay(revisit.day)} ${revisit.time}）` : ""}
            </button>
          </>
        )}
      </span>
      <p className="hint w-full text-[11px] text-ink-faint">受診の患者も病棟と同じカルテです。記事・注射・内服は右の欄、検査や画像のオーダは右端のツールから。入院したら、病棟のカルテに引き継がれます。</p>
    </div>
  );
}
