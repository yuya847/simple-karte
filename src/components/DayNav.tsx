"use client";

// 日付の移動: 「◀ 今日 11/4（水） ▶」 in the header of 病棟マップ and ◯階の患者一覧, with 「今日に戻る」 and the
// day's admissions and discharges. Buttons are big enough for a finger (iPad).

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { WardAsOf } from "@/lib/ward-asof";

export interface DayNavProps {
  /** The day shown (0 = today). */
  day: number;
  min: number;
  max: number;
  onChange: (day: number) => void;
  /** "11/5（木）" for a day offset. */
  fmtDay: (day: number) => string;
  /** That day's admissions and discharges (planned, or from the record). */
  counts?: { admit: number; discharge: number };
}

/** "今日 11/4（水）", "明日 11/5（木）", "昨日 11/3（火）", or the date alone. */
export function dayLabel(day: number, fmtDay: (day: number) => string): string {
  const rel = day === 0 ? "今日" : day === 1 ? "明日" : day === -1 ? "昨日" : "";
  return rel ? `${rel} ${fmtDay(day)}` : fmtDay(day);
}

const arrow = "flex h-9 w-9 items-center justify-center rounded-md border border-rule bg-sheet text-ink-soft hover:border-ai hover:text-ai disabled:cursor-default disabled:opacity-30 disabled:hover:border-rule disabled:hover:text-ink-soft pointer-coarse:h-11 pointer-coarse:w-11";

export function DayNav({ day, min, max, onChange, fmtDay, counts }: DayNavProps) {
  return (
    <div role="group" aria-label="日付の移動" className="flex flex-wrap items-center gap-1.5 text-sm">
      <button type="button" aria-label="前の日" title="前の日" disabled={day <= min} onClick={() => onChange(day - 1)} className={arrow}>
        <ChevronLeft size={18} />
      </button>
      <span className={`nums min-w-[9em] text-center font-bold ${day === 0 ? "text-ink" : day > 0 ? "text-yamabuki" : "text-ink-soft"}`} aria-live="polite">
        {dayLabel(day, fmtDay)}
      </span>
      <button type="button" aria-label="次の日" title="次の日" disabled={day >= max} onClick={() => onChange(day + 1)} className={arrow}>
        <ChevronRight size={18} />
      </button>
      {day !== 0 && (
        <button type="button" onClick={() => onChange(0)} className="rounded-md border border-ai px-2.5 py-1.5 text-[12px] font-bold text-ai hover:bg-ai-soft pointer-coarse:py-2.5">
          今日に戻る
        </button>
      )}
      {counts && (
        <span className="nums ml-1 text-[12px] text-ink-soft" title={day > 0 ? "この日の入院と退院の予定" : day < 0 ? "この日の入院と退院（記録から）" : "今日の入院と退院（予定と記録から）"}>
          入院 <b className="text-ink">{counts.admit}</b>・退院 <b className="text-ink">{counts.discharge}</b>
        </span>
      )}
    </div>
  );
}

/**
 * The band above a map or list shown for another day: a forecast worked out from the plans (ahead), or what
 * the record says (back). Nothing on today.
 */
export function AsOfBand({ asOf, fmtDay }: { asOf: Pick<WardAsOf, "day" | "known">; fmtDay: (day: number) => string }) {
  if (asOf.day === 0) return null;
  if (asOf.day > 0) {
    return (
      <div role="status" className="shrink-0 border-b border-yamabuki/40 bg-yamabuki-soft/60 px-5 py-1.5 text-[12px] text-ink">
        <b className="text-yamabuki">{fmtDay(asOf.day)}の見込み（予定から計算）</b>

      </div>
    );
  }
  return (
    <div role="status" className="shrink-0 border-b border-rule bg-tab/70 px-5 py-1.5 text-[12px] text-ink">
      {asOf.known ? (
        <>
          <b className="text-ink-soft">{fmtDay(asOf.day)}の記録から</b>
          <span className="ml-2 text-ink-soft">入院日と退院の記録で分かる範囲です。ベッドの位置はいまのもので、誰がいたか分からないベッドは「記録なし」です。</span>
        </>
      ) : (
        <b className="text-ink-soft">{fmtDay(asOf.day)}：この日の記録はありません</b>
      )}
    </div>
  );
}

/* Help migration source (references and dynamic wording):
<span >空床 ＝ いまの空床 ＋ その日より前の退院の予定 − その日より前の入院の予定（明日の朝なら、いまの空床 ＋ 今日の退院 − 今日の入院。ベッドコントロールと同じ式）。その日に入院する予定のベッドは空床のうち「入院予定」として数えます。</span>
*/
