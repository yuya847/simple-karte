"use client";

import { ClipboardCheck } from "lucide-react";
import { useState } from "react";
import type { TakeHold, TakeRow } from "@/lib/order-take";

/**
 * For the doctor, in the chart: today's order changes of this patient and whether a nurse has taken them
 * (who and when), questions held by a nurse with a place to answer, and urgent ones still waiting.
 */
export function TakeStatus({ rows, taken, isTaken, holds, nowAbs, onAnswer }: { rows: TakeRow[]; taken: Record<string, string>; isTaken: (r: TakeRow) => boolean; holds: Record<string, TakeHold>; nowAbs: number; onAnswer: (key: string, text: string) => void }) {
  const [answer, setAnswer] = useState<Record<string, string>>({});
  if (!rows.length) return null;
  const waiting = rows.filter((r) => !isTaken(r));
  const asks = rows.filter((r) => holds[r.key] && !holds[r.key].answer && !isTaken(r));
  return (
    <details open={asks.length > 0 || waiting.some((r) => r.flags.urgent)} className="mx-4 mb-1 rounded-md border border-rule bg-sheet px-3 py-1.5 text-[12px]">
      <summary className="flex cursor-pointer items-center gap-1.5 font-bold">
        <ClipboardCheck size={14} />
        今日の指示の指示受け：まだ {waiting.length}件
        {asks.length > 0 && <span className="rounded bg-yamabuki px-1.5 text-[11px] text-white">看護師から確認 {asks.length}件</span>}
      </summary>
      <ul className="mt-1 space-y-1">
        {rows.map((r) => {
          const ok = isTaken(r);
          const hold = holds[r.key];
          const late = !ok && r.flags.urgent && nowAbs - r.at >= 15;
          return (
            <li key={r.key} className="border-t border-rule-soft pt-1">
              <span className={`mr-1 font-bold ${ok ? "text-wakatake" : late ? "text-shu" : "text-yamabuki"}`}>{ok ? `受け ${taken[r.keys.at(-1)!] ?? ""}` : late ? `まだ（${nowAbs - r.at}分）` : "まだ"}</span>
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
      <p className="mt-1 text-[10px] text-ink-faint">指示を直すときは、答えるだけでなく、オーダを直して確定してください（直した指示はもう一度、看護師の指示受けに出ます）。</p>
    </details>
  );
}
