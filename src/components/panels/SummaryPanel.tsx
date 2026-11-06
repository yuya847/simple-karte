"use client";

import { displayText } from "@/lib/display-text";
import { Printer } from "lucide-react";
import { useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { SUMMARY_KINDS, SUMMARY_RULES, lastReturn, latest, stateOf, type NurseSummary, type SummaryKind } from "@/lib/nursing-summary";
import { DESTINATIONS, type Destination, type SummarySection } from "@/lib/summary";
import { ageSex } from "@/lib/person";
import type { Patient } from "@/lib/types";
import { useMe } from "../RoleContext";
import { TabChoice } from "../TabChoice";

/** 看護サマリ handed in to the 看護師長 (nurses): the patient's summaries and how to hand one in. */
export interface NursingSummaries {
  summaries: NurseSummary[];
  onSubmit: (kind: SummaryKind, to: Destination | undefined, words: string, sections: SummarySection[], resubmitOf?: string) => void;
}

const STATE_STYLE = { 承認待ち: "bg-yamabuki-soft text-yamabuki", 差し戻し: "bg-shu-soft text-shu", 承認済み: "bg-wakatake-soft text-wakatake" } as const;

/** This patient's 看護サマリ with their state, the 看護師長's comment, and 「直して出し直す」. */
function Handed({ list, onRedo }: { list: NurseSummary[]; onRedo: (s: NurseSummary) => void }) {
  if (!list.length) return null;
  return (
    <section className="rounded-md border border-rule bg-sheet p-2 text-[12px]">
      <h3 className="mb-1 font-bold text-ink-soft">この患者の看護サマリ</h3>
      <ul className="space-y-1">
        {list.map((s) => {
          const st = stateOf(s);
          const back = lastReturn(s);
          const v = latest(s);
          return (
            <li key={s.id} className="nums rounded border border-rule-soft bg-paper px-2 py-1">
              <span className="font-bold">{s.kind}</span>
              {v.to && <span className="ml-1 text-ink-soft">宛先：{v.to}</span>}
              <span className={`ml-2 rounded px-1.5 text-[11px] font-bold ${STATE_STYLE[st]}`}>{st}</span>
              <span className="ml-2 text-ink-faint">
                第{s.versions.length}版 {v.at.time} {displayText(v.by)}
              </span>
              {s.events
                .filter((e) => e.kind === "承認" || e.kind === "差し戻し")
                .map((e, i) => (
                  <div key={i} className={e.kind === "承認" ? "text-wakatake" : "text-shu"}>
                    {e.kind} {e.at.time} {displayText(e.by)}
                    {e.comment && `：${e.comment}`}
                  </div>
                ))}
              {st === "差し戻し" && back && (
                <button type="button" onClick={() => onRedo(s)} className="mt-0.5 rounded border border-ai px-2 py-0.5 text-ai hover:bg-ai hover:text-white">
                  直して出し直す
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * 連携サマリ（看護サマリ）: the facts gathered from the record by code, the destination and the
 * writer's own words, on one sheet to print or hand over. Nothing is written by AI. A nurse hands the
 * 看護サマリ in to the 看護師長 (退院・転院時・転棟時・中間).
 */
export function SummaryPanel({ room, patient, facts, today, nowTime, onSave, nursing }: { room?: string; patient: Patient; facts: SummarySection[]; today: string; nowTime: string; onSave: (to: Destination, words: string, facts: SummarySection[]) => void; nursing?: NursingSummaries }) {
  const me = useMe();
  const [to, setTo] = useState<Destination | null>(null);
  const [words, setWords] = useState("");
  const [saved, setSaved] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [kind, setKind] = useState<SummaryKind | null>(null);
  const [redo, setRedo] = useState<string | null>(null);
  const handIn = me.role === "看護師" && !!nursing;
  const title = handIn && kind === "中間" ? "中間サマリ（看護）" : me.role === "看護師" ? "看護サマリ" : "連携サマリ";
  const needTo = !handIn || kind !== "中間";
  const ready = handIn ? !!kind && (!needTo || !!to) : !!to;
  const mine = nursing?.summaries.filter((s) => s.patientId === patient.id) ?? [];
  const sheet = (
    <article className="space-y-2 text-[12px] leading-relaxed print:text-[10.5pt]">
      <header className="border-b border-rule pb-1">
        <h2 className="text-base font-bold">
          {title}
          {handIn && kind && kind !== "中間" && <span className="ml-2 text-sm font-normal">（{kind}）</span>}
          {to && needTo && <span className="ml-2 text-sm font-normal">宛先：{to}</span>}
        </h2>
        <p className="nums text-ink-soft">
          {patient.name}（{patient.kana}）　{ageSex(patient)}　ID {patient.id}　{patient.ward} {room ?? patient.room}　主治医 {patient.attending}　作成 {today} {nowTime} {me.name}
        </p>
      </header>
      {facts.map((s) => (
        <section key={s.heading}>
          <h3 className="font-bold text-ink-soft">{s.heading}</h3>
          <ul className="pl-3">
            {s.lines.map((l, i) => (
              <li key={i} className={l === "記録なし" ? "text-ink-faint" : ""}>
                {l}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section>
        <h3 className="font-bold text-ink-soft">申し送り（{me.name}）</h3>
        <p className="whitespace-pre-wrap pl-3">{words || "—"}</p>
      </section>
      <p className="text-[10px] text-ink-faint">項目はカルテの記録からコードで集めたもの。申し送りは書いた人の言葉です。</p>
    </article>
  );
  const print = () => {
    flushSync(() => setPrinting(true));
    const done = () => {
      setPrinting(false);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };
  return (
    <div className="max-w-3xl space-y-3 text-[13px]">
      {handIn && (
        <>
          <Handed
            list={mine}
            onRedo={(s) => {
              setRedo(s.id);
              setKind(s.kind);
              setTo(latest(s).to ?? null);
              setWords(latest(s).words);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink-soft">種類</span>
            <TabChoice label="サマリの種類" options={SUMMARY_KINDS.map((k) => ({ value: k, label: k === "中間" ? "中間サマリ" : k }))} value={kind} onChange={(k) => (setKind(k), setRedo(null))} />
            {redo && <span className="rounded bg-shu-soft px-1.5 text-[11px] font-bold text-shu">差し戻されたサマリを直しています</span>}
          </div>
        </>
      )}
      {needTo && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink-soft">宛先</span>
          <TabChoice label="サマリの宛先" options={DESTINATIONS.map((d) => ({ value: d, label: d }))} value={to} onChange={setTo} />
        </div>
      )}
      <textarea value={words} onChange={(e) => setWords(e.target.value)} rows={4} placeholder={kind === "中間" ? "ここまでの経過と、これからの看護で大事なこと（自分の言葉で）" : "申し送り（自分の言葉で：本人・家族の希望、介護で気をつけること、続けてほしいケアなど）"} aria-label="申し送り" className="w-full rounded border border-rule bg-paper px-2 py-1" />
      <div className="flex flex-wrap items-center gap-2">
        {handIn ? (
          <button
            type="button"
            disabled={!ready}
            onClick={() => {
              if (!kind) return;
              nursing!.onSubmit(kind, needTo ? (to ?? undefined) : undefined, words.trim(), facts, redo ?? undefined);
              setRedo(null);
            }}
            className="rounded-md bg-ai px-4 py-1.5 font-bold text-white disabled:opacity-40"
          >
            {redo ? "直して看護師長に出し直す" : `${title}を看護師長に提出`}
          </button>
        ) : (
          <button type="button" disabled={!to} onClick={() => { if (to) { onSave(to, words.trim(), facts); setSaved(true); } }} className="rounded-md bg-ai px-4 py-1.5 font-bold text-white disabled:opacity-40">
            {title}を確定（記録に残す）
          </button>
        )}
        <button type="button" disabled={!ready} onClick={print} className="flex items-center gap-1 rounded-md border border-rule px-3 py-1.5 disabled:opacity-40">
          <Printer size={14} />
          印刷
        </button>
        {!ready && <span className="text-[12px] text-yamabuki">{handIn && !kind ? "種類を選んでください" : "宛先を選んでください"}</span>}
      </div>
      {saved && <p role="status">連携サマリを確定しました。カルテの経過に残しました。</p>}
      {handIn && <p className="text-[11px] text-ink-faint">{SUMMARY_RULES.approve}</p>}
      <div className="rounded-md border border-rule bg-sheet p-3">{sheet}</div>
      {printing && typeof document !== "undefined" && createPortal(<div className="hidden bg-white p-6 text-ink print:block">{sheet}</div>, document.body)}
    </div>
  );
}
