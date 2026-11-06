"use client";

import { displayText } from "@/lib/display-text";
import { FileClock } from "lucide-react";
import { useState } from "react";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { SUMMARY_RULES, SUMMARY_STATES, approve, approveDeny, lastMonthRate, sendBack, summaryState, type SummaryRecord, type SummaryRow, type SummaryState } from "@/lib/summary-approval";
import { useMe } from "./RoleContext";

const TONE: Record<SummaryState, string> = {
  未作成: "bg-shu-soft text-shu",
  作成中: "bg-yamabuki-soft text-yamabuki",
  差し戻し: "bg-shu-soft text-shu",
  承認待ち: "bg-ai-soft text-ai",
  承認済: "bg-wakatake-soft text-wakatake",
};

const Sources = () => (
  null
);

/** 承認・差し戻し of one summary, in the chart's 退院サマリ (the approver reads it there first). */
export function SummaryApproval({ record, attending, fmtDay, nowTime, onApprove, onReturn }: { record: SummaryRecord; attending: string; fmtDay: (d: number) => string; nowTime: string; onApprove: (r: SummaryRecord) => void; onReturn: (r: SummaryRecord) => void }) {
  const me = useMe();
  const [comment, setComment] = useState("");
  const state = summaryState(record);
  const why = me.role === "医師" ? approveDeny(me.name, record, attending) : "承認は医師（主治医のチームの指導医）が行います。";
  const at = { day: 0, time: nowTime };
  return (
    <section aria-label="退院時サマリーの承認" className="space-y-1.5 rounded-md border border-rule bg-paper p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-1.5 font-bold ${TONE[state]}`}>{state}</span>
        {record.confirmedAt && (
          <span className="nums text-ink-soft">
            確定：{record.confirmedBy} {fmtDay(record.confirmedAt.day)} {record.confirmedAt.time}
          </span>
        )}
        {record.approval && (
          <span className="nums text-wakatake">
            承認：{displayText(record.approval.by)} {fmtDay(record.approval.at.day)} {record.approval.at.time}
            {record.approval.comment ? `「${record.approval.comment}」` : ""}
          </span>
        )}
      </div>
      {state === "差し戻し" && record.returned && (
        <p className="text-shu">
          差し戻し：{displayText(record.returned.by)} {fmtDay(record.returned.at.day)} {record.returned.at.time}「{record.returned.comment}」。直して確定し直してください。
        </p>
      )}
      {state === "承認待ち" &&
        (why ? (
          <p className="text-ink-soft">{why}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="コメント（差し戻すときは必ず）" aria-label="承認のコメント" className="min-w-48 flex-1 rounded border border-rule bg-sheet px-1 py-0.5" />
            <button type="button" onClick={() => onApprove(approve(record, me.name, at, comment.trim() || undefined))} className="rounded bg-wakatake px-2 py-0.5 font-bold text-white">
              読んで承認する
            </button>
            <button type="button" disabled={!comment.trim()} onClick={() => onReturn(sendBack(record, me.name, at, comment.trim()))} className="rounded border border-shu px-2 py-0.5 font-bold text-shu disabled:opacity-40">
              差し戻す
            </button>
          </div>
        ))}
      <p className="text-[11px] text-ink-faint">{SUMMARY_RULES.who}</p>
    </section>
  );
}

/** 退院サマリの一覧: every discharge with its summary's state and deadline, late ones first. */
export function SummaryList({ rows, today, onOpen }: { rows: SummaryRow[]; today: CalendarDate; onOpen: (id: string) => void }) {
  const me = useMe();
  const [state, setState] = useState<SummaryState | "all" | "late">("all");
  const shown = rows.filter((r) => state === "all" || (state === "late" ? r.late && r.state !== "承認済" : r.state === state));
  const fmt = (d: number) => formatShort(addDays(today, d));
  const rate = lastMonthRate(rows, today);
  return (
    <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-[13px]">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-base font-bold">
          <FileClock size={18} />
          退院サマリの一覧（承認待ち・未作成）
        </h2>
        <span className="text-xs text-ink-soft">この試作のカルテの患者と、過去の退院</span>
      </header>

      <section aria-label="前月の期限内の割合" className="rounded-md border border-rule bg-paper px-3 py-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <b>前月（{rate.label}）に退院した {rate.discharges}人</b>
          <span>のうち、退院日の翌日から14日以内に承認まで済んだ {rate.onTime}人</span>
          <b className={`nums text-base ${rate.percent !== null && rate.percent < 90 ? "text-shu" : "text-wakatake"}`}>{rate.percent === null ? "—" : `${rate.percent}%`}</b>
          <span className="text-xs text-ink-soft">
            （期限を過ぎた {rate.late}人・期限がまだの {rate.open}人。施設基準は毎月9割以上）
          </span>
        </div>

      </section>

      <div role="tablist" className="flex flex-wrap rounded-md border border-rule p-0.5 text-xs">
        {(["all", "late", ...SUMMARY_STATES] as const).map((k) => {
          const n = k === "all" ? rows.length : k === "late" ? rows.filter((r) => r.late && r.state !== "承認済").length : rows.filter((r) => r.state === k).length;
          return (
            <button key={k} role="tab" type="button" aria-selected={state === k} onClick={() => setState(k)} className={`rounded px-2 py-0.5 ${state === k ? "bg-ink font-bold text-white" : "text-ink-soft"}`}>
              {k === "all" ? "すべて" : k === "late" ? "期限切れ" : k} {n}
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-md border border-rule bg-paper px-3 py-2 text-ink-soft">ありません。</p>
      ) : (
        <table className="w-full border-collapse rounded-md border border-rule bg-sheet">
          <thead>
            <tr className="text-left text-[11px] text-ink-faint">
              {["退院日", "患者", "主治医", "状態", "期限", "確定・承認", ""].map((h) => (
                <th key={h} className="border-b border-rule px-2 py-1 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const canApprove = me.role === "医師" && r.state === "承認待ち" && !approveDeny(me.name, r.record, r.attending);
              return (
                <tr key={r.id} className="align-top">
                  <td className="nums border-b border-rule-soft px-2 py-1">
                    {fmt(r.dischargeDay)}
                    {r.dischargeDay > 0 && <span className="ml-1 text-[11px] text-ink-faint">（予定）</span>}
                  </td>
                  <td className="border-b border-rule-soft px-2 py-1">
                    {r.name}
                    <div className="text-[11px] text-ink-faint">{r.department}</div>
                  </td>
                  <td className="border-b border-rule-soft px-2 py-1 text-ink-soft">{r.attending}</td>
                  <td className="border-b border-rule-soft px-2 py-1">
                    <span className={`rounded px-1.5 text-xs font-bold ${TONE[r.state]}`}>{r.state}</span>
                  </td>
                  <td className="nums border-b border-rule-soft px-2 py-1">
                    {fmt(r.due)}
                    <div className={`text-[11px] ${r.late ? "font-bold text-shu" : "text-ink-soft"}`}>{r.left === null ? (r.late ? "期限を過ぎて承認" : "期限内に承認") : r.left < 0 ? `期限切れ ${-r.left}日` : r.left === 0 ? "今日まで" : `あと ${r.left}日`}</div>
                  </td>
                  <td className="nums border-b border-rule-soft px-2 py-1 text-[11px] text-ink-soft">
                    {r.record?.confirmedAt && (
                      <div>
                        確定 {fmt(r.record.confirmedAt.day)} {r.record.confirmedBy}
                      </div>
                    )}
                    {r.record?.approval && (
                      <div>
                        承認 {fmt(r.record.approval.at.day)} {displayText(r.record.approval.by)}
                      </div>
                    )}
                    {r.record?.returned && r.state === "差し戻し" && <div className="text-shu">差し戻し「{r.record.returned.comment}」</div>}
                  </td>
                  <td className="border-b border-rule-soft px-2 py-1 text-right">
                    {r.chart ? (
                      <button type="button" onClick={() => onOpen(r.id)} className={`rounded px-2 py-0.5 text-xs ${canApprove ? "bg-wakatake font-bold text-white" : "text-ai underline"}`}>
                        {canApprove ? "開いて承認する" : "退院サマリを開く"}
                      </button>
                    ) : (
                      <span className="text-[11px] text-ink-faint">過去の記録（カルテなし）</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="text-[11px] text-ink-faint">{SUMMARY_RULES.who}</p>
      <Sources />
    </div>
  );
}

/* Help migration source (references and dynamic wording):
<p >
    出典：
    <a href={SUMMARY_SOURCES.deadline.url} target="_blank" rel="noreferrer" >
      {SUMMARY_SOURCES.deadline.label}
    </a>
    ／
    <a href={SUMMARY_SOURCES.spec.url} target="_blank" rel="noreferrer" >
      {SUMMARY_SOURCES.spec.label}
    </a>
  </p>
<p >割合 ＝ 期限内に承認まで済んだ人数 ÷ 前月に退院した人数 × 100（コードで計算）。{SUMMARY_RULES.submit}</p>
*/
