"use client";

import { displayText } from "@/lib/display-text";
import { useState } from "react";
import { useMe } from "./RoleContext";
import { can } from "@/lib/roles";
import { newProcedureDraft, type Draft } from "@/lib/drafts";
import { addressedTo, consultDepartments, consultOrders, consultState, doctorsIn, type ConsultReplies, type consultInbox } from "@/lib/consult";
import type { HistoryEntry, OrderEntry, Patient } from "@/lib/types";
import type { CalendarDate } from "@/lib/dates";
import { templatesFor } from "@/lib/consult-templates";
import { labPasteText, vitalsPasteText } from "@/lib/lab-paste";

const REPLY_TEMPLATE = "所見：\n診断：\n提案：\nフォロー：";
const input = "w-full rounded border border-rule bg-paper p-2";
const field = "rounded border border-rule bg-paper px-2 py-1";
interface Props {
  patient: Patient;
  /** For the dates of the latest labs and vitals the templates quote. */
  today?: CalendarDate;
  entries: HistoryEntry[];
  consults: OrderEntry[];
  replies: ConsultReplies;
  newId: () => string;
  onAdd: (d: Draft) => void;
  onReply: (id: string, text: string, by: string) => void;
  onCloseConsult: (id: string) => void;
  onRefer: (to: string, dept: string, purpose: string, summary: string) => void;
}

export function ConsultPanel({ patient, today, consults, replies, newId, onAdd, onReply, onCloseConsult, onRefer }: Props) {
  const me = useMe();
  const allowed = can(me.role, "consult");
  const [tab, setTab] = useState("院内へ相談");
  const [dept, setDept] = useState("循環器内科");
  const [doctor, setDoctor] = useState("");
  const [question, setQuestion] = useState("");
  const [before, setBefore] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const external = tab === "院外へ紹介";
  const submit = () => {
    if (!allowed || !question.trim() || (external && !to.trim())) return;
    // The body only (ユーザー 2026-11-06：緊急度と経過の要約はいらない). The fields stay in the data for older records.
    if (external) return onRefer(to.trim(), dept, question.trim(), "");
    onAdd({ ...newProcedureDraft("PROC-CONSULT", newId()), consult: { dept, doctor, urgency: "数日以内", question: question.trim(), summary: "" }, schedule: { kind: "once" }, start: { day: 0, time: null } });
  };
  return (
    <div className="space-y-3 text-sm">
      <p>他科依頼・紹介</p>

      <div className="flex gap-2">
        {["院内へ相談", "院外へ紹介"].map(t => <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t} className="rounded border border-rule p-2">{t}</button>)}
      </div>
      <fieldset disabled={!allowed} className="space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          {external && <label className="block">紹介先の医療機関
            <input className={`${field} block w-56`} value={to} onChange={e => setTo(e.target.value)} list="consult-facilities" />
            <datalist id="consult-facilities"><option>架空みどり病院</option><option>架空さくら診療所</option></datalist>
          </label>}
          <label className="block">依頼先の診療科
            <select className={`${field} block w-40`} value={dept} onChange={e => { setDept(e.target.value); setDoctor(""); }}>
              {consultDepartments.map(d => <option key={d}>{d}</option>)}
            </select>
          </label>
          {!external && <label className="block">医師
            <select className={`${field} block w-36`} value={doctor} onChange={e => setDoctor(e.target.value)}>
              <option value="">科の当番</option>
              {doctorsIn(dept).map(d => <option key={d.name}>{displayText(d.name)}</option>)}
            </select>
          </label>}
        </div>
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-ink-soft">ひな形：</span>
          {templatesFor(external).map((t) => <button key={t.id} type="button" onClick={() => {
            // The text written so far can be put back (no browser dialog).
            setBefore(question.trim() ? question : null);
            setQuestion(t.body({ diagnosis: patient.admissionDiagnosis, dept: external ? (to.trim() || "ご担当") : dept, labs: today ? labPasteText(patient, today) : null, vitals: today ? vitalsPasteText(patient, today) : null }));
          }} className="rounded border border-rule px-2 py-0.5 hover:border-ai hover:text-ai">{t.label}</button>)}
          {before !== null && <button type="button" onClick={() => { setQuestion(before); setBefore(null); }} className="ml-1 text-ai underline">ひな形を入れる前に戻す</button>}
        </div>

        <label className="block">本文
          <textarea rows={14} className={input} value={question} onChange={e => setQuestion(e.target.value)} placeholder={external ? "紹介の目的と経過" : "相談したいこと（質問・経過）"} />
        </label>
        <p>依頼者：{displayText(me.name)}</p>
        <button className="rounded bg-ai p-2 text-white disabled:opacity-40" disabled={!question.trim() || (external && !to.trim())} onClick={submit}>
          {external ? "診療情報提供書の下書きへ" : "オーダを保存する"}
        </button>
      </fieldset>
      {consults.map(e => {
        const c = e.order.type === "procedure" ? e.order.consult : undefined;
        if (!c) return null;
        const r = replies[e.id];
        const active = e.status === "有効" && !r?.closed;
        return (
          <section key={e.id} className="space-y-2 rounded border border-rule p-2">
            <b>コンサルト {displayText(c.dept)} {displayText(c.doctor || "科の当番")}（{c.urgency}）・{active ? consultState(r) : "終了"}</b>
            <p>{displayText(e.author)}：{c.question}</p>
            <p className="whitespace-pre-wrap">{c.summary}</p>
            {r?.text && <p className="whitespace-pre-wrap">返書 {displayText(r.by)}：{displayText(r.text)}</p>}
            {allowed && active && <>
              {addressedTo(e, me.name) && !r?.text && <>
                <textarea aria-label="コンサルト返書" className={input} rows={6} value={answers[e.id] ?? REPLY_TEMPLATE} onChange={x => setAnswers({ ...answers, [e.id]: x.target.value })} />
                <button className="rounded bg-wakatake px-3 py-1 text-white disabled:opacity-40" disabled={!answers[e.id]?.trim()} onClick={() => onReply(e.id, answers[e.id], me.name)}>返書を確定する</button>
              </>}
              {(addressedTo(e, me.name) || e.author === me.name) && <button className="ml-3 rounded border border-rule px-3 py-1" onClick={() => onCloseConsult(e.id)}>終了</button>}
            </>}
          </section>
        );
      })}
    </div>
  );
}

export function ConsultBanner({ entries, replies, onOpen }: { entries: HistoryEntry[]; replies: ConsultReplies; onOpen: () => void }) {
  const me = useMe();
  return <>{consultOrders(entries).filter(e => !replies[e.id]?.closed).map(e => {
    const c = e.order.type === "procedure" ? e.order.consult : undefined;
    return c && <div key={e.id} className="border-b border-rule bg-yamabuki-soft px-4 py-1 text-sm">
      {displayText(me.role === "看護師" ? `コンサルト中：${c.dept}` : `コンサルト依頼あり：${c.question} ／ ${e.author} ／ ${c.urgency}`)}
      {can(me.role, "consult") && <button className="ml-3 underline" onClick={onOpen}>{displayText(addressedTo(e, me.name) ? "返書を書く" : "依頼・返書を見る")}</button>}
    </div>;
  })}</>;
}

export function ConsultInboxView({ rows, onOpen }: { rows: ReturnType<typeof consultInbox>; onOpen: (id: string) => void }) {
  return <div className="space-y-2 overflow-auto p-4">
    <h2>コンサルト依頼</h2>
    {rows.length === 0 && <p>依頼はありません</p>}
    {rows.map(({ patient, entry, state }) => {
      const c = entry.order.type === "procedure" ? entry.order.consult : undefined;
      return <button key={entry.id} className="block w-full rounded border border-rule p-3 text-left" onClick={() => onOpen(patient.id)}>
        <b>{displayText(patient.name)} ／ {state}</b>
        <p>依頼元 {displayText(entry.author)} ／ {entry.day}日 {entry.time} ／ {c?.urgency}</p>
        <p>{c?.question}</p><p className="whitespace-pre-wrap">{c?.summary}</p>
      </button>;
    })}
  </div>;
}

/* Help migration source (references and dynamic wording):
<p >科の当番宛は同じ科の医師が受けます。引用は既存の記録のコピーです。内容は医師が確認します。</p>
<p >ひな形は依頼状に書く項目（主病名・経過・所見と検査・依頼内容）と S-BAR の順に沿った例です。直近の検査とバイタルはカルテから入ります。<a href={CONSULT_TEMPLATE_SOURCES[0].url} target="_blank" rel="noreferrer" >{CONSULT_TEMPLATE_SOURCES[0].label}</a></p>
*/
