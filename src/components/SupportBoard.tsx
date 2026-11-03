"use client";

import { Hotel } from "lucide-react";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { DISCHARGE_FACTORS, type AdmitEval } from "@/lib/admit-eval";
import type { DocRecord } from "@/lib/documents";
import { decidedOf, type TransferAsk } from "@/lib/transfer";
import type { WorkPatient } from "@/lib/worksheet";

/**
 * 退院支援の一覧 (for MSW and the discharge-support nurse): every patient with the steps of discharge
 * support, the plan document, transfer asks and the discharge date, from the records. Nothing is judged.
 */
export function SupportBoard({ people, evals, documents, asks, today, discharged, onOpen }: { people: WorkPatient[]; evals: Record<string, AdmitEval>; documents: DocRecord[]; asks: TransferAsk[]; today: CalendarDate; discharged: Record<string, { day: number; time: string }>; onOpen: (patientId: string) => void }) {
  const day = (d: number) => formatShort(addDays(today, d)).replace(/（.）/, "");
  const mark = (ok: boolean | undefined, text: string) => <span className={ok ? "text-wakatake" : "text-ink-faint"}>{ok ? `✓ ${text}` : "—"}</span>;
  return (
    <section aria-label="退院支援の一覧" className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper p-5">
      <h1 className="mb-1 flex items-center gap-1.5 text-lg font-bold">
        <Hotel size={18} />
        退院支援の一覧
      </h1>
      <p className="mb-3 text-xs text-ink-soft">入院時の評価・書類作成・転院・施設の調整・退院のオーダから、患者ごとの進み具合をコードで並べます。名前を押すとカルテが開きます。</p>
      <table className="w-full border-collapse rounded-lg bg-sheet text-[12px]">
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className="px-2 py-1.5">患者</th>
            <th className="px-2">退院困難な要因</th>
            <th className="px-2">話合い</th>
            <th className="px-2">計画の着手</th>
            <th className="px-2">カンファレンス</th>
            <th className="px-2">退院支援計画書</th>
            <th className="px-2">転院・施設</th>
            <th className="px-2">退院</th>
          </tr>
        </thead>
        <tbody>
          {people.map((x) => {
            const ds = evals[x.patient.id]?.discharge;
            const doc = documents.find((d) => d.patientId === x.patient.id && d.kind === "退院支援計画書");
            const mine = asks.filter((a) => a.patientId === x.patient.id);
            const decided = decidedOf(mine);
            const leave = x.entries.find((e) => e.status === "有効" && e.order.type === "procedure" && e.order.leave?.kind === "退院");
            const leaveDay = leave && leave.order.type === "procedure" ? leave.order.leave!.from.day : null;
            const out = discharged[x.patient.id];
            return (
              <tr key={x.patient.id} className="border-b border-rule-soft align-top">
                <td className="px-2 py-1.5">
                  <button type="button" onClick={() => onOpen(x.patient.id)} className="text-left font-bold text-ai underline-offset-2 hover:underline">
                    {x.room} {x.patient.name}
                  </button>
                  <div className="text-[11px] text-ink-faint">入院 {day(x.patient.admittedOn)}</div>
                </td>
                <td className="px-2">{ds ? (ds.factors.length ? ds.factors.map((f) => `${f}　${DISCHARGE_FACTORS.find((x) => x.key === f)?.label ?? ""}`).join("／") : "なし") : <span className="text-yamabuki">まだ抽出していない</span>}</td>
                <td className="px-2">{mark(!!ds?.talkedAt, ds?.talkedAt ? day(ds.talkedAt.day) : "")}</td>
                <td className="px-2">{mark(!!ds?.planStartedAt, ds?.planStartedAt ? day(ds.planStartedAt.day) : "")}</td>
                <td className="px-2">{mark(!!ds?.conferenceAt, ds?.conferenceAt ? day(ds.conferenceAt.day) : "")}</td>
                <td className="px-2">{mark(!!doc, doc ? `${day(doc.at.day)} ${doc.by}` : "")}</td>
                <td className="px-2">
                  {decided ? (
                    <span className="font-bold text-ai">決定：{decided.facility}</span>
                  ) : mine.length ? (
                    mine.map((a) => (
                      <div key={a.id}>
                        {a.facility.replace(/（架空）/, "")}：{a.state}
                      </div>
                    ))
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </td>
                <td className="px-2">{out ? <span className="text-wakatake">退院済み {out.time}</span> : leaveDay !== null ? `予定 ${day(leaveDay)}` : <span className="text-ink-faint">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
