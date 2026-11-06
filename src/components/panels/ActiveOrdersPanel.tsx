"use client";

import { displayText } from "@/lib/display-text";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { ORDER_TYPE_LABEL, orderLines } from "@/lib/format";
import type { HistoryEntry } from "@/lib/types";
import { drugCodesOf } from "@/lib/drug-class";
import { activeOrders, activeStandingLines } from "@/lib/active-orders";
import type { StandingLine } from "@/lib/standing-lines";
import { DrugMarks } from "../DrugMarks";

/** Orders that are still running. These are what duplicate checks compare against. */
export function ActiveOrdersPanel({ entries, today, lines = [] }: { entries: HistoryEntry[]; today: CalendarDate; lines?: StandingLine[] }) {
  const active = activeOrders(entries);
  const standing = activeStandingLines(lines);
  if (active.length === 0 && standing.length === 0) return <p className="text-sm text-ink-faint">有効なオーダはありません（未完了の検査・継続中または開始予定の指示がありません）。</p>;
  return (
    <ul className="space-y-2">
      {standing.map(l => <li key={l.id} className="rounded-md border border-rule-soft bg-paper/60 px-3 py-2 text-[13px]"><div className="text-xs text-ink-faint">指示簿・{l.cat}　{displayText(l.by)}</div>{displayText(l.text)}</li>)}
      {active.map((e) => {
        const { main, detail } = orderLines(e.order, today);
        return (
          <li key={e.id} className="rounded-md border border-rule-soft bg-paper/60 px-3 py-2 text-[13px]">
            <div className="nums text-[11px] text-ink-faint">
              {ORDER_TYPE_LABEL[e.order.type]}　{formatShort(addDays(today, e.day))} {e.time} 入力　{displayText(e.author)}
            </div>
            <div className="nums">
              {main}
              <DrugMarks codes={drugCodesOf(e.order)} />
            </div>
            <div className="nums text-xs text-ink-soft">{displayText(detail)}</div>
          </li>
        );
      })}
    </ul>
  );
}
