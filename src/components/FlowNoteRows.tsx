"use client";

import { PencilLine } from "lucide-react";
import { noteMarks, type NoteGroupKey } from "@/lib/flow-notes";
import type { DayOffset, HistoryEntry } from "@/lib/types";
import type { DayBox } from "./FlowDayRows";

const MARK_STYLE: Record<NoteGroupKey, string> = { doctor: "border-ai/50 text-ai", nurse: "border-wakatake/50 text-wakatake", staff: "border-yamabuki/50 text-yamabuki" };

/**
 * 記録: each day, how many notes the doctors (医), nurses (看) and the other staff (他) wrote. Pressing a mark
 * opens that day in 経過 with only those notes; 「記事を書く」 opens the note on the right.
 */
export function FlowNoteRows({ entries, days, box, labelW, onOpen, onWrite }: { entries: HistoryEntry[]; days: DayOffset[]; box: DayBox; labelW: number; onOpen?: (day: DayOffset, kind: NoteGroupKey) => void; onWrite?: () => void }) {
  return (
    <>
      <div className="mt-3 flex items-center gap-2 border-b border-rule py-1 text-[11px] font-bold text-ink-soft">
        記録
        {onWrite && (
          <button type="button" onClick={onWrite} className="ml-auto flex items-center gap-1 rounded border border-ai/50 px-1.5 py-0.5 text-[10px] font-bold text-ai hover:bg-ai-soft">
            <PencilLine size={11} />
            記事を書く
          </button>
        )}
      </div>
      <div className="flex border-b border-rule-soft">
        <div className="shrink-0 py-1 pr-2 text-right text-ink-soft" style={{ width: labelW }}>
          記事
          <div className="text-[9px] text-ink-faint">医・看・他</div>
        </div>
        <div className="relative h-7 flex-1">
          {days.map((d) => {
            const marks = noteMarks(entries, d);
            if (!marks.length) return null;
            const b = box(d);
            return (
              <span key={d} className="absolute top-1 flex justify-center gap-0.5 overflow-hidden" style={{ left: b.left, width: b.width }}>
                {marks.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    disabled={!onOpen}
                    onClick={() => onOpen?.(d, m.key)}
                    title={`${m.label} ${m.count}件（押すと経過でこの日を開く）\n${m.lines.join("\n")}`}
                    aria-label={`${m.label} ${m.count}件を経過で開く`}
                    className={`rounded border bg-sheet px-0.5 text-[10px] leading-4 hover:bg-paper ${MARK_STYLE[m.key]}`}
                  >
                    {m.mark}
                    {m.count}
                  </button>
                ))}
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
}
