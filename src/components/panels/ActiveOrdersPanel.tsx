"use client";

import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { ORDER_TYPE_LABEL, orderLines } from "@/lib/format";
import type { HistoryEntry, OrderEntry } from "@/lib/types";

/** Orders that are still running. These are what duplicate checks compare against. */
export function ActiveOrdersPanel({ entries, today }: { entries: HistoryEntry[]; today: CalendarDate }) {
  const active = entries.filter((e): e is OrderEntry => e.kind === "order" && e.status === "有効");
  if (active.length === 0) return <p className="text-sm text-ink-faint">有効なオーダはありません</p>;
  return (
    <ul className="space-y-2">
      {active.map((e) => {
        const { main, detail } = orderLines(e.order, today);
        return (
          <li key={e.id} className="rounded-md border border-rule-soft bg-paper/60 px-3 py-2 text-[13px]">
            <div className="nums text-[11px] text-ink-faint">
              {ORDER_TYPE_LABEL[e.order.type]}　{formatShort(addDays(today, e.day))} {e.time} 入力　{e.author}
            </div>
            <div className="nums">{main}</div>
            <div className="nums text-xs text-ink-soft">{detail}</div>
          </li>
        );
      })}
    </ul>
  );
}
