"use client";

import { Eye, PhoneCall } from "lucide-react";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { hitLine, type PanicCall, type ResultItem } from "@/lib/results";
import { DenyNote, useDeny } from "./RoleContext";

interface Props {
  today: CalendarDate;
  /** Results of this patient the doctor has not marked as seen. */
  items: ResultItem[];
  calls: Record<string, PanicCall>;
  onSeen: (keys: string[]) => void;
  onOpenResults: () => void;
}

/** In the chart: results not seen yet, with panic values (and the phone call) first. */
export function ResultsInbox({ today, items, calls, onSeen, onOpenResults }: Props) {
  const locked = !!useDeny()("result.ack");
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => b.panic.length - a.panic.length);
  const panic = items.filter((i) => i.panic.length > 0);
  return (
    <section className={`border-b px-4 py-2 text-[12px] ${panic.length ? "border-shu/50 bg-shu-soft/60" : "border-rule bg-ai-soft/40"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Eye size={14} className={panic.length ? "text-shu" : "text-ai"} />
        <b className={panic.length ? "text-shu" : "text-ai"}>
          未確認の結果 {items.length}件{panic.length ? `（パニック値 ${panic.length}件）` : ""}
        </b>
        <span className="text-ink-soft">見たら「確認した」を押します（誰がいつ見たかが残ります）。</span>
        <button type="button" onClick={onOpenResults} className="ml-auto rounded border border-rule bg-sheet px-2 py-0.5 text-ink-soft hover:text-ink">
          検査結果を開く
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={() => onSeen(items.map((i) => i.key))}
          className="rounded bg-ai px-2 py-0.5 font-bold text-white disabled:opacity-40"
        >
          すべて確認した
        </button>
      </div>
      <ul className="mt-1 space-y-0.5">
        {sorted.map((i) => {
          const call = calls[i.key];
          return (
            <li key={i.key} className="flex flex-wrap items-baseline gap-2">
              <span className="rounded bg-sheet px-1 text-[11px] text-ink-soft">{i.kind}</span>
              <span className="nums text-ink-faint">
                {i.day === 0 ? "今日" : formatShort(addDays(today, i.day))} {i.time}
              </span>
              <span>{i.title}</span>
              {i.panic.length > 0 ? (
                <b className="text-shu">パニック値：{i.panic.map(hitLine).join("、")}</b>
              ) : (
                <span className="text-ink-soft">{i.detail}</span>
              )}
              {call && (
                <span className="flex items-center gap-0.5 text-ink-soft">
                  <PhoneCall size={11} />
                  {call.at.time} {call.by} → {call.to}
                  {call.readBack ? "（復唱あり）" : "（復唱なし）"}
                </span>
              )}
              <button type="button" disabled={locked} onClick={() => onSeen([i.key])} className="rounded border border-ai px-1.5 text-[11px] text-ai disabled:opacity-40">
                確認した
              </button>
            </li>
          );
        })}
      </ul>
      <DenyNote action="result.ack" className="mt-1" />
    </section>
  );
}
