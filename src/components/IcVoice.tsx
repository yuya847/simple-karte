"use client";

// IC を声で記録: a full-screen window (big targets for an iPad at the bedside), opened from 説明・同意書 and from
// the IC templates. 1) The patient (or a proxy) consents to recording and cloud speech recognition — without
// the mark nothing is recorded. 2) The browser's speech recognition writes what is said; the person presses
// who is speaking (医師・患者・家族・看護師, keys 1〜4) and each line gets that speaker and the time. 3) After
// stopping, 「話し手を整える」 sends the lines — names and the rest replaced by code, shown first — and Claude
// guesses the speaker of lines nobody labelled (shown as 見立て; a person's choice wins and can be changed).
// 4) 「IC の記録にする」 has Claude say which spoken words go in 説明内容・相手の反応・同席者; code checks every
// piece is really in what was said and puts the original words in. The doctor edits and confirms: the note
// keeps the consent mark and the whole transcript. The voice itself never reaches this app's server.

import { Check, ChevronLeft, Loader2, Mic, Send, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { auditLog, CLAUDE } from "@/lib/audit";
import { icNames, PLACEHOLDER, redactLine, type IcPatient, type Redacted } from "@/lib/ic/anonymize";
import { consentLine, consentWho, icRecordText, icValues, unplacedLines, type RecordingConsent } from "@/lib/ic/place";
import { addLine, ALL_SPEAKERS, applyGuesses, clockNow, confirmGuesses, isGuess, linesFromPaste, setSpeaker, speakerCounts, speakerKey, speakerOf, SPEAKERS, type Guess, type IcLine, type Speaker } from "@/lib/ic/transcript";
import { verifyPlacement, type Placement } from "@/lib/ic/verify";
import type { SentLine } from "@/lib/ic/wire";
import { fieldKey, parseTemplate, type NoteTemplate, type TemplateValues } from "@/lib/note-templates";
import { findRecordTemplate, type RecordFacts } from "@/lib/record-templates";
import { useSpeech } from "@/lib/use-speech";
import { DenyNote, useDeny, useMe } from "./RoleContext";

const TONE: Record<Speaker, { on: string; chip: string }> = {
  医師: { on: "border-ai bg-ai text-white", chip: "border-ai/50 bg-ai-soft text-ai" },
  患者: { on: "border-wakatake bg-wakatake text-white", chip: "border-wakatake/50 bg-wakatake-soft text-wakatake" },
  家族: { on: "border-yamabuki bg-yamabuki text-white", chip: "border-yamabuki/50 bg-yamabuki-soft text-yamabuki" },
  看護師: { on: "border-fuji bg-fuji text-white", chip: "border-fuji/50 bg-fuji-soft text-fuji" },
  不明: { on: "border-ink-soft bg-ink-soft text-white", chip: "border-rule bg-paper text-ink-soft" },
};
const DEV = process.env.NODE_ENV !== "production";

/** The button that opens the window (from 説明・同意書 and from the IC templates). */
export function IcVoiceButton({ patient, facts, templateId = "rec-ic", onConfirm, className = "" }: { patient: IcPatient; facts: RecordFacts; templateId?: string; onConfirm: (text: string, name: string, templateId: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const template = findRecordTemplate(templateId, []);
  if (!template) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`inline-flex items-center gap-1.5 rounded-md border border-ai px-3 py-1.5 font-bold text-ai hover:bg-ai-soft pointer-coarse:py-2 ${className}`}>
        <Mic size={14} />
        IC を声で記録
      </button>
      {open && <IcVoice patient={patient} facts={facts} template={template} onConfirm={onConfirm} onClose={() => setOpen(false)} />}
    </>
  );
}

type Step = { kind: "talk" } | { kind: "send"; job: "speakers" | "place" } | { kind: "review"; values: TemplateValues; dropped: number; unplaced: IcLine[] };

export function IcVoice({ patient, facts, template: t, onConfirm, onClose }: { patient: IcPatient; facts: RecordFacts; template: NoteTemplate; onConfirm: (text: string, name: string, templateId: string) => void; onClose: () => void }) {
  const me = useMe();
  const deny = useDeny()("note");
  const [consent, setConsent] = useState<RecordingConsent | null>(null);
  const [relation, setRelation] = useState("");
  const [lines, setLines] = useState<IcLine[]>([]);
  const [current, setCurrent] = useState<Speaker | null>(null);
  const [recording, setRecording] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "talk" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claude, setClaude] = useState({ speakers: false, place: false });
  const [paste, setPaste] = useState("");

  // The speaker and time of a piece of speech are those when it began (the first words shown), not when it ended.
  const currentRef = useRef(current);
  const chunk = useRef<{ at: string; who: Speaker | null } | null>(null);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);
  const speech = useSpeech((text) => {
    const c = chunk.current ?? { at: clockNow(), who: currentRef.current };
    chunk.current = null;
    setLines((ls) => addLine(ls, text, c.at, c.who));
  });
  const { interim, listening, start: startSpeech, stop: stopSpeech } = speech;
  useEffect(() => {
    if (interim && !chunk.current) chunk.current = { at: clockNow(), who: currentRef.current };
  }, [interim]);

  // Chrome ends continuous recognition after a silence or a network blip: start again while recording
  // (not after a refusal of the microphone, and at most 5 times in 30 seconds).
  const restarts = useRef<number[]>([]);
  const fatal = !!speech.error && !/no-speech|network|aborted/.test(speech.error);
  useEffect(() => {
    if (!recording || listening || fatal) return;
    const now = Date.now();
    restarts.current = restarts.current.filter((x) => now - x < 30_000);
    if (restarts.current.length >= 5) return;
    restarts.current.push(now);
    startSpeech();
  }, [recording, listening, fatal, startSpeech]);

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (recording) endRef.current?.scrollIntoView({ block: "nearest" });
  }, [lines.length, recording]);

  const who = useMemo(() => ({ ...icNames(patient), ids: patient.id ? [patient.id] : [] }), [patient]);
  const redacted = useMemo(() => new Map<number, Redacted>(recording ? [] : lines.map((l) => [l.id, redactLine(l.text, who)])), [lines, who, recording]);
  const counts = speakerCounts(lines);

  const close = () => {
    if ((lines.length || recording) && !window.confirm("書き起こしを記録に残さずに閉じますか？")) return;
    stopSpeech();
    onClose();
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  // Keys 1〜4 choose who is speaking. Esc is kept here so the drawer behind does not close with the transcript in it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        closeRef.current();
        return;
      }
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable))) return;
      const s = speakerKey(e.key);
      if (s) {
        e.preventDefault();
        e.stopPropagation();
        setCurrent(s);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const markConsent = (by: RecordingConsent["by"]) => {
    const c: RecordingConsent = { by, ...(by === "代理の方" ? { relation: relation.trim() } : {}), recordedBy: me.name, at: clockNow() };
    setConsent(c);
    auditLog({ role: me.role, actor: me.name, action: "確定（録音とクラウドの文字起こしへの同意）", patient: patient.name, detail: consentWho(c) });
  };
  const withdraw = () => {
    if (!consent) return;
    setConsent(null);
    auditLog({ role: me.role, actor: me.name, action: "録音とクラウドの文字起こしへの同意の記録を取り消した", patient: patient.name, detail: consentWho(consent) });
  };
  const startRec = () => {
    if (!consent) return;
    restarts.current = [];
    setRecording(true);
    startSpeech();
    auditLog({ role: me.role, actor: me.name, action: "IC の録音（文字起こし）を始めた", patient: patient.name, detail: consentLine(consent) });
  };
  const stopRec = () => {
    setRecording(false);
    stopSpeech();
    auditLog({ role: me.role, actor: me.name, action: "IC の録音（文字起こし）を止めた", patient: patient.name, detail: `${lines.length}行` });
  };
  const toggleSpeaker = (s: Speaker) => setCurrent((c) => (c === s ? null : s));

  const sentLines = (ls: IcLine[], job: "speakers" | "place"): SentLine[] => ls.map((l) => ({ n: l.id, who: job === "speakers" ? (l.said ?? "?") : speakerOf(l), text: redacted.get(l.id)?.text ?? l.text }));
  // What the preview shows as the speaker sent: for 話し手を整える only a person's choice; "?" is guessed first.
  const sentWho = (l: IcLine, job: "speakers" | "place"): Speaker | "?" => (job === "speakers" ? (l.said ?? "?") : (l.said ?? l.guess ?? "?"));
  const call = async (job: "speakers" | "place", ls: IcLine[]) => {
    const res = await fetch("/api/ic-transcript", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: job, lines: sentLines(ls, job) }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? `エラー（${res.status}）`);
    return json;
  };
  const guessSpeakers = async (ls: IcLine[]) => {
    const json = (await call("speakers", ls)) as { labels: { n: number; speaker: Guess }[]; meta?: { ms?: number } };
    const next = applyGuesses(ls, json.labels);
    setLines(next);
    setClaude((c) => ({ ...c, speakers: true }));
    auditLog({ role: "AI", actor: CLAUDE, action: "IC の書き起こしに話し手の見立てを付けた", patient: patient.name, detail: `${json.labels.length}行（名前などを置き換えた文）${json.meta?.ms ? `（${(json.meta.ms / 1000).toFixed(1)}秒）` : ""}` });
    return next;
  };
  const send = async (job: "speakers" | "place") => {
    if (!consent) return;
    setBusy(true);
    setError(null);
    try {
      let ls = lines;
      if (job === "speakers" || ls.some((l) => !l.said && !l.guess)) ls = await guessSpeakers(ls);
      if (job === "speakers") {
        setStep({ kind: "talk" });
        return;
      }
      const json = (await call("place", ls)) as { placement: Placement; dropped: number; meta?: { ms?: number } };
      // Checked again here against the text that was sent: only words really said go in.
      const { found, added } = verifyPlacement(json.placement, new Map([...redacted].map(([id, r]) => [id, r.text])));
      const values = icValues(t, facts, ls, consent, found, redacted);
      const dropped = (json.dropped ?? 0) + added.length;
      setClaude((c) => ({ ...c, place: true }));
      auditLog({ role: "AI", actor: CLAUDE, action: "IC の発言を記録の欄に置いた", patient: patient.name, detail: `説明内容 ${found.explained.length}・相手の反応 ${found.response.length}・同席者 ${found.attendees.length}${dropped ? `・元の発言にない文 ${dropped}件を外した` : ""}${json.meta?.ms ? `（${(json.meta.ms / 1000).toFixed(1)}秒）` : ""}` });
      setStep({ kind: "review", values, dropped, unplaced: unplacedLines(ls, found) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み取れませんでした。");
      setStep({ kind: "talk" });
    } finally {
      setBusy(false);
    }
  };

  const textFields = useMemo(() => parseTemplate(t.body).fields.filter((f) => f.kind === "文"), [t.body]);
  const review = step.kind === "review" ? step : null;
  const recordText = review && consent ? icRecordText(t, review.values, facts, consent, lines, claude) : "";
  const setValue = (k: string, v: string) => setStep((s) => (s.kind === "review" ? { ...s, values: { ...s.values, [k]: v } } : s));
  const confirmRecord = () => {
    if (!recordText || deny) return;
    onConfirm(recordText, t.name, t.id);
    onClose();
  };

  const sending = step.kind === "send" ? step.job : null;
  const canSend = !!consent && lines.length > 0 && !recording && !busy;
  const big = "rounded-xl border-2 px-5 py-3 text-base font-bold disabled:opacity-40 pointer-coarse:py-4";

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-paper text-[15px] text-ink print:hidden" role="dialog" aria-modal="true" aria-label="IC を声で記録">
      <header className="flex flex-wrap items-center gap-3 border-b border-rule bg-sheet px-5 py-3">
        <Mic size={18} className="text-ai" />
        <b className="text-lg">IC を声で記録</b>
        <span className="text-ink-soft">{patient.name} 様</span>
        <span className="text-sm text-ink-faint">{t.name}</span>
        <button type="button" onClick={close} className="ml-auto flex items-center gap-1 rounded-lg border border-rule px-4 py-2" aria-label="閉じる">
          <X size={18} />
          閉じる
        </button>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8">
        <div className="mx-auto max-w-4xl space-y-4">
          {!review && (
            <section className={`rounded-xl border p-4 ${consent ? "border-wakatake/40 bg-wakatake-soft/40" : "border-rule bg-sheet"}`} aria-label="録音と文字起こしの同意">
              {consent ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Check size={18} className="text-wakatake" />
                  <b>同意：{consentWho(consent)}</b>
                  <span className="nums text-sm text-ink-soft">
                    記録 {consent.recordedBy} {consent.at}
                  </span>
                  {!lines.length && !recording && (
                    <button type="button" onClick={withdraw} className="ml-auto rounded-lg border border-rule px-3 py-1.5 text-sm text-ink-soft">
                      取り消す
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="leading-relaxed">
                    説明の会話を録音して文字にします。声はブラウザの音声認識（Chrome では Google）に送られて文字になります。名前などを置き換えた文だけを Claude（Anthropic）に送り、話し手と記録の欄を整えます。声はこのカルテには残しません。
                  </p>
                  <p className="font-bold">患者さん（または代理の方）が同意しましたか。</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => markConsent("本人")} className={`${big} border-wakatake bg-sheet text-wakatake hover:bg-wakatake-soft`}>
                      本人が同意した
                    </button>
                    <button type="button" disabled={!relation.trim()} onClick={() => markConsent("代理の方")} className={`${big} border-wakatake bg-sheet text-wakatake hover:bg-wakatake-soft`}>
                      代理の方が同意した
                    </button>
                    <label className="flex items-center gap-2">
                      続柄
                      <input value={relation} onChange={(e) => setRelation(e.target.value)} placeholder="長女" aria-label="代理の方の続柄" className="w-28 rounded-lg border border-rule bg-paper px-3 py-2" />
                    </label>
                  </div>
                </div>
              )}
            </section>
          )}

          {consent && !review && (
            <section className="space-y-3" aria-label="録る">
              <div className="flex flex-wrap items-center gap-2">
                {SPEAKERS.map((s, i) => (
                  <button key={s} type="button" aria-pressed={current === s} onClick={() => toggleSpeaker(s)} disabled={!!sending} className={`${big} min-w-28 ${current === s ? TONE[s].on : "border-rule bg-sheet text-ink"}`}>
                    <span className="nums mr-1.5 text-sm opacity-70">{i + 1}</span>
                    {s}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={!speech.supported || !!sending || busy}
                  onClick={recording ? stopRec : startRec}
                  className={`${big} ml-auto flex items-center gap-2 ${recording ? "border-shu bg-shu text-white" : "border-ai bg-ai text-white"}`}
                >
                  {recording ? <Square size={18} /> : <Mic size={18} />}
                  {recording ? "止める" : lines.length ? "続けて録る" : "録る"}
                </button>
              </div>
              <p className="text-sm text-ink-soft">話している人を押すと（キーの 1〜4 でも）、その人の発言として行が付きます。押さない行は、あとで Claude が見立てます。</p>
              {!speech.supported && <p className="text-sm text-yamabuki">この端末のブラウザでは音声認識が使えません。</p>}
              {speech.error && <p className="text-sm text-shu">{speech.error}</p>}
              {DEV && !recording && (
                <details className="rounded-lg border border-dashed border-rule px-3 py-2 text-sm">
                  <summary className="cursor-pointer text-ink-soft">文を貼って試す（開発のときだけ）</summary>
                  <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} aria-label="試しの書き起こし" placeholder={"医師：説明します\nはい"} className="mt-2 w-full rounded border border-rule bg-sheet px-2 py-1" />
                  <button type="button" disabled={!paste.trim()} onClick={() => { setLines((ls) => linesFromPaste(paste, clockNow(), ls)); setPaste(""); }} className="mt-1 rounded border border-ai px-3 py-1 text-ai disabled:opacity-40">
                    行にする
                  </button>
                </details>
              )}
            </section>
          )}

          {consent && !review && (lines.length > 0 || recording) && (
            <section className="rounded-xl border border-rule bg-sheet" aria-label={sending ? "Claude に送る文" : "書き起こし"}>
              {sending && (
                <p className="border-b border-rule px-4 py-2 font-bold text-ai">
                  Claude に送る文です（名前・電話・日付・住所などは
                  <mark className="mx-0.5 rounded bg-yamabuki-soft px-1 text-yamabuki">［氏名］</mark>
                  のように置き換えました）
                </p>
              )}
              <ol className="divide-y divide-rule-soft">
                {lines.map((l) => (
                  <li key={l.id} className="flex items-start gap-3 px-4 py-2">
                    <span className="nums w-[4.5rem] shrink-0 pt-1 text-sm text-ink-faint">{l.at}</span>
                    {sending ? (
                      <span className={`shrink-0 rounded-md border px-2 py-0.5 text-sm ${TONE[sentWho(l, sending) === "?" ? "不明" : (sentWho(l, sending) as Speaker)].chip}`}>{sentWho(l, sending)}</span>
                    ) : (
                      <span className="flex shrink-0 flex-col items-start">
                        <select
                          value={l.said ?? l.guess ?? ""}
                          onChange={(e) => setLines((ls) => setSpeaker(ls, l.id, e.target.value as Speaker))}
                          aria-label={`${l.at} の話し手`}
                          disabled={busy}
                          className={`rounded-md border px-2 py-1 text-sm pointer-coarse:py-2 ${l.said || l.guess ? TONE[speakerOf(l)].chip : "border-rule bg-paper text-ink-faint"} ${isGuess(l) ? "border-dashed" : ""}`}
                        >
                          <option value="" disabled>
                            ―
                          </option>
                          {ALL_SPEAKERS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        {isGuess(l) && <span className="mt-0.5 text-[11px] text-ai">見立て</span>}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 pt-0.5 leading-relaxed">{sending ? <Masked text={redacted.get(l.id)?.text ?? l.text} /> : l.text}</span>
                  </li>
                ))}
                {recording && <li className="px-4 py-2 text-ink-soft">{interim ? `…${interim}` : listening ? "聞いています" : ""}</li>}
              </ol>
              <div ref={endRef} />
            </section>
          )}

          {review && (
            <section className="space-y-3" aria-label="IC の記録">
              <p className="text-sm text-ink-soft">話した言葉のまま欄に入っています。直してから確定してください。</p>
              {review.dropped > 0 && <p className="text-sm text-yamabuki">元の発言にない文 {review.dropped}件は入れていません。</p>}
              <div className="divide-y divide-rule-soft rounded-xl border border-rule bg-sheet px-4 py-1">
                {textFields.map((f) => {
                  const k = fieldKey(f);
                  const v = typeof review.values[k] === "string" ? (review.values[k] as string) : "";
                  return (
                    <label key={k} className="grid gap-1 py-2 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-3">
                      <span className="pt-1 text-sm text-ink-soft">{f.kind === "文" ? f.label : k}</span>
                      <textarea value={v} onChange={(e) => setValue(k, e.target.value)} rows={Math.min(12, Math.max(1, v.split("\n").reduce((n, x) => n + Math.ceil((x.length || 1) / 48), 0)))} className="w-full rounded-lg border border-rule bg-paper px-3 py-2 leading-relaxed" />
                    </label>
                  );
                })}
              </div>
              {review.unplaced.length > 0 && (
                <details className="rounded-xl border border-rule-soft bg-sheet px-4 py-2">
                  <summary className="cursor-pointer text-sm text-ink-soft">欄に入らなかった発言（{review.unplaced.length}行。書き起こしには残ります）</summary>
                  <ul className="mt-1 space-y-0.5 text-sm">
                    {review.unplaced.map((l) => (
                      <li key={l.id}>
                        <span className="nums text-ink-faint">{l.at}</span> {speakerOf(l)}：{l.text}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <details open className="rounded-xl border border-rule-soft bg-sheet px-4 py-2">
                <summary className="cursor-pointer text-sm text-ink-soft">記事に入る文（見本）</summary>
                <pre className="nums mt-1 whitespace-pre-wrap font-[inherit] text-[13px] leading-relaxed">{recordText}</pre>
              </details>
              <DenyNote action="note" />
            </section>
          )}
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t border-rule bg-sheet px-5 py-3">
        <span className="min-w-0 flex-1 text-sm text-ink-soft">
          {error ? (
            <span className="text-shu">{error}</span>
          ) : !consent ? (
            "同意の記録がないと録れません"
          ) : lines.length ? (
            `${lines.length}行（${[...SPEAKERS.map((s) => [s, counts.by[s]] as const), ["不明", counts.by.不明 - counts.unlabelled] as const, ["札なし", counts.unlabelled] as const]
              .filter(([, n]) => n > 0)
              .map(([s, n]) => `${s} ${n}`)
              .join("・")}${counts.guessed ? `、うち見立て ${counts.guessed}` : ""}）`
          ) : null}
        </span>
        {review ? (
          <>
            <button type="button" onClick={() => setStep({ kind: "talk" })} className={`${big} flex items-center gap-1 border-rule bg-paper text-ink`}>
              <ChevronLeft size={18} />
              書き起こしに戻る
            </button>
            <button type="button" disabled={!!deny || !recordText} onClick={confirmRecord} className={`${big} border-ai bg-ai text-white`}>
              記事として確定
            </button>
          </>
        ) : sending ? (
          <>
            <button type="button" disabled={busy} onClick={() => setStep({ kind: "talk" })} className={`${big} border-rule bg-paper text-ink`}>
              やめる
            </button>
            <button type="button" disabled={busy} onClick={() => send(sending)} className={`${big} flex items-center gap-2 border-ai bg-ai text-white`}>
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              この文を Claude に送る
            </button>
          </>
        ) : (
          <>
            {counts.guessed > 0 && (
              <button type="button" disabled={recording || busy} onClick={() => setLines(confirmGuesses)} className={`${big} border-rule bg-paper text-ink`}>
                見立てを確かめた
              </button>
            )}
            <button type="button" disabled={!canSend} onClick={() => setStep({ kind: "send", job: "speakers" })} className={`${big} border-ai bg-sheet text-ai`}>
              話し手を整える
            </button>
            <button type="button" disabled={!canSend} onClick={() => setStep({ kind: "send", job: "place" })} className={`${big} border-ai bg-ai text-white`}>
              IC の記録にする
            </button>
          </>
        )}
      </footer>
    </div>,
    document.body,
  );
}

/** The text that is sent, with each placeholder marked. */
function Masked({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(PLACEHOLDER)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push(
      <mark key={m.index} className="rounded bg-yamabuki-soft px-0.5 text-yamabuki">
        {m[0]}
      </mark>,
    );
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
