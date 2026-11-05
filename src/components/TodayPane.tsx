"use client";

import { VERBAL_RULE } from "@/lib/verbal";
import { Clock3, LayoutTemplate, Loader2, Mic, MicOff, Sparkles, TextQuote } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatShort, hospitalDay, type CalendarDate } from "@/lib/dates";
import { isReady, type CheckContext, type Draft, type Issue } from "@/lib/drafts";
import type { Flash } from "@/lib/flash";
import type { Patient } from "@/lib/types";
import { useSpeech } from "@/lib/use-speech";
import { DraftCard } from "./DraftCard";
import { DenyNote, useDeny, useMe } from "./RoleContext";
import { preferredNoteForm, rememberNoteForm, NOTE_FORMS, NOTE_FORM_SOURCES, eventDays, eventTimeProblem, formFrame, isBlankNote, normalMoment, noteFormOf } from "@/lib/notes";
import { addDays } from "@/lib/dates";
import { rpNumbers } from "@/lib/rp";
import { insertAt, placeBlock, type Placed } from "@/lib/note-insert";
import { loadPhrases, type Phrase } from "@/lib/phrases";
import { TemplatePanel } from "./NoteTemplates";
import { PhrasePanel } from "./NotePhrases";
import { NoteBlocks, type NoteBlocksHandle } from "./NoteBlocks";

export interface DraftMeta {
  model: string;
  speed: string;
  ms: number;
}

interface Props {
  patient: Patient;
  today: CalendarDate;
  /** Now ("HH:MM"), for a line of a 経時記録. */
  nowTime: string;
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
  flash: Flash | null;
  onContactDoctor?: () => void;
  /** Opens the 型のある記録 (IC・救急加算・ICU 入室 …) tool from the note's template popup. */
  onOpenRecordTemplates?: () => void;
  onDraft: () => void;
  onApply: (d: Draft) => void;
  onRemove: (id: string) => void;
  onRedo: (id: string) => void;
  onConfirm: () => void;
  /** Who is writing orders: the doctor, a nurse taking a spoken order (口頭指示), or nobody (other roles). */
  orderMode: "doctor" | "verbal" | "none";
  /** Save today's note into the record (who and when are added by code). */
  onConfirmNote: () => void;
  /** 記録時刻 set by hand when writing late (null = the time it is confirmed). */
  noteAt: { day: number; time: string } | null;
  onNoteAt: (at: { day: number; time: string } | null) => void;
}

/**
 * The box where the doctor says or types orders for Claude to draft. Hidden for now (the user's
 * request, 2026-11-03): orders are picked from the tools on the right and collect under the note.
 */
const SHOW_DICTATION = false;

/** Today's writing: the note on top, then the order drafts collecting under it. */
export function TodayPane(p: Props) {
  const box = useRef<HTMLTextAreaElement>(null);
  const noteBox = useRef<NoteBlocksHandle>(null);
  const [tool, setTool] = useState<"template" | "phrase" | null>(null);
  const me = useMe();
  // 定型文 of the person writing (kept per person in this browser), and the text selected in the note.
  const [ph, setPh] = useState<{ user: string; list: Phrase[] }>(() => ({ user: me.name, list: loadPhrases(me.name) }));
  if (ph.user !== me.name) setPh({ user: me.name, list: loadPhrases(me.name) });
  const [selected, setSelected] = useState("");
  useEffect(() => {
    if (isBlankNote(p.note)) {
      const form = preferredNoteForm(me.role);
      if (noteFormOf(p.note) !== form) p.onNoteChange(formFrame(form, p.nowTime));
    }
  }, [me.role, p.note, p.nowTime, p.onNoteChange]);
  const noteLocked = !!useDeny()("note");
  const speech = useSpeech(p.onAppendInstruction);

  const readyCount = p.drafts.filter((d) => isReady(p.issues[d.id] ?? [])).length;
  const pending = p.drafts.length - readyCount;
  const canConfirm = p.drafts.length > 0 && pending === 0;
  const timeProblem = p.noteAt ? eventTimeProblem(p.noteAt, { day: 0, time: p.nowTime }, p.patient.admittedOn) : null;
  // Text put into the note at the cursor — the line the caret is on — (or in place of the empty frame);
  // the cursor goes after it once the lines have rendered.
  const put = (make: (note: string, start: number, end: number) => Placed) => {
    const sel = noteBox.current?.selection ?? { start: p.note.length, end: p.note.length };
    const r = make(p.note, sel.start, sel.end);
    p.onNoteChange(r.text);
    noteBox.current?.select(r.caret);
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
        {!noteLocked && !p.noteAt && (
          <button type="button" onClick={() => p.onNoteAt(normalMoment({ day: 0, time: p.nowTime }))} className="inline-flex items-center gap-1 ml-auto shrink-0 px-1.5 py-0.5 text-[11px] text-ink-soft hover:text-ink" title="出来事の時刻が保存の時刻と違うとき（遅れて書くとき）">
            <Clock3 size={12} />
            記録時刻を変更する
          </button>
        )}
      </div>

      <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        <div>
          {!noteLocked && (
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              {toolButton("template", "テンプレート", LayoutTemplate)}
              {toolButton("phrase", "定型文", TextQuote)}
              {me.role === "看護師" && (
                <span role="group" aria-label="記録の形式" className="ml-auto flex items-center gap-0.5 rounded-md border border-rule p-0.5 text-[11px]">
                  {NOTE_FORMS.map((f) => {
                    const on = noteFormOf(p.note) === f;
                    const blank = isBlankNote(p.note);
                    return (
                      <button
                        key={f}
                        type="button"
                        aria-pressed={on}
                        disabled={!on && !blank}
                        title={on ? `${f}で書いています` : blank ? `${f}の枠にする` : "書きかけがあるので形式は変えられません（確定するか、消してから）"}
                        onClick={() => { rememberNoteForm(me.role, f); if (!on) p.onNoteChange(formFrame(f, p.nowTime)); }}
                        className={`rounded px-1.5 py-0.5 pointer-coarse:py-1 ${on ? "bg-wakatake font-bold text-white" : "text-ink-soft hover:text-ink disabled:opacity-40"}`}
                      >
                        {f}
                      </button>
                    );
                  })}
                </span>
              )}
              {me.role === "看護師" && noteFormOf(p.note) === "経時記録" && (
                <button
                  type="button"
                  onClick={() => put((n) => {
                    const text = `${n.replace(/\s*$/, "")}\n${p.nowTime} `;
                    return { text, caret: text.length };
                  })}
                  className="rounded-md border border-wakatake/50 px-2 py-0.5 text-xs text-wakatake hover:bg-wakatake-soft pointer-coarse:py-1.5"
                >
                  ＋今の時刻（{p.nowTime}）
                </button>
              )}
            </div>
          )}
          {!noteLocked && tool === "template" && (
            <div className="mb-2">
              <TemplatePanel key={me.name} patient={p.patient} today={p.today} onOpenRecords={p.onOpenRecordTemplates ? () => { setTool(null); p.onOpenRecordTemplates!(); } : undefined} onInsert={(text) => (put((n, s, e) => placeBlock(n, s, e, text)), setTool(null))} onClose={() => setTool(null)} />
            </div>
          )}
          {!noteLocked && tool === "phrase" && (
            <div className="mb-2">
              <PhrasePanel phrases={ph.list} onPhrases={(list) => setPh({ user: me.name, list })} selected={selected} onInsert={(text) => put((n, s, e) => insertAt(n, s, e, text))} onClose={() => setTool(null)} />
            </div>
          )}
          <NoteBlocks ref={noteBox} value={p.note} onChange={p.onNoteChange} phrases={ph.list} readOnly={noteLocked} onSelectedText={setSelected} />
          {p.drafts.length > 0 && (
            <div aria-label="オーダの下書き">
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
          {!noteLocked && me.role === "看護師" && (
            <p className="hint mt-0.5 text-[10px] text-ink-faint">
              記録の形式（SOAP・フォーカス・経時記録）の根拠：
              {NOTE_FORM_SOURCES.map((x, i) => (
                <a key={x.name} href={x.url} target="_blank" rel="noreferrer" className="underline">
                  {i > 0 ? "、" : ""}
                  {x.name}
                </a>
              ))}
            </p>
          )}
          {!noteLocked && p.noteAt && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-soft">
              <Clock3 size={12} className="shrink-0" />
              <span className="font-bold">記録時刻</span>
              <select value={p.noteAt.day} onChange={(e) => p.onNoteAt({ ...p.noteAt!, day: Number(e.target.value) })} aria-label="記録の日" className="rounded border border-rule bg-sheet px-1 py-0.5">
                {eventDays({ day: 0, time: p.nowTime }, p.patient.admittedOn).map((d) => (
                  <option key={d} value={d}>
                    {d === 0 ? "今日" : d === -1 ? "昨日" : d === 1 ? "翌日" : ""}
                    {formatShort(addDays(p.today, d))}
                  </option>
                ))}
              </select>
              <input type="time" value={p.noteAt.time} onChange={(e) => p.onNoteAt({ ...p.noteAt!, time: e.target.value })} aria-label="記録の時刻" className="nums rounded border border-rule bg-sheet px-1 py-0.5" />
              <button type="button" onClick={() => p.onNoteAt(null)} className="rounded border border-rule px-1.5 py-0.5 hover:text-ink">
                保存の時刻にもどす
              </button>
              {timeProblem && <span className="w-full font-bold text-shu">{timeProblem}</span>}
            </div>
          )}
          <div className="mt-1 flex items-center gap-2">
            <DenyNote action="note" />
            {!noteLocked && (
              <>
                <span className="hint text-[11px] text-ink-faint">
                  確定すると左の経過に残ります。確定のあとで直すと、前の版も残ります。
                  {me.role === "看護師" && "フォーカスは「＃ 見出し」の下に D)（データ）・Act)（行為）・R)（反応）、経時記録は1行ずつ時刻から書きます。"}
                  <br />
                  行頭の＃（全角）は問題の番号（＃尿路感染症 → ＃1 尿路感染症）。半角 # は冠動脈などの番号にそのまま使えます。
                  <br />
                  1行が1つのブロックです。行の左に出るつまみ（⋮⋮）をドラッグすると、その行（＃の行なら見出しと下の本文がまとめて）を青い線の場所へ動かせます（Alt+↑↓ でも）。番号は動かしたあと振り直されます。iPad では行を長押しするとつまみが出ます。
                  <br />
                  Enter で次の行（＃の下は字下げ）、行頭で Backspace で前の行につなぐ、↑↓ で行の間を移る、Tab で字下げ（Shift+Tab で戻す）、⌘B / Ctrl+B で **太字**、⌘I / Ctrl+I で *斜体*、「;読み」→ Tab で定型文。
                </span>
                <span className="ml-auto text-[11px] text-ink-faint">{isBlankNote(p.note) ? "" : "上の「保存」で記事が確定します"}</span>
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
          <div className={`hint rounded-lg border border-dashed px-3 py-2 text-xs ${p.orderMode === "verbal" ? "border-yamabuki/60 text-yamabuki" : "border-rule text-ink-soft"}`}>
            {p.orderMode === "verbal" ? <b>口頭指示を受けて入力（看護師）：</b> : <b>オーダ：</b>}
            上のタブ「注射」「内服」で Rp を入れるか、右のツール（検体検査・画像検査・生理検査・処置）から選ぶと、ここに下書きが貯まります。確認に答えて、下の「確定」でまとめて確定します。
            {p.orderMode === "verbal" && ` 確定すると医師の承認待ちになります。${VERBAL_RULE}`}
          </div>
        )}


      </div>

      <div className="flex items-center gap-3 border-t border-rule bg-paper px-4 py-2.5">
        <div className="text-xs text-ink-soft">
          {p.flash ? (
            <div className="text-wakatake" role="status">
              {typeof p.flash === "string" ? p.flash : p.flash.text}
              {typeof p.flash !== "string" && p.flash.warn && <b className="ml-2 rounded bg-shu px-1.5 text-white">{p.flash.warn}</b>}
              {typeof p.flash !== "string" && p.flash.contact && <div>
                {p.flash.contact.reasons.map((reason) => <p key={reason}>{reason}</p>)}
                <p className="hint">架空の病院の取り決め：NEWS2 7点以上は医師へ連絡。院内連絡は模擬です。</p>
                <button type="button" disabled={!p.onContactDoctor} onClick={p.onContactDoctor} className="rounded bg-shu px-2 py-1 text-white">医師に連絡する</button>
              </div>}
            </div>
          ) : p.drafts.length === 0 ? (
            "下書きはまだありません"
          ) : pending > 0 ? (
            <>
              確定できる {readyCount}件・<b className="text-yamabuki">確認が残っている {pending}件</b>
            </>
          ) : (
            `${readyCount}件すべて確定できます`
          )}
        </div>
        {p.orderMode !== "none" && canConfirm && <span className="ml-auto text-[11px] text-ink-faint">上の「オーダーのみ」か「保存」で飛びます</span>}
      </div>
    </section>
  );
}
