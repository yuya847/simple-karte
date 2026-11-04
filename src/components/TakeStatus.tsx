"use client";

import { ClipboardCheck, Printer } from "lucide-react";
import { useState } from "react";
import type { CalendarDate } from "@/lib/dates";
import { slipLines, takeBadge, type Confirms } from "@/lib/order-confirm";
import type { TakeHold, TakeRow } from "@/lib/order-take";
import { WARD_NAME } from "@/lib/ward";
import { usePrintSheet } from "./DeskParts";
import { OrderSlipPrint } from "./OrderSlipPrint";
import { TakeBadgeMark } from "./TakeConfirm";

/**
 * For the doctor, in the chart: today's order changes of this patient and whether a nurse has taken them
 * (who and when) and confirmed the schedule, questions held by a nurse with a place to answer, urgent ones
 * still waiting, and the day's 指示票 to print.
 */
export function TakeStatus({ rows, taken, isTaken, holds, confirms = {}, nowAbs, onAnswer, slip }: { rows: TakeRow[]; taken: Record<string, string>; isTaken: (r: TakeRow) => boolean; holds: Record<string, TakeHold>; confirms?: Confirms; nowAbs: number; onAnswer: (key: string, text: string) => void; slip?: { patient: { id: string; name: string; room: string }; today: CalendarDate; nowTime: string; by: string } }) {
  const [answer, setAnswer] = useState<Record<string, string>>({});
  const [print, printSheet] = usePrintSheet();
  if (!rows.length) return null;
  const ctx = { taken, isTaken, holds, confirms };
  const waiting = rows.filter((r) => !isTaken(r));
  const asks = rows.filter((r) => holds[r.key] && !holds[r.key].answer && !isTaken(r));
  const confirmed = rows.filter((r) => isTaken(r) && confirms[r.key]);
  return (
    <details open={asks.length > 0 || waiting.some((r) => r.flags.urgent)} className="mx-4 mb-1 rounded-md border border-rule bg-sheet px-3 py-1.5 text-[12px]">
      <summary className="flex cursor-pointer items-center gap-1.5 font-bold">
        <ClipboardCheck size={14} />
        今日の指示の指示受け：まだ {waiting.length}件
        {confirmed.length > 0 && <span className="font-normal text-wakatake">予定の確認済み {confirmed.length}件</span>}
        {asks.length > 0 && <span className="rounded bg-yamabuki px-1.5 text-[11px] text-white">看護師から確認 {asks.length}件</span>}
      </summary>
      <ul className="mt-1 space-y-1">
        {rows.map((r) => {
          const ok = isTaken(r);
          const hold = holds[r.key];
          const late = !ok && r.flags.urgent && nowAbs - r.at >= 15;
          const badge = takeBadge(r, ctx);
          return (
            <li key={r.key} className="border-t border-rule-soft pt-1">
              {late ? <span className="mr-1 font-bold text-shu">まだ（{nowAbs - r.at}分）</span> : <TakeBadgeMark badge={badge} className="mr-1" />}
              {r.kind === "変更" ? "【変】" : r.kind} {r.main}
              {r.flags.urgent && <span className="ml-1 rounded bg-shu px-1 text-[10px] font-bold text-white">{r.flags.urgent}</span>}
              {hold && (
                <div className="mt-0.5 rounded bg-paper px-2 py-1">
                  <b>{hold.by}</b>（{hold.at}）：{hold.reason}
                  {hold.note && `　${hold.note}`}
                  {hold.answer ? (
                    <div className="text-ai">
                      回答 {hold.answer.at} {hold.answer.by}：{hold.answer.text}
                    </div>
                  ) : (
                    <div className="mt-1 flex gap-1.5">
                      <input value={answer[r.key] ?? ""} onChange={(e) => setAnswer((m) => ({ ...m, [r.key]: e.target.value }))} placeholder="回答（例：速さは 42mL/時 で合っています）" aria-label="看護師への回答" className="min-w-0 flex-1 rounded border border-rule bg-sheet px-1.5 py-0.5" />
                      <button type="button" disabled={!(answer[r.key] ?? "").trim()} onClick={() => onAnswer(r.key, answer[r.key].trim())} className="rounded bg-ai px-2 py-0.5 font-bold text-white disabled:opacity-40">
                        答える
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {slip && (
          <button type="button" onClick={() => print(<OrderSlipPrint ward={WARD_NAME} patient={slip.patient} day={0} today={slip.today} nowTime={slip.nowTime} by={slip.by} lines={slipLines(rows, slip.patient.id, 0, ctx)} />, { portrait: true })} className="flex items-center gap-1 rounded border border-ai/50 px-2 py-0.5 text-[11px] font-bold text-ai hover:bg-ai-soft">
            <Printer size={12} />
            指示票を印刷（今日・A4）
          </button>
        )}
        <p className="text-[10px] text-ink-faint">指示を直すときは、答えるだけでなく、オーダを直して確定してください（直した指示はもう一度、看護師の指示受けに出ます）。「受け」は看護師が受けた時刻と名前、「確認済み」はその指示が作る予定を看護師が見た時刻です。</p>
      </div>
      {printSheet}
    </details>
  );
}
