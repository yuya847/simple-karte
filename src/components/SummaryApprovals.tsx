"use client";

import { displayText } from "@/lib/display-text";
import { FileCheck } from "lucide-react";
import { useState } from "react";
import { HEAD_NURSE, lastReturn, latest, midDueList, stateOf, writerOf, type NurseSummary, type SummaryState } from "@/lib/nursing-summary";
import { PickSelect, type Pick } from "./WardMap";

export interface SummaryPatient {
  id: string;
  name: string;
  room: string;
  admittedOn: number;
}

const STATE_STYLE = { 承認待ち: "bg-yamabuki-soft text-yamabuki", 差し戻し: "bg-shu-soft text-shu", 承認済み: "bg-wakatake-soft text-wakatake" } as const;
const DUE_STYLE = { 期限切れ: "text-shu", 今日まで: "text-yamabuki", まだ先: "text-ink-soft" } as const;

function Card({ s, who, canReview, onApprove, onReturn, onOpen }: { s: NurseSummary; who?: SummaryPatient; canReview: boolean; onApprove: () => void; onReturn: (comment: string) => void; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const st = stateOf(s);
  const v = latest(s);
  const own = writerOf(s) === HEAD_NURSE;
  return (
    <li className="rounded-md border border-rule bg-sheet p-2 text-[12px]">
      <div className="nums flex flex-wrap items-baseline gap-2">
        <button type="button" onClick={onOpen} className="font-bold text-ai underline-offset-2 hover:underline">
          {who ? `${who.room} ${who.name}` : s.patientId}
        </button>
        <b>{s.kind === "中間" ? "中間サマリ" : `看護サマリ（${s.kind}）`}</b>
        {v.to && <span className="text-ink-soft">宛先：{v.to}</span>}
        <span className={`rounded px-1.5 text-[11px] font-bold ${STATE_STYLE[st]}`}>{st}</span>
        <span className="text-ink-faint">
          第{s.versions.length}版 {v.at.day === 0 ? "今日" : v.at.day === -1 ? "昨日" : `${-v.at.day}日前`} {v.at.time} {displayText(v.by)}
        </span>
        <button type="button" onClick={() => setOpen(!open)} className="ml-auto rounded border border-rule px-2 py-0.5">
          {open ? "閉じる" : "中身を見る"}
        </button>
      </div>
      {st === "差し戻し" && <p className="mt-1 text-shu">差し戻し：{lastReturn(s)?.comment}</p>}
      {open && (
        <div className="mt-1 space-y-1 rounded border border-rule-soft bg-paper p-2">
          {v.sections.map((x) => (
            <div key={x.heading}>
              <b className="text-ink-soft">{x.heading}</b>
              <ul className="pl-3">
                {x.lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <b className="text-ink-soft">申し送り（{displayText(v.by)}）</b>
            <p className="whitespace-pre-wrap pl-3">{v.words || "—"}</p>
          </div>
        </div>
      )}
      {st === "承認待ち" && canReview && !own && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button type="button" onClick={onApprove} className="rounded-md bg-wakatake px-3 py-0.5 font-bold text-white">
            承認（{HEAD_NURSE}）
          </button>
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="差し戻すときは、直してほしいところ" aria-label="差し戻しのコメント" className="min-w-60 flex-1 rounded border border-rule bg-paper px-2 py-0.5" />
          <button type="button" disabled={!comment.trim()} onClick={() => (onReturn(comment.trim()), setComment(""))} className="rounded-md border border-shu px-3 py-0.5 font-bold text-shu disabled:opacity-40">
            差し戻す
          </button>
        </div>
      )}
      {st === "承認待ち" && own && <p className="mt-1 text-ink-faint">書いた本人は承認できません。</p>}
    </li>
  );
}

/**
 * 看護サマリの承認（看護師長）: summaries waiting for approval, those returned, those approved, and the patients whose
 * 中間サマリ is due. The 看護師長 decides; code only keeps the steps and counts the days.
 */
export function SummaryApprovals({ pick, patients, summaries, canReview, onApprove, onReturn, onOpen }: { pick: Pick; patients: SummaryPatient[]; summaries: NurseSummary[]; canReview: boolean; onApprove: (s: NurseSummary) => void; onReturn: (s: NurseSummary, comment: string) => void; onOpen: (patientId: string) => void }) {
  const here = summaries.filter((s) => patients.some((p) => p.id === s.patientId));
  const who = (id: string) => patients.find((p) => p.id === id);
  const group = (st: SummaryState) => here.filter((s) => stateOf(s) === st).sort((a, b) => latest(b).at.day - latest(a).at.day || latest(b).at.time.localeCompare(latest(a).at.time));
  const due = midDueList(patients, summaries);
  const list = (st: SummaryState, title: string) => {
    const xs = group(st);
    return (
      <section>
        <h2 className={`mb-1 text-sm font-bold ${xs.length === 0 ? "text-ink-faint" : ""}`}>
          {title}（{xs.length}件）
        </h2>
        {xs.length > 0 && (
          <ul className="space-y-1.5">
            {xs.map((s) => (
              <Card key={s.id} s={s} who={who(s.patientId)} canReview={canReview} onApprove={() => onApprove(s)} onReturn={(c) => onReturn(s, c)} onOpen={() => onOpen(s.patientId)} />
            ))}
          </ul>
        )}
      </section>
    );
  };
  return (
    <section aria-label="看護サマリの承認" className="scroll-thin min-h-0 flex-1 space-y-3 overflow-auto bg-paper px-5 py-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-1.5 text-lg font-bold">
          <FileCheck size={18} />
          看護サマリの承認
        </h1>
        <PickSelect pick={pick} />
      </header>

      {list("承認待ち", "承認待ち")}
      {list("差し戻し", "差し戻し中")}
      <section>
        <h2 className={`mb-1 text-sm font-bold ${due.length === 0 ? "text-ink-faint" : ""}`}>中間サマリの期限（3日以内・過ぎたもの　{due.length}件）</h2>
        {due.length > 0 && (
          <table className="nums w-full max-w-4xl border-collapse rounded-lg bg-sheet text-[12px]">
            <tbody>
              {due.map((d) => {
                const p = who(d.patientId)!;
                return (
                  <tr key={d.patientId} className="border-b border-rule-soft">
                    <td className="px-2 py-1">
                      <button type="button" onClick={() => onOpen(d.patientId)} className="font-bold text-ai underline-offset-2 hover:underline">
                        {p.room} {p.name}
                      </button>
                    </td>
                    <td className="px-2">入院{1 - p.admittedOn}日目</td>
                    <td className={`px-2 font-bold ${DUE_STYLE[d.state]}`}>
                      {d.dueOn === 0 ? "今日" : d.dueOn < 0 ? `${-d.dueOn}日前` : `${d.dueOn}日後`}まで（入院{d.stayDay}日目・{d.state}）
                    </td>
                    <td className="px-2 text-ink-faint">{d.last ? `前回 ${d.last.versions[0].at.day === 0 ? "今日" : `${-d.last.versions[0].at.day}日前`}（${stateOf(d.last)}）` : "まだ書いていない"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      {list("承認済み", "承認済み")}
    </section>
  );
}

/* Help migration source (references and dynamic wording):
<p >看護師はカルテの「連携サマリ」（看護では看護サマリ）で種類を選んで提出します。ここで中身を見て承認するか、直してほしいところを書いて差し戻します。名前を押すとカルテのサマリが開きます。</p>
*/
