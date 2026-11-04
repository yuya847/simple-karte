"use client";

import { VERBAL_RULE } from "@/lib/verbal";
import { LayoutTemplate, Loader2, Mic, MicOff, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { formatShort, hospitalDay, type CalendarDate } from "@/lib/dates";
import { isReady, type CheckContext, type Draft, type Issue } from "@/lib/drafts";
import type { Patient } from "@/lib/types";
import { useSpeech } from "@/lib/use-speech";
import { DraftCard } from "./DraftCard";
import { DenyNote, useDeny, useMe } from "./RoleContext";
import { isBlankNote } from "@/lib/notes";
import { rpNumbers } from "@/lib/rp";
import { placeBlock, type Placed } from "@/lib/note-insert";
import { TemplatePanel } from "./NoteTemplates";

export interface DraftMeta {
  model: string;
  speed: string;
  ms: number;
}

interface Props {
  patient: Patient;
  today: CalendarDate;
  note: string;
  onNoteChange: (v: string) => void;
  instruction: string;
  onInstructionChange: (v: string) => void;
  /** Append dictated text to the instruction box. */
  onAppendInstruction: (text: string) => void;
  drafts: Draft[];
  issues: Record<string, Issue[]>;
  ctx: CheckContext;
  drafting: boolean;
  error: string | null;
  meta: DraftMeta | null;
  flash: string | null;
  onDraft: () => void;
  onApply: (d: Draft) => void;
  onRemove: (id: string) => void;
  onRedo: (id: string) => void;
  onConfirm: () => void;
  /** Who is writing orders: the doctor, a nurse taking a spoken order (口頭指示), or nobody (other roles). */
  orderMode: "doctor" | "verbal" | "none";
  /** Save today's note into the record (who and when are added by code). */
  onConfirmNote: () => void;
}

/**
 * The box where the doctor says or types orders for Claude to draft. Hidden for now (the user's
 * request, 2026-11-03): orders are picked from the tools on the right and collect under the note.
 */
const SHOW_DICTATION = false;

/** Today's writing: the note on top, then the order drafts collecting under it. */
export function TodayPane(p: Props) {
  const box = useRef<HTMLTextAreaElement>(null);
  const noteBox = useRef<HTMLTextAreaElement>(null);
  const [tool, setTool] = useState<"template" | null>(null);
  const me = useMe();
  const noteLocked = !!useDeny()("note");
  const speech = useSpeech(p.onAppendInstruction);

  const readyCount = p.drafts.filter((d) => isReady(p.issues[d.id] ?? [])).length;
  const pending = p.drafts.length - readyCount;
  const canConfirm = p.drafts.length > 0 && pending === 0;
  // Text put into the note at the cursor (or in place of the empty frame); the cursor goes after it.
  const put = (make: (note: string, start: number, end: number) => Placed) => {
    const el = noteBox.current;
    const r = make(p.note, el?.selectionStart ?? p.note.length, el?.selectionEnd ?? p.note.length);
    p.onNoteChange(r.text);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(r.caret, r.caret);
    });
  };
  const toolButton = (key: NonNullable<typeof tool>, label: string, Icon: typeof LayoutTemplate) => (
    <button
      type="button"
      aria-pressed={tool === key}
      onClick={() => setTool(tool === key ? null : key)}
      className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs pointer-coarse:py-1.5 ${tool === key ? "border-ai bg-ai text-white" : "border-rule bg-sheet text-ink-soft hover:text-ink"}`}
    >
      <Icon size={13} />
      {label}
    </button>
  );

  return (
    <section aria-label="今日の記事" className="flex min-h-0 flex-1 flex-col bg-sheet">
      <div className="nums flex items-baseline gap-2 border-b border-rule-soft px-4 py-2">
        <h2 className="text-sm font-bold">今日の記事</h2>
        <span className="text-xs text-ink-faint">
          {formatShort(p.today)}　入院{hospitalDay(p.patient.admittedOn, 0)}日目
        </span>
      </div>

      <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        <div>
          {!noteLocked && (
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              {toolButton("template", "テンプレート", LayoutTemplate)}
            </div>
          )}
          {!noteLocked && tool === "template" && (
            <div className="mb-2">
              <TemplatePanel key={me.name} patient={p.patient} today={p.today} onInsert={(text) => (put((n, s, e) => placeBlock(n, s, e, text)), setTool(null))} onClose={() => setTool(null)} />
            </div>
          )}
          <textarea
            ref={noteBox}
            value={p.note}
            onChange={(e) => p.onNoteChange(e.target.value)}
            readOnly={noteLocked}
            aria-label="記事"
            rows={7}
            className="nums w-full resize-y rounded-md border border-rule bg-sheet px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-ai read-only:bg-paper"
          />
          <div className="mt-1 flex items-center gap-2">
            <DenyNote action="note" />
            {!noteLocked && (
              <>
                <span className="hint text-[11px] text-ink-faint">確定すると左の経過に残ります。確定のあとで直すと、前の版も残ります。</span>
                <button
                  type="button"
                  disabled={isBlankNote(p.note)}
                  onClick={p.onConfirmNote}
                  className="ml-auto shrink-0 rounded-md border border-ink px-3 py-1 text-xs font-bold text-ink hover:bg-ink hover:text-white disabled:opacity-30"
                >
                  記事を確定（{me.name}）
                </button>
              </>
            )}
          </div>
        </div>

        {p.orderMode === "none" ? (
          <DenyNote action="order" className="rounded-lg border border-rule bg-paper px-3 py-2" />
        ) : !SHOW_DICTATION ? null : (
        <div className={`rounded-lg border p-3 ${p.orderMode === "verbal" ? "border-yamabuki/40 bg-yamabuki-soft/40" : "border-ai/30 bg-ai-soft/40"}`}>
          <div className={`mb-2 flex flex-wrap items-center gap-x-2 text-sm font-bold ${p.orderMode === "verbal" ? "text-yamabuki" : "text-ai"}`}>
            <Sparkles size={15} />
            {p.orderMode === "verbal" ? "口頭指示を受けて入力（看護師）" : "指示（話す・打つ）"}
            <span className="text-xs font-normal text-ink-soft">
              {p.orderMode === "verbal" ? `→ 医師が言ったとおりに話すか打ちます。確定すると医師の承認待ちになります。${VERBAL_RULE}` : "→ Claude がオーダの下書きにします。決めるのは医師です。"}
            </span>
          </div>
          <textarea
            ref={box}
            value={p.instruction}
            onChange={(e) => p.onInstructionChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                if (!p.drafting && p.instruction.trim()) p.onDraft();
              }
            }}
            aria-label="指示"
            rows={3}
            maxLength={800}
            placeholder="例：CEZは中止。VCM 1g 12時間ごと、生食100に溶いて1時間で、今日の18時から。明日朝 CBC、生化、CRP。"
            className="w-full resize-y rounded-md border border-rule bg-sheet px-3 py-2 text-[13px] leading-relaxed outline-none placeholder:text-ink-faint focus:border-ai"
          />
          {speech.listening && speech.interim && <p className="mt-1 text-xs text-ink-soft">…{speech.interim}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!speech.supported}
              onClick={speech.listening ? speech.stop : speech.start}
              title={speech.supported ? "話して入力（Chrome の音声認識）" : "このブラウザは音声入力に対応していません"}
              className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs ${
                speech.listening ? "border-shu bg-shu text-white" : "border-rule bg-sheet text-ink-soft hover:text-ink disabled:opacity-50"
              }`}
            >
              {speech.listening ? <MicOff size={14} /> : <Mic size={14} />}
              {speech.listening ? "止める" : "話す"}
            </button>
            {speech.error && <span className="text-xs text-shu">{speech.error}</span>}
            {p.meta && !p.drafting && (
              <span className="nums text-[11px] text-ink-faint">
                {p.meta.model}
                {p.meta.speed === "fast" ? "（fast）" : ""}・{(p.meta.ms / 1000).toFixed(1)}秒
              </span>
            )}
            <button
              type="button"
              disabled={p.drafting || !p.instruction.trim()}
              onClick={p.onDraft}
              className="ml-auto flex items-center gap-1.5 rounded-md bg-ai px-3 py-1.5 text-xs font-bold text-white hover:bg-ai/90 disabled:bg-ai/40"
            >
              {p.drafting && <Loader2 size={14} className="animate-spin" />}
              {p.drafting ? "下書き中…" : "下書きにする"}
              {!p.drafting && <kbd className="rounded border border-white/40 px-1 text-[10px] font-normal">⌘↵</kbd>}
            </button>
          </div>
          {p.error && <p className="mt-2 text-xs text-shu">{p.error}</p>}
        </div>
        )}

        {p.orderMode !== "none" && !SHOW_DICTATION && (
          <div className={`rounded-lg border border-dashed px-3 py-2 text-xs ${p.orderMode === "verbal" ? "border-yamabuki/60 text-yamabuki" : "hint border-rule text-ink-soft"}`}>
            {p.orderMode === "verbal" ? <b>口頭指示を受けて入力（看護師）：</b> : <b>オーダ：</b>}
            上のタブ「注射」「内服」で Rp を入れるか、右のツール（検体検査・画像検査・生理検査・処置）から選ぶと、ここに下書きが貯まります。確認に答えて、下の「確定」でまとめて確定します。
            {p.orderMode === "verbal" && ` 確定すると医師の承認待ちになります。${VERBAL_RULE}`}
          </div>
        )}

        {p.drafts.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-ink-soft">オーダの下書き（{p.drafts.length}件）</h3>
            {p.drafts.map((d) => (
              <DraftCard
                key={d.id}
                rp={rpNumbers(p.drafts)[d.id]}
                draft={d}
                issues={p.issues[d.id] ?? []}
                ctx={p.ctx}
                onApply={p.onApply}
                onRemove={() => p.onRemove(d.id)}
                onRedo={
                  SHOW_DICTATION
                    ? () => {
                        p.onRedo(d.id);
                        box.current?.focus();
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-rule bg-paper px-4 py-2.5">
        <span className="text-xs text-ink-soft">
          {p.flash ? (
            <span className="text-wakatake">{p.flash}</span>
          ) : p.drafts.length === 0 ? (
            "下書きはまだありません"
          ) : pending > 0 ? (
            <>
              確定できる {readyCount}件・<b className="text-yamabuki">確認が残っている {pending}件</b>
            </>
          ) : (
            `${readyCount}件すべて確定できます`
          )}
        </span>
        {p.orderMode !== "none" && (
        <button
          type="button"
          disabled={!canConfirm}
          onClick={p.onConfirm}
          className={`ml-auto rounded-md px-6 py-2 text-sm font-bold text-white disabled:opacity-30 ${p.orderMode === "verbal" ? "bg-yamabuki" : "bg-ink hover:bg-ink/90"}`}
        >
          {p.orderMode === "verbal" ? "口頭指示で" : ""}確定{p.drafts.length > 0 ? `（${p.drafts.length}件）` : ""}
        </button>
        )}
      </div>
    </section>
  );
}
