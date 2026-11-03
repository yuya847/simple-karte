"use client";

import { MessageSquareWarning, ScanText } from "lucide-react";
import { useState } from "react";
import { orderLines, oralName } from "@/lib/format";
import type { TdmReport } from "@/lib/tdm";
import { queryOpen, type BroughtReport, type BroughtRow, type Query } from "@/lib/pharmacy";
import type { CalendarDate } from "@/lib/dates";
import type { OrderEntry } from "@/lib/types";
import { DenyNote, useDeny } from "./RoleContext";

interface Props {
  today: CalendarDate;
  entries: OrderEntry[];
  queries: Query[];
  reports: BroughtReport[];
  /** "変更する": put a stop draft for the order and its name in the instruction box. */
  onChange: (q: Query) => void;
  onKeep: (q: Query, answer: string) => void;
  onDecide: (r: BroughtReport, rows: BroughtRow[]) => void;
  tdm?: TdmReport[];
  onTdmSeen?: (r: TdmReport) => void;
}

const DECISIONS: NonNullable<BroughtRow["decision"]>[] = ["持参薬で継続", "院内の薬に切替", "中止"];

/** What the pharmacy sent to the doctor for this patient: questions on orders, and the 持参薬 report. */
export function PharmacyInbox({ today, entries, queries, reports, onChange, onKeep, onDecide, tdm = [], onTdmSeen }: Props) {
  const open = queries.filter((q) => q.status === "回答待ち");
  const waitingStop = queries.filter((q) => q.status === "変更" && queryOpen(q, entries));
  const pending = reports.filter((r) => r.status === "医師へ報告");
  const [keepText, setKeepText] = useState<Record<string, string>>({});
  const [choices, setChoices] = useState<Record<string, BroughtRow[]>>({});
  const tdmNew = tdm.filter((r) => r.status === "医師へ報告");
  const locked = !!useDeny()("order.sign");
  if (!open.length && !waitingStop.length && !pending.length && !tdmNew.length) return null;

  return (
    <div className="scroll-thin max-h-[45%] shrink-0 overflow-auto border-b border-yamabuki/50 bg-yamabuki-soft/60 px-4 py-2 text-[12px]">
      <DenyNote action="order.sign" className="mb-1" />
      <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0 [&_button:disabled]:opacity-40">
      {tdmNew.map((r) => (
        <div key={r.id} className="mb-2">
          <div className="flex items-center gap-1 font-bold text-yamabuki">
            <MessageSquareWarning size={14} />
            薬剤部から TDM の報告（{r.at} {r.by}）
          </div>
          <div className="nums text-ink-soft">
            {r.drug} {r.regimen.dose}mg {r.regimen.tau}時間ごと（点滴{r.regimen.tinf}時間）：AUC24 <b className="text-ink">{Math.round(r.auc24)}</b> μg·h/mL、Cmin {r.cmin.toFixed(1)}（2点採血・コードで計算）
          </div>
          <div className="my-0.5 text-ink">「{r.proposal}」</div>
          <button type="button" onClick={() => onTdmSeen?.(r)} className="rounded border border-rule bg-sheet px-2 py-0.5 text-ink-soft hover:text-ink">
            確認した（投与を変えるときは、話すか打ってオーダする）
          </button>
        </div>
      ))}
      {open.map((q) => {
        const e = entries.find((x) => x.id === q.orderId);
        const lines = e ? orderLines(e.order, today) : null;
        return (
          <div key={q.id} className="mb-2">
            <div className="flex items-center gap-1 font-bold text-yamabuki">
              <MessageSquareWarning size={14} />
              薬剤部から疑義照会（{q.askedAt} {q.by}）
            </div>
            {lines && (
              <div className="text-ink-soft">
                対象：<b className="text-ink">{lines.main}</b> {lines.detail}
              </div>
            )}
            <div className="my-0.5 text-ink">「{q.question}」</div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => onChange(q)} className="rounded border border-ai bg-sheet px-2 py-0.5 text-ai hover:bg-ai hover:text-white">
                変更する（中止の下書きを作り、言い直す）
              </button>
              <input
                value={keepText[q.id] ?? ""}
                onChange={(ev) => setKeepText((t) => ({ ...t, [q.id]: ev.target.value }))}
                placeholder="変更しない理由（任意）"
                className="w-48 rounded border border-rule bg-sheet px-1.5 py-0.5 outline-none"
              />
              <button type="button" onClick={() => onKeep(q, keepText[q.id] ?? "")} className="rounded border border-rule bg-sheet px-2 py-0.5 text-ink-soft hover:text-ink">
                変更しない
              </button>
            </div>
          </div>
        );
      })}
      {waitingStop.map((q) => (
        <div key={q.id} className="mb-2 text-yamabuki">
          疑義照会に「変更する」と答えました。前のオーダが中止されるまで、照会は閉じません（下書きを確定してください）。
        </div>
      ))}
      {pending.map((r) => {
        const rows = choices[r.id] ?? r.rows;
        const set = (i: number, d: BroughtRow["decision"]) => setChoices((c) => ({ ...c, [r.id]: rows.map((x, j) => (j === i ? { ...x, decision: d } : x)) }));
        const setAmount = (i: number, v: string) => setChoices((c) => ({ ...c, [r.id]: rows.map((x, j) => (j === i ? { ...x, amount: v.trim() === "" || !(Number(v) > 0) ? null : Number(v) } : x)) }));
        // To continue or switch a drug the doctor needs its 1回量 (the お薬手帳 may not say it).
        const ready = rows.every((x) => x.decision && (x.decision === "中止" || (x.match && x.amount !== null)));
        return (
          <div key={r.id} className="mb-2">
            <div className="flex items-center gap-1 font-bold text-yamabuki">
              <ScanText size={14} />
              持参薬の鑑別報告（{r.at} {r.by}）：薬ごとに選んでください
            </div>
            <ul className="mt-1 space-y-1">
              {rows.map((x, i) => (
                <li key={i} className="flex flex-wrap items-center gap-1.5">
                  <span className="min-w-56">
                    <b>{x.said}</b> {x.strength}　1回{x.amount ?? "？"}
                    {x.unit} {x.timings.length ? x.timings.join("・") : `頓用 ${x.prn ?? ""}`}
                    {x.match ? <span className="text-ink-soft">（院内：{oralName(x.match)}）</span> : <span className="text-shu">（院内にない）</span>}
                  </span>
                  {x.amount === null && x.decision && x.decision !== "中止" && (
                    <label className="flex items-center gap-1 text-shu">
                      1回量
                      <input inputMode="decimal" onChange={(e) => setAmount(i, e.target.value)} aria-label={`${x.said} の1回量`} className="w-12 rounded border border-shu bg-paper px-1 text-right" />
                      {x.unit}
                    </label>
                  )}
                  {DECISIONS.map((d) => {
                    const disabled = d !== "中止" && !x.match;
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={disabled}
                        onClick={() => set(i, d)}
                        className={`rounded border px-1.5 py-0.5 ${x.decision === d ? "border-ai bg-ai text-white" : "border-rule bg-sheet text-ink-soft"} disabled:opacity-30`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </li>
              ))}
            </ul>
            <button type="button" disabled={!ready} onClick={() => onDecide(r, rows)} className="mt-1.5 rounded bg-ai px-3 py-1 font-bold text-white disabled:opacity-40">
              選んだとおりに下書きにする
            </button>
            <span className="ml-2 text-ink-faint">開始は、それぞれの次の服用時刻（病棟の約束）からです。</span>
          </div>
        );
      })}
      </fieldset>
    </div>
  );
}
