"use client";

import { Mic, Sparkles } from "lucide-react";
import { formatShort, hospitalDay, type CalendarDate } from "@/lib/dates";
import type { Patient } from "@/lib/types";

interface Props {
  patient: Patient;
  today: CalendarDate;
  note: string;
  onNoteChange: (v: string) => void;
  instruction: string;
  onInstructionChange: (v: string) => void;
}

/** Today's writing: the note on top, then the spoken/typed instructions and their order drafts. */
export function TodayPane({ patient, today, note, onNoteChange, instruction, onInstructionChange }: Props) {
  return (
    <section aria-label="今日の記事" className="flex min-h-0 flex-col bg-sheet">
      <div className="nums flex items-baseline gap-2 border-b border-rule-soft px-4 py-2">
        <h2 className="text-sm font-bold">今日の記事</h2>
        <span className="text-xs text-ink-faint">
          {formatShort(today)}　入院{hospitalDay(patient.admittedOn, 0)}日目
        </span>
      </div>

      <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          aria-label="記事"
          rows={8}
          className="nums w-full resize-y rounded-md border border-rule bg-sheet px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-ai"
        />

        <div className="rounded-lg border border-ai/30 bg-ai-soft/40 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-ai">
            <Sparkles size={15} />
            指示（話す・打つ）
            <span className="font-normal text-xs text-ink-soft">→ オーダの下書きになります。決めるのは医師です。</span>
          </div>
          <textarea
            value={instruction}
            onChange={(e) => onInstructionChange(e.target.value)}
            aria-label="指示"
            rows={3}
            placeholder="例：CEZは中止。VCM 1g 12時間ごと、生食100に溶いて1時間で、今日の10時から。明日朝 CBC、生化、CRP。"
            className="w-full resize-y rounded-md border border-rule bg-sheet px-3 py-2 text-[13px] leading-relaxed outline-none placeholder:text-ink-faint focus:border-ai"
          />
          <div className="mt-2 flex items-center gap-2">
            <button type="button" disabled className="flex items-center gap-1 rounded-md border border-rule bg-sheet px-2.5 py-1.5 text-xs text-ink-faint">
              <Mic size={14} />
              話す
            </button>
            <button type="button" disabled className="ml-auto rounded-md bg-ai/50 px-3 py-1.5 text-xs font-bold text-white">
              下書きにする
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-rule bg-paper px-4 py-2.5">
        <span className="text-xs text-ink-faint">下書きはまだありません</span>
        <button type="button" disabled className="ml-auto rounded-md bg-ink/40 px-6 py-2 text-sm font-bold text-white">
          確定
        </button>
      </div>
    </section>
  );
}
