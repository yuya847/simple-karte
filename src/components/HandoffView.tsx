"use client";

import { useNoteOverview } from "./NoteOverview";
import { displayText } from "@/lib/display-text";
import { ArrowRightLeft, Check, Loader2, Mic, Plus, Sparkles, Square, X } from "lucide-react";
import { nursingShift } from "@/lib/nursing-shift";
import { shiftWindow } from "@/lib/worksheet";
import { useState } from "react";
import { CLAUDE, auditLog } from "@/lib/audit";
import type { CalendarDate } from "@/lib/dates";
import { abs } from "@/lib/flowsheet";
import { FIELDS, SEVERITIES, emptyHandoff, handoffFacts, handoffKey, nextShift, previousHandoff, sendProblems, statusOf, type Handoff, type Severity } from "@/lib/handoff";
import { useSpeech } from "@/lib/use-speech";
import type { WorkPatient } from "@/lib/worksheet";
import { PatientAvatar } from "./PatientAvatar";
import { DenyNote, useDeny, useMe } from "./RoleContext";
import { ageSex } from "@/lib/person";

interface Props {
  people: WorkPatient[];
  today: CalendarDate;
  nowTime: string;
  handoffs: Record<string, Handoff>;
  /** More facts per patient gathered elsewhere (e.g. results not yet seen). */
  extraFacts?: Record<string, string[]>;
  onSave: (h: Handoff) => void;
  onSend: (h: Handoff) => void;
  onReceive: (h: Handoff) => void;
}

const SEV_STYLE: Record<string, string> = {
  wakatake: "border-wakatake bg-wakatake text-white",
  yamabuki: "border-yamabuki bg-yamabuki text-white",
  shu: "border-shu bg-shu text-white",
};
const STATUS_STYLE: Record<string, string> = {
  未作成: "text-ink-faint",
  作成中: "text-yamabuki",
  送り済み: "text-ai",
  受け済み: "text-wakatake",
};

/** 申し送り for the whole ward, one patient at a time, in the I-PASS order. */
export function HandoffView({ people, today, nowTime, handoffs, extraFacts = {}, onSave, onSend, onReceive }: Props) {
  const me = useMe();
  const nowAbs = abs(0, nowTime);
  const [receiving, setReceiving] = useState(true);
  const current = nursingShift(nowAbs);
  const ns = receiving ? { label: current.shift === "night" ? "日勤→夜勤" : "夜勤→日勤", ...shiftWindow(current.shift, current.day) } : nextShift(nowAbs);
  const [sel, setSel] = useState(people[0]?.patient.id ?? "");
  const w = people.find((x) => x.patient.id === sel);
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr] bg-paper">
      <aside className="scroll-thin min-h-0 overflow-y-auto border-r border-rule bg-sheet p-3">
        <h2 className="mb-1 flex items-center gap-1.5 font-bold">
          <ArrowRightLeft size={16} />
          申し送り（{ns.label}）
        </h2>

        <div className="mb-3 flex gap-2 text-xs"><button type="button" aria-pressed={receiving} onClick={() => setReceiving(true)} className="rounded border border-rule px-2 py-1">{current.shift === "night" ? "日勤から受ける" : "夜勤から受ける"}</button><button type="button" aria-pressed={!receiving} onClick={() => setReceiving(false)} className="rounded border border-rule px-2 py-1">次の勤務へ送る</button></div>
        <ul className="space-y-1">
          {people.map((x) => {
            const h = handoffs[handoffKey(x.patient.id, ns.lo, me.role)];
            const st = statusOf(h);
            const sev = SEVERITIES.find((s) => s.key === h?.severity);
            return (
              <li key={x.patient.id}>
                <button
                  type="button"
                  onClick={() => setSel(x.patient.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] ${sel === x.patient.id ? "bg-ai-soft" : "hover:bg-paper"}`}
                >
                  <PatientAvatar sex={x.patient.sex} age={x.patient.age} size={26} className="rounded-full" />
                  <span className="min-w-0 flex-1">
                    <span className="nums text-xs text-ink-faint">{x.room}</span> <b>{x.patient.name}</b>
                    <span className={`block text-[11px] ${STATUS_STYLE[st]}`}>
                      {st}
                      {sev ? `・${sev.key}` : ""}
                    </span>
                  </span>
                  {sev && <span className={`h-2.5 w-2.5 rounded-full ${sev.tone === "shu" ? "bg-shu" : sev.tone === "yamabuki" ? "bg-yamabuki" : "bg-wakatake"}`} />}
                </button>
              </li>
            );
          })}
        </ul>

      </aside>
      {w ? (
        <Card
          key={handoffKey(w.patient.id, ns.lo, me.role)}
          receiving={receiving}
          shiftLo={ns.lo}
          prev={previousHandoff(handoffs, w.patient.id, ns.lo, me.role)}
          w={w}
          today={today}
          nowTime={nowTime}
          shift={ns.label}
          facts={handoffFacts(w, nowAbs, today, extraFacts[w.patient.id])}
          h={handoffs[handoffKey(w.patient.id, ns.lo, me.role)]}
          onSave={onSave}
          onSend={onSend}
          onReceive={onReceive}
        />
      ) : (
        <p className="p-6 text-ink-faint">病棟に患者がいません。</p>
      )}
    </div>
  );
}

function Card({ receiving, w, nowTime, shift, shiftLo, prev, facts, h: saved, onSave, onSend, onReceive }: { receiving: boolean; w: WorkPatient; today: CalendarDate; nowTime: string; shift: string; shiftLo: number; prev?: Handoff; facts: string[]; h?: Handoff; onSave: (h: Handoff) => void; onSend: (h: Handoff) => void; onReceive: (h: Handoff) => void }) {
  const me = useMe();
  const deny = useDeny()("handoff");
  const overview = useNoteOverview(w.patient.id);
  const [h, setH] = useState<Handoff>(() => saved ?? { ...emptyHandoff(`ho-${w.patient.id}-${Date.now()}`, w.patient.id, shift, me.name), shiftLo, role: me.role, summary: overview.summary, actions: overview.todos.map(t => ({ text: t.text })) });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unplaced, setUnplaced] = useState("");
  const [newAction, setNewAction] = useState("");
  const [to, setTo] = useState(receiving ? me.name : saved?.to ?? (me.role === "医師" ? "当直医 松本" : `看護師 田中（${shift.split("→")[1]}）`));
  const [synthesis, setSynthesis] = useState(saved?.synthesis ?? "");
  const speech = useSpeech((t) => setText((cur) => (cur ? `${cur}${/[。、]$/.test(cur) ? "" : "。"}${t}` : t)));
  const sent = !!h.sentAt;
  const received = !!h.receivedAt;
  const problems = sendProblems(h);
  const locked = !!deny || sent;

  const place = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/handoff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `エラー（${res.status}）`);
      const f = json.fields as { summary: string; actions: string[]; contingency: string; unplaced: string };
      setH((cur) => ({
        ...cur,
        summary: [cur.summary, f.summary].filter((x) => x.trim()).join("\n"),
        actions: [...cur.actions, ...f.actions.filter((x) => x.trim()).map((t) => ({ text: t }))],
        contingency: [cur.contingency, f.contingency].filter((x) => x.trim()).join("\n"),
      }));
      setUnplaced(f.unplaced);
      auditLog({ role: "AI", actor: CLAUDE, action: "申し送りの言葉を欄に分けた", patient: w.patient.name, detail: `要約・やること ${f.actions.length}件・もし〜なら${json.meta?.ms ? `（${(json.meta.ms / 1000).toFixed(1)}秒）` : ""}` });
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み取れませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="scroll-thin min-h-0 overflow-y-auto p-4 text-[13px]">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <PatientAvatar sex={w.patient.sex} age={w.patient.age} size={36} className="rounded-full" />
        <h3 className="text-base font-bold">
          {w.room}　{w.patient.name}さん
        </h3>
        <span className="text-xs text-ink-soft">
          {ageSex(w.patient)}　{shift}
        </span>
        <span className={`ml-auto text-xs font-bold ${STATUS_STYLE[statusOf(saved)]}`}>{statusOf(saved)}</span>
      </header>
      <DenyNote action="handoff" className="mb-2" />
      {receiving && sent && <div className="mb-3 rounded border border-rule bg-sheet p-3"><h4 className="font-bold">受けた申し送り</h4><p className="whitespace-pre-wrap">{h.summary}</p><ul>{h.actions.map((a, i) => <li key={i}>{a.text}</li>)}</ul><p>{h.contingency}</p></div>}
      {!sent && !receiving ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {problems.length > 0 && <span className="text-xs text-yamabuki">{problems.join("・")}</span>}
          <button type="button" disabled={!!deny} onClick={() => onSave({ ...h, from: me.name })} className="ml-auto rounded border border-rule px-3 py-1 text-xs disabled:opacity-40">
            途中まで残す
          </button>
          <button
            type="button"
            disabled={!!deny || problems.length > 0}
            onClick={() => {
              const x: Handoff = { ...h, from: me.name, facts, sentAt: { day: 0, time: nowTime } };
              setH(x);
              onSend(x);
            }}
            className="rounded-md bg-ink px-5 py-1.5 text-sm font-bold text-white disabled:opacity-30"
          >
            送る（{me.name}）
          </button>
        </div>
      ) : sent ? (
        <div className="mt-3 rounded-lg border border-wakatake/40 bg-wakatake-soft/40 p-3">
          <Field letter="S" label={FIELDS[4].label} en={FIELDS[4].en}>
            <p className="mb-1 text-[11px] text-ink-soft">
              {h.sentAt!.time} に {displayText(h.from)} が送りました。受けた人は、聞いた要点を自分の言葉で言い直して（復唱して）残します。
            </p>
            <fieldset disabled={received || !!deny} className="m-0 min-w-0 space-y-1 border-0 p-0">
              <label className="flex items-center gap-1 text-xs text-ink-soft">
                受けた人
                <input value={displayText(to)} onChange={(e) => setTo(e.target.value)} className="w-56 rounded border border-rule bg-sheet px-1.5 py-0.5 text-ink" />
              </label>
              <textarea value={synthesis} onChange={(e) => setSynthesis(e.target.value)} rows={2} aria-label="受けた人の復唱" placeholder="例：22時 VCM、朝の採血。38.5度超えで血培2セットと当直へ連絡。" className="w-full rounded border border-rule bg-sheet px-2 py-1 outline-none" />
            </fieldset>
            {received ? (
              <p className="mt-1 flex items-center gap-1 text-xs font-bold text-wakatake">
                <Check size={13} />
                {h.receivedAt!.time} に {h.to} が受けました
              </p>
            ) : (
              <button
                type="button"
                disabled={!!deny || !synthesis.trim() || !to.trim()}
                onClick={() => {
                  const x: Handoff = { ...h, to: to.trim(), synthesis: synthesis.trim(), receivedAt: { day: 0, time: nowTime } };
                  setH(x);
                  onReceive(x);
                }}
                className="mt-1 rounded-md bg-wakatake px-4 py-1 text-xs font-bold text-white disabled:opacity-40"
              >
                復唱して受けた
              </button>
            )}
          </Field>
        </div>
      ) : <p>この勤務への申し送りはまだ届いていません。</p>}

      {prev && (
        <details className="mb-3 rounded-lg border border-rule-soft bg-paper p-3">
          <summary className="cursor-pointer text-xs font-bold text-ink-soft">
            前の勤務の申し送り（{prev.shift}　{displayText(prev.from)}
            {prev.sentAt ? ` ${prev.sentAt.time}` : ""}）
          </summary>
          <p className="mt-1">{prev.summary}</p>
          {prev.actions.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {prev.actions.map((a, i) => (
                <li key={i}>{displayText(a.text)}</li>
              ))}
            </ul>
          )}
          {prev.contingency && <p className="mt-1 text-ink-soft">もし：{prev.contingency}</p>}
        </details>
      )}

      <div className="mb-3 rounded-lg border border-rule bg-sheet p-3">
        <h4 className="mb-1 text-xs font-bold text-ink-soft">カルテから</h4>
        <ul className="list-disc space-y-0.5 pl-5">
          {(sent ? h.facts : facts).map((f, i) => (
            <li key={i} className="nums">
              {f}
            </li>
          ))}
          {facts.length === 0 && <li className="text-ink-faint">集める事実がありません。</li>}
        </ul>
        {sent && <p className="mt-1 text-[11px] text-ink-faint">送った時点（{h.sentAt!.time}）の内容です。</p>}
      </div>

      {!locked && !receiving && (
        <div className="mb-3 rounded-lg border border-ai/30 bg-ai-soft/40 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-sm font-bold text-ai">
            <Sparkles size={14} />
            話す・打つ
            <span className="text-xs font-normal text-ink-soft">→ Claude が下の欄に分けます（言葉は変えません）</span>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={2000}
            aria-label="申し送りの口述"
            placeholder="例：蜂窩織炎で入院4日目、VCM に変わって熱は下がってきています。夜は 22時の VCM と、明日朝の採血をお願いします。38.5度を超えたら血培2セットとって当直に連絡してください。"
            className="w-full rounded-md border border-rule bg-sheet px-3 py-2 outline-none focus:border-ai"
          />
          {speech.listening && speech.interim && <p className="text-xs text-ink-soft">…{speech.interim}</p>}
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              disabled={!speech.supported}
              onClick={speech.listening ? speech.stop : speech.start}
              className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs ${speech.listening ? "border-shu bg-shu text-white" : "border-rule bg-sheet text-ink-soft"}`}
            >
              {speech.listening ? <Square size={12} /> : <Mic size={13} />}
              {speech.listening ? "止める" : "話す"}
            </button>
            {error && <span className="text-xs text-shu">{error}</span>}
            <button type="button" disabled={busy || !text.trim()} onClick={place} className="ml-auto flex items-center gap-1 rounded-md bg-ai px-3 py-1 text-xs font-bold text-white disabled:bg-ai/40">
              {busy && <Loader2 size={13} className="animate-spin" />}
              欄に分ける
            </button>
          </div>
          {unplaced.trim() && <p className="mt-1 text-xs text-yamabuki">どの欄か決められなかった言葉：「{unplaced}」 必要なら自分で欄に入れてください。</p>}
        </div>
      )}

      <fieldset hidden={receiving} disabled={locked} className="m-0 min-w-0 space-y-3 border-0 p-0">
        <Field letter="I" label={FIELDS[0].label} en={FIELDS[0].en}>
          <div className="flex flex-wrap items-center gap-1.5">
            {SEVERITIES.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={h.severity === s.key}
                onClick={() => setH({ ...h, severity: s.key as Severity })}
                className={`rounded-md border px-3 py-1 text-xs font-bold ${h.severity === s.key ? SEV_STYLE[s.tone] : "border-rule bg-sheet text-ink-soft"}`}
              >
                {s.key}（{s.en}）
              </button>
            ))}

          </div>
        </Field>
        <Field letter="P" label={FIELDS[1].label} en={FIELDS[1].en}>
          <textarea value={h.summary} onChange={(e) => setH({ ...h, summary: e.target.value })} rows={3} aria-label="患者の要約" className="w-full rounded border border-rule bg-sheet px-2 py-1 outline-none" />
        </Field>
        <Field letter="A" label={FIELDS[2].label} en={FIELDS[2].en}>
          <ul className="space-y-1">
            {h.actions.map((a, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!a.done}
                  onChange={(e) => setH({ ...h, actions: h.actions.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)) })}
                  className="accent-wakatake"
                  aria-label="済み"
                />
                <input
                  value={a.text}
                  onChange={(e) => setH({ ...h, actions: h.actions.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                  className={`flex-1 rounded border border-rule bg-sheet px-2 py-0.5 ${a.done ? "text-ink-faint line-through" : ""}`}
                />
                <button type="button" onClick={() => setH({ ...h, actions: h.actions.filter((_, j) => j !== i) })} aria-label="消す" className="rounded p-0.5 text-ink-faint hover:text-shu">
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1 flex gap-1">
            <input value={newAction} onChange={(e) => setNewAction(e.target.value)} placeholder="やることを足す" className="flex-1 rounded border border-rule bg-sheet px-2 py-0.5" />
            <button
              type="button"
              disabled={!newAction.trim()}
              onClick={() => {
                setH({ ...h, actions: [...h.actions, { text: newAction.trim() }] });
                setNewAction("");
              }}
              className="flex items-center gap-0.5 rounded border border-rule px-2 text-xs disabled:opacity-40"
            >
              <Plus size={12} />
              足す
            </button>
          </div>
        </Field>
        <Field letter="S" label={FIELDS[3].label} en={FIELDS[3].en}>
          <textarea value={h.contingency} onChange={(e) => setH({ ...h, contingency: e.target.value })} rows={2} aria-label="見通しともしもの計画" placeholder="もし〜なら〜する" className="w-full rounded border border-rule bg-sheet px-2 py-1 outline-none" />
        </Field>
      </fieldset>


    </section>
  );
}

function Field({ letter, label, en, children }: { letter: string; label: string; en: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[2rem_1fr] gap-2">
      <div className="grid h-7 w-7 place-items-center rounded-md bg-ink text-sm font-bold text-white" title={en}>
        {letter}
      </div>
      <div>
        <div className="mb-1 text-xs font-bold">
          {label} <span className="font-normal text-ink-faint">{en}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

/* Help migration source (references and dynamic wording):
<p >I-PASS の順に送ります。カルテの事実はコードで集め、話した言葉は Claude が欄に分けるだけです。重症度は送る人が選びます。</p>
<p >出典：{IPASS_SOURCE}</p>
<span >（コードで集めた事実。AI は使っていません）</span>
*/
