"use client";
import { hasLabTable } from "@/lib/lab-transfer";
import { displayText } from "@/lib/display-text";
import { TimeInput } from "@/components/TimeInput";

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
import { isLabPasteLine, isVitalsPasteLine, labPasteText, vitalsPasteText } from "@/lib/lab-paste";
import { preferredNoteForm, rememberNoteForm, NOTE_FORMS, eventDays, eventTimeProblem, formFrame, isBlankNote, normalMoment, noteFormOf } from "@/lib/notes";
import { addDays } from "@/lib/dates";
import { rpNumbers } from "@/lib/rp";
import { placeBlock, type Placed } from "@/lib/note-insert";
import { loadPhrases, type Phrase } from "@/lib/phrases";
import { type NoteTemplate, type TemplateFacts } from "@/lib/note-templates";
import { rxLastDay } from "@/lib/day-pattern";
import { preparePhrase } from "@/lib/template-expansion";
import { TemplatePanel, TemplateForm } from "./NoteTemplates";
import { PhrasePanel } from "./NotePhrases";
import { DraftSetComposer } from "./DraftSetComposer";
import { reusableDraft } from "@/lib/saved-sets";
import { NoteBlocks, type NoteBlocksHandle } from "./NoteBlocks";

export interface DraftMeta {
  model: string;
  speed: string;
  ms: number;
}

interface Props {
  sharedNoteTemplates?: NoteTemplate[];
  onSharedNoteTemplates?: (list: NoteTemplate[]) => void;
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
  /** 内服・注射の入力（開いているとき）：記事の下、下書きが溜まる場所の上に出す。 */
  orderSlot?: React.ReactNode;
  /** Opens the 型のある記録 (IC・救急加算・ICU 入室 …) tool from the note's template popup. */
  onOpenRecordTemplates?: () => void;
  onDraft: () => void;
  onApply: (d: Draft) => void;
  onRemove: (id: string) => void;
  /** New order of the drafts (by id): 用法ごとに並べる. */
  onReorder?: (ids: string[]) => void;
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
  const [setSelection, setSetSelection] = useState<string[]>([]);
  const box = useRef<HTMLTextAreaElement>(null);
  const noteBox = useRef<NoteBlocksHandle>(null);
  const [tool, setTool] = useState<"template" | "phrase" | null>(null);
  const me = useMe();
  // 定型文 of the person writing (kept per person in this browser), and the text selected in the note.
  const [ph, setPh] = useState<{ user: string; list: Phrase[] }>(() => ({ user: me.name, list: loadPhrases(me.name) }));
  if (ph.user !== me.name) setPh({ user: me.name, list: loadPhrases(me.name) });
  const [selected, setSelected] = useState("");
  const [phraseForm, setPhraseForm] = useState<{ body: string; note: string; start: number; end: number; patientId: string; author: string } | null>(null);
  const facts: TemplateFacts = { patient: p.patient, today: p.today, now: p.nowTime, author: me.name, role: me.role, medications: p.ctx.activeOrders.filter(e => e.order.type === "prescription" && e.order.start.day <= 0 && (rxLastDay(e.order, p.today) ?? 0) >= 0).map(e => p.ctx.describe(e)).join("\n") || "なし" };
  const expandPhrase = (body: string, start: number, end: number) => {
    const prepared = preparePhrase(body, facts);
    if (prepared.needsForm) {
      setPhraseForm({ body, note: p.note, start, end, patientId: p.patient.id, author: me.name });
    } else {
      const text = prepared.text;
      p.onNoteChange(p.note.slice(0, start) + text + p.note.slice(end));
      noteBox.current?.select(start + text.length);
    }
  };
  const { note, nowTime, onNoteChange } = p;
  useEffect(() => {
    if (isBlankNote(note)) {
      const form = preferredNoteForm(me.role);
      if (noteFormOf(note) !== form) onNoteChange(formFrame(form, nowTime));
    }
  }, [me.role, note, nowTime, onNoteChange]);
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
              <TemplatePanel shared={p.sharedNoteTemplates} onShared={p.onSharedNoteTemplates} extraFacts={facts} key={`${me.name}:${p.patient.id}`} patient={p.patient} today={p.today} onOpenRecords={p.onOpenRecordTemplates ? () => { setTool(null); p.onOpenRecordTemplates!(); } : undefined} onInsert={(text) => (put((n, s, e) => placeBlock(n, s, e, text)), setTool(null))} onClose={() => setTool(null)} />
            </div>
          )}
          {!noteLocked && tool === "phrase" && (
            <div className="mb-2">
              <PhrasePanel phrases={ph.list} onPhrases={(list) => setPh({ user: me.name, list })} selected={selected} onInsert={(text) => { const range = noteBox.current?.selection ?? { start: p.note.length, end: p.note.length }; expandPhrase(text, range.start, range.end); }} onClose={() => setTool(null)} />
            </div>
          )}
          {phraseForm && <div role="dialog" aria-label="定型文の入力" className="rounded border border-ai bg-sheet p-3">
            <button type="button" onClick={() => setPhraseForm(null)} className="text-xs underline">閉じる</button>
            {phraseForm.note !== p.note || phraseForm.patientId !== p.patient.id || phraseForm.author !== me.name || noteLocked ? <p>記事や記載者が変わりました。閉じて定型文を呼び直してください。</p> : <TemplateForm key={phraseForm.body} t={{ id: "phrase", name: "定型文", roles: [], body: phraseForm.body }} facts={facts} onInsert={text => { p.onNoteChange(p.note.slice(0, phraseForm.start) + text + p.note.slice(phraseForm.end)); noteBox.current?.select(phraseForm.start + text.length); setPhraseForm(null); }} />}
          </div>}
          <div className={hasLabTable(p.note) ? "font-mono" : undefined}><NoteBlocks onCommand={setTool} onPhrase={expandPhrase} ref={noteBox} value={p.note} onChange={p.onNoteChange} phrases={ph.list} readOnly={noteLocked} onSelectedText={setSelected} pastes={[{ test: isLabPasteLine, text: () => labPasteText(p.patient, p.today) }, { test: isVitalsPasteLine, text: () => vitalsPasteText(p.patient, p.today) }]} /></div>
          {p.orderSlot}
          {p.drafts.length > 0 && (
            <div aria-label="オーダの下書き" className="space-y-1">
              <DraftSetComposer key={`${p.patient.id}:${me.name}`} drafts={p.drafts} ctx={p.ctx} selected={setSelection} onDone={() => setSetSelection([])} />
              {/* One box per kind of order (内服・注射…), its Rp as rows inside (ユーザー 2026-11-06：内服毎に四角で分かれない). */}
              {draftGroups(p.drafts).map((group) => {
                const rx = group[0].kind === "prescription";
                return (
                  <section key={group[0].id} aria-label={`${GROUP_LABEL[group[0].kind] ?? "オーダ"}の下書き`} className="my-1 rounded-md border border-ai/40 bg-ai-soft/20">
                    <div className="flex items-center gap-2 border-b border-ai/20 px-2 py-0.5 text-[11px] font-bold text-ai">
                      {GROUP_LABEL[group[0].kind] ?? "オーダ"}
                      {rx && group.length > 1 && p.onReorder && (
                        <button type="button" onClick={() => p.onReorder!(sortByUsage(p.drafts, group.map((d) => d.id)))} className="ml-auto rounded px-1.5 py-0.5 font-normal text-ai hover:bg-ai-soft">
                          用法ごとに並べる
                        </button>
                      )}
                    </div>
                    {group.map((d) => (
                      <div key={d.id} className="flex items-start">
                      {reusableDraft(d) && <input aria-label="セットに含める下書き" type="checkbox" checked={setSelection.includes(d.id)} onChange={e => setSetSelection(v => e.target.checked ? [...v, d.id] : v.filter(id => id !== d.id))} className="m-2 accent-ai" />}
                      <div className="min-w-0 flex-1"><DraftCard
                        bare
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
                      /></div></div>
                    ))}
                  </section>
                );
              })}
            </div>
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
              <TimeInput value={p.noteAt.time} onChange={(e) => p.onNoteAt({ ...p.noteAt!, time: e.target.value })} aria-label="記録の時刻" className="nums rounded border border-rule bg-sheet px-1 py-0.5" />
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
                {/* The keys, folded: the note area stays a writing area. */}

                <span className="ml-auto text-[11px] text-ink-faint">{displayText(isBlankNote(p.note) ? "" : "上の「保存」で記事が確定します")}</span>
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
              {p.drafting ? "下書き中…" : "保存する"}
              {!p.drafting && <kbd className="rounded border border-white/40 px-1 text-[10px] font-normal">⌘↵</kbd>}
            </button>
          </div>
          {p.error && <p className="mt-2 text-xs text-shu">{p.error}</p>}
        </div>
        )}




      </div>

      <div className="flex items-center gap-3 border-t border-rule bg-paper px-4 py-2.5">
        <div className="text-xs text-ink-soft">
          {p.flash ? (
            <div className="text-wakatake" role="status">
              {displayText(typeof p.flash === "string" ? p.flash : p.flash.text)}
              {typeof p.flash !== "string" && p.flash.warn && <b className="ml-2 rounded bg-shu px-1.5 text-white">{p.flash.warn}</b>}
              {typeof p.flash !== "string" && p.flash.contact && <div>
                {p.flash.contact.reasons.map((reason) => <p key={reason}>{reason}</p>)}

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

/* Help migration source (references and dynamic wording):
<p >
              記録の形式（SOAP・フォーカス・経時記録）の根拠：
              {NOTE_FORM_SOURCES.map((x, i) => (
                <a key={x.name} href={x.url} target="_blank" rel="noreferrer" >
                  {i > 0 ? "、" : ""}
                  {x.name}
                </a>
              ))}
            </p>
<details >
                  <summary >書き方のこつ</summary>
                  <ul >
                    {me.role === "看護師" && <li>フォーカスは「＃ 見出し」の下に D)・Act)・R)、経時記録は1行ずつ時刻から。</li>}
                    <li>行頭の＃（全角）で問題の番号。Enter で次の＃、空の＃で Enter で本文へ。＃の行は Alt+↑↓・つまみで動かせます。</li>
                    <li>S) O) A) P) と打つと区切りが出ます。--- だけの行は仕切り。</li>
                    <li>「LD」→ Tab で直近の血液検査、「ばいたる」→ Tab で直近のバイタル、「;読み」→ Tab で定型文。⌘B 太字・⌘I 斜体。</li>
                  </ul>
                </details>
<div `}>
            {p.orderMode === "verbal" ? <b>口頭指示を受けて入力（看護師）：</b> : <b>オーダ：</b>}
            上のタブ「注射」「内服」で Rp を入れるか、右のツール（検体検査・画像検査・生理検査・処置）から選ぶと、ここに下書きが貯まります。確認に答えて、下の「確定」でまとめて確定します。
            {p.orderMode === "verbal" && ` 確定すると医師の承認待ちになります。${VERBAL_RULE}`}
          </div>
<p >NEWS2 7点以上は医師へ連絡。院内連絡は模擬です。</p>
*/

const GROUP_LABEL: Partial<Record<Draft["kind"], string>> = { prescription: "処方オーダ", injection: "注射オーダ", lab: "検体検査", imaging: "画像検査", physio: "生理検査", procedure: "処置", stop: "中止", extend: "延長", diet: "食事", "opd-booking": "外来予約" };

/** Consecutive drafts of the same kind (and, for 内服, the same 区分) make one box. */
function draftGroups(drafts: Draft[]): Draft[][] {
  const key = (d: Draft) => d.kind === "prescription" ? `rx:${d.category}` : d.kind;
  const out: Draft[][] = [];
  for (const d of drafts) {
    const last = out[out.length - 1];
    if (last && key(last[0]) === key(d)) last.push(d);
    else out.push([d]);
  }
  return out;
}

/** The 内服 of one box sorted by 用法 (same timings together, then 頓用), the rest left where they are. */
function sortByUsage(drafts: Draft[], ids: string[]): string[] {
  const usage = (d: Draft) => d.kind !== "prescription" ? "" : d.timings === null ? "~" : d.timings.length ? `${String(9 - d.timings.length)}${d.timings.join("・")}` : `z${d.prn ?? ""}`;
  const inGroup = drafts.filter((d) => ids.includes(d.id));
  const sorted = [...inGroup].sort((a, b) => usage(a).localeCompare(usage(b), "ja"));
  let k = 0;
  return drafts.map((d) => (ids.includes(d.id) ? sorted[k++].id : d.id));
}
