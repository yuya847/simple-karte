"use client";

import { useState } from "react";
import { useMe } from "./RoleContext";
import { can } from "@/lib/roles";
import { newProcedureDraft, type Draft } from "@/lib/drafts";
import { addressedTo, consultDepartments, consultOrders, consultState, doctorsIn, quoteConsultSummary, type ConsultReplies, type consultInbox } from "@/lib/consult";
import type { HistoryEntry, OrderEntry, Patient } from "@/lib/types";

const REPLY_TEMPLATE = "所見：\n診断：\n提案：\nフォロー：";
const input = "w-full rounded border border-rule bg-paper p-2";
interface Props {
  patient: Patient;
  entries: HistoryEntry[];
  consults: OrderEntry[];
  replies: ConsultReplies;
  newId: () => string;
  onAdd: (d: Draft) => void;
  onReply: (id: string, text: string, by: string) => void;
  onCloseConsult: (id: string) => void;
  onRefer: (to: string, dept: string, purpose: string, summary: string) => void;
}

export function ConsultPanel({ patient, entries, consults, replies, newId, onAdd, onReply, onCloseConsult, onRefer }: Props) {
  const me = useMe();
  const allowed = can(me.role, "consult");
  const [tab, setTab] = useState("院内へ相談");
  const [dept, setDept] = useState("循環器内科");
  const [doctor, setDoctor] = useState("");
  const [urgency, setUrgency] = useState<"本日中" | "数日以内" | "定期">("数日以内");
  const [question, setQuestion] = useState("");
  const [summary, setSummary] = useState(() => quoteConsultSummary(patient, entries));
  const [to, setTo] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const external = tab === "院外へ紹介";
  const submit = () => {
    if (!allowed || !question.trim() || (external && !to.trim())) return;
    if (external) return onRefer(to.trim(), dept, question.trim(), summary);
    onAdd({ ...newProcedureDraft("PROC-CONSULT", newId()), consult: { dept, doctor, urgency, question: question.trim(), summary }, schedule: { kind: "once" }, start: { day: 0, time: null } });
  };
  return (
    <div className="space-y-3 text-sm">
      <p>他科依頼・紹介</p>
      <p className="hint">模擬：架空のスタッフ・紹介先です。科の当番宛は同じ科の医師が受けます。引用は既存の記録のコピーです。内容と緊急度は医師が確認します。</p>
      <div className="flex gap-2">
        {["院内へ相談", "院外へ紹介"].map(t => <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t} className="rounded border border-rule p-2">{t}</button>)}
      </div>
      <fieldset disabled={!allowed} className="space-y-2">
        {external && <label className="block">紹介先の医療機関
          <input className={input} value={to} onChange={e => setTo(e.target.value)} list="consult-facilities" />
          <datalist id="consult-facilities"><option>架空みどり病院</option><option>架空さくら診療所</option></datalist>
        </label>}
        <label className="block">依頼先の診療科
          <select className={input} value={dept} onChange={e => { setDept(e.target.value); setDoctor(""); }}>
            {consultDepartments.map(d => <option key={d}>{d}</option>)}
          </select>
        </label>
        {!external && <>
          <label className="block">医師
            <select className={input} value={doctor} onChange={e => setDoctor(e.target.value)}>
              <option value="">科の当番</option>
              {doctorsIn(dept).map(d => <option key={d.name}>{d.name}</option>)}
            </select>
          </label>
          <label className="block">緊急度
            <select className={input} value={urgency} onChange={e => setUrgency(e.target.value as typeof urgency)}>
              {["本日中", "数日以内", "定期"].map(u => <option key={u}>{u}</option>)}
            </select>
          </label>
        </>}
        <label className="block">{external ? "紹介の目的" : "相談の内容（質問・知りたいこと）"}
          <textarea className={input} value={question} onChange={e => setQuestion(e.target.value)} />
        </label>
        <label className="block">経過の要約（引用・編集可）
          <textarea rows={8} className={input} value={summary} onChange={e => setSummary(e.target.value)} />
        </label>
        <p>依頼者：{me.name}</p>
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
            <b>コンサルト {c.dept} {c.doctor || "科の当番"}（{c.urgency}）・{active ? consultState(r) : "終了"}</b>
            <p>{e.author}：{c.question}</p>
            <p className="whitespace-pre-wrap">{c.summary}</p>
            {r?.text && <p className="whitespace-pre-wrap">返書 {r.by}：{r.text}</p>}
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
      {me.role === "看護師" ? `コンサルト中：${c.dept}` : `コンサルト依頼あり：${c.question} ／ ${e.author} ／ ${c.urgency}`}
      {can(me.role, "consult") && <button className="ml-3 underline" onClick={onOpen}>{addressedTo(e, me.name) ? "返書を書く" : "依頼・返書を見る"}</button>}
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
        <b>{patient.name} ／ {state}</b>
        <p>依頼元 {entry.author} ／ {entry.day}日 {entry.time} ／ {c?.urgency}</p>
        <p>{c?.question}</p><p className="whitespace-pre-wrap">{c?.summary}</p>
      </button>;
    })}
  </div>;
}
