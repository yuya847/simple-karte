"use client";

import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import type { Booking } from "@/lib/bookings";

const TONE: Record<string, string> = {
  画像: "bg-ai-soft text-ai",
  "生理・内視鏡": "bg-ai-soft text-ai",
  "採血・検体": "bg-fuji-soft text-fuji",
  透析: "bg-wakatake-soft text-wakatake",
  輸血: "bg-shu-soft text-shu",
  リハビリ: "bg-wakatake-soft text-wakatake",
  他科依頼: "bg-yamabuki-soft text-yamabuki",
  手術: "bg-shu-soft text-shu",
  外来予約: "bg-mizu-soft text-mizu",
};

/** 予約の一覧 (left view): the patient's bookings by day, from yesterday to two weeks ahead. */
export function BookingList({ bookings, today }: { bookings: Booking[]; today: CalendarDate }) {
  const shown = bookings.filter((b) => b.day >= -1 && b.day <= 14);
  const days = [...new Set(shown.map((b) => b.day))];
  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3 text-[13px]">
      {days.length === 0 && <p className="text-ink-faint">予約はありません。</p>}
      {days.map((d) => (
        <section key={d} className="mb-3">
          <h3 className={`nums mb-1 text-sm font-bold ${d === 0 ? "text-ai" : ""}`}>
            {formatShort(addDays(today, d))}
            {d === 0 ? "（今日）" : d === 1 ? "（明日）" : ""}
          </h3>
          <ul className="space-y-1">
            {shown
              .filter((b) => b.day === d)
              .map((b, i) => (
                <li key={i} className={`nums flex items-baseline gap-2 rounded border border-rule-soft bg-sheet px-2 py-1 ${b.done ? "opacity-50" : ""}`}>
                  <span className="w-12 shrink-0 font-bold">{b.time ?? "時刻未定"}</span>
                  <span className={`shrink-0 rounded px-1.5 text-[11px] ${TONE[b.kind] ?? "bg-paper"}`}>{b.kind}</span>
                  <span className="min-w-0">{b.label}</span>
                  {b.done && <span className="ml-auto shrink-0 text-[11px] text-ink-faint">済み</span>}
                </li>
              ))}
          </ul>
        </section>
      ))}
      <p className="text-[10px] text-ink-faint">オーダ（外来予約を含む）と手術の予定からコードで並べています（中止したものは出しません）。</p>
    </div>
  );
}
