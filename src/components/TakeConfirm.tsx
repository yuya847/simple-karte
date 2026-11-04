"use client";

import { useState } from "react";
import type { CalendarDate } from "@/lib/dates";
import { CONFIRM_SOURCES, type ConfirmPlan, type TakeBadge } from "@/lib/order-confirm";
import type { TakeRow } from "@/lib/order-take";
import { timeLabel } from "@/lib/worksheet";

const BADGE_CLASS: Record<TakeBadge["tone"], string> = { shu: "bg-shu-soft text-shu", yamabuki: "bg-yamabuki-soft text-yamabuki", wakatake: "bg-wakatake-soft text-wakatake", ai: "bg-ai-soft text-ai" };

/** The 指示受け status of one change as a small badge: 未指示受け／受け ◯◯ hh:mm／確認済み／医師に確認中. */
export function TakeBadgeMark({ badge, className = "" }: { badge: TakeBadge; className?: string }) {
  return (
    <span title="看護師の指示受けの状態" className={`inline-block whitespace-nowrap rounded px-1 text-[10px] font-bold ${BADGE_CLASS[badge.tone]} ${className}`}>
      {badge.text}
    </span>
  );
}

/**
 * 指示確認: after taking a change, the nurse looks at what it puts on the schedule for today and tomorrow
 * (doses, times, tasks — expanded by the worksheet's code) and records that she looked. For a stop, the
 * doses that will no longer be given. Text changes (指示簿・食事・延長) show what to read instead.
 */
export function TakeConfirm({ row, plan, today, interactive, onConfirm, onClose }: { row: TakeRow; plan: ConfirmPlan; today: CalendarDate; interactive: boolean; onConfirm: () => void; onClose: () => void }) {
  const [looked, setLooked] = useState(false);
  const stop = row.kind === "中止";
  return (
    <div className="rounded-md border border-ai/40 bg-sheet px-3 py-2 text-[12px]">
      <p className="font-bold">
        指示確認：{row.kind === "変更" ? "【変】" : row.kind} {row.main}
        <span className="ml-2 font-normal text-ink-soft">{row.detail}</span>
      </p>
      <p className="mt-0.5 text-ink-soft">{plan.note}</p>
      {plan.days.some((d) => d.items.length > 0) && (
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          {plan.days.map((d) => (
            <div key={d.day}>
              <p className={`border-b border-rule pb-0.5 font-bold ${stop ? "text-shu" : ""}`}>
                {d.label}
                <span className="ml-1 font-normal text-ink-soft">{d.items.length}件{stop ? "（実施しない）" : ""}</span>
              </p>
              {d.items.length === 0 ? (
                <p className="py-0.5 text-ink-faint">なし</p>
              ) : (
                <ul className="nums">
                  {d.items.map((i, k) => (
                    <li key={`${i.orderId}-${i.at}-${k}`} className={`flex gap-2 border-b border-rule-soft py-0.5 ${stop ? "line-through" : ""}`}>
                      <span className="w-12 shrink-0 font-bold">{i.at !== null ? timeLabel(i.at, d.day, today) : ""}</span>
                      <span className="w-8 shrink-0 text-ink-soft">{i.kind}</span>
                      <span>
                        {i.main}
                        <span className="ml-1 text-ink-soft">{i.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
      {plan.running.length > 0 && (
        <p className="mt-1">
          <b>続くもの</b>　{plan.running.map((r) => `${r.main}（${r.detail}）`).join("／")}
        </p>
      )}
      {plan.untimed.length > 0 && (
        <p className="mt-1">
          <b>時刻のないもの（必要時・1日N回）</b>　{plan.untimed.map((i) => `${i.main}　${i.detail}`).join("／")}
        </p>
      )}
      {interactive && (
        <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-rule-soft pt-1.5">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={looked} onChange={(e) => setLooked(e.target.checked)} className="accent-ai" />
            {plan.entry ? (stop ? "中止のあとの予定が消えることと、準備した薬の片づけを確かめた" : "今日と明日の予定（時刻・回数・量）が指示と合うことを自分の目で確かめた") : "文を読み、いまの指示と合うことを確かめた"}
          </label>
          <button type="button" disabled={!looked} onClick={onConfirm} className="rounded bg-ai px-3 py-0.5 font-bold text-white disabled:opacity-40">
            予定を確認した
          </button>
          <button type="button" onClick={onClose} className="text-ink-soft underline">
            あとで
          </button>
        </div>
      )}
      <p className="hint mt-1 text-[10px] text-ink-faint">指示受けのあとに、指示が作る予定を見てから実施に入ります（指示受け → 指示確認 → 実施入力）。予定はワークシートと同じコードで広げています。参考：{CONFIRM_SOURCES.map((s) => s.label.split("（")[0]).join("／")}。</p>
    </div>
  );
}
