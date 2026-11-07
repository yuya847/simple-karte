"use client";

import { useState } from "react";
import { displayText } from "@/lib/display-text";
import { regionLabel } from "@/lib/exams";
import { chartDate } from "@/lib/billing/kisai";
import { KISAI_SOURCES } from "@/lib/billing/kisai-sources";
import { gengoDate, latestAnswer, lineName, saveAnswer, siLines } from "@/lib/billing/kisai-view";
import type { KisaiWorkspace } from "@/lib/billing/kisai-workspace";
import type { ClaimResult } from "@/lib/billing/model";
import { commentProblem, type TekiyoAnswer, type TekiyoMaster, type TekiyoTask } from "@/lib/billing/tekiyo";
import type { HistoryEntry } from "@/lib/types";
import { DenyNote, useDeny, useMe } from "../RoleContext";

const STATUS: Record<TekiyoTask["status"], string> = { 自動: "text-wakatake", 選択済み: "text-ai", 人が選ぶ: "text-yamabuki" };
const PLACEHOLDER: Record<string, string> = { "30": "文", "31": "診療行為コード9桁", "42": "数値", "50": "元号付き7桁（令和8年10月27日＝5081027）" };
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

/** 自動で入ったコメントの元の記録（実施した画像のオーダ）。 */
function evidenceText(e: unknown, today: string): string | null {
  const h = e as HistoryEntry;
  if (h?.kind !== "order" || h.order.type !== "imaging" || !h.exam?.done) return null;
  return `${h.order.modality} ${regionLabel(h.order.region)} ${md(chartDate(today, h.exam.done.day))} 実施`;
}

/** 摘要のコメント：記録から決まるものは自動、決まらないものは候補から人が選ぶ（選ぶと保存）。 */
export function TekiyoPanel({ claim, tasks, saved, patientId, month, today, admittedDate, at, onSave }: {
  claim: ClaimResult;
  tasks: TekiyoTask[];
  saved: KisaiWorkspace;
  patientId: string;
  month: string;
  /** YYYY-MM-DD（記録の日の計算）。 */
  today: string;
  /** 入院日 YYYY-MM-DD（「入院年月日」のコメントの初めの値）。 */
  admittedDate: string;
  at: string;
  onSave?: (next: KisaiWorkspace, what: string) => void;
}) {
  if (!tasks.length) return <p className="text-xs text-ink-soft">この月はありません</p>;
  return (
    <section aria-label="摘要のコメント" className="space-y-2 text-xs">
      <datalist id="tekiyo-claim-codes">{siLines(claim).map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</datalist>
      {tasks.map((t) => <TaskCard key={t.claimCode} task={t} name={lineName(claim, t.claimCode)} saved={saved} patientId={patientId} month={month} today={today} admittedDate={admittedDate} at={at} onSave={onSave} />)}
    </section>
  );
}

function TaskCard({ task, name, saved, patientId, month, today, admittedDate, at, onSave }: { task: TekiyoTask; name: string; saved: KisaiWorkspace; patientId: string; month: string; today: string; admittedDate: string; at: string; onSave?: (next: KisaiWorkspace, what: string) => void }) {
  const me = useMe();
  const deny = useDeny();
  const answer = latestAnswer(saved, patientId, month, task.claimCode);
  const [open, setOpen] = useState(task.status === "人が選ぶ");
  const [filter, setFilter] = useState("");
  const [texts, setTexts] = useState<Record<string, string>>({});
  const src = KISAI_SOURCES[task.basis.source];
  const chosen = answer?.comments ?? [];
  const canChoose = !!onSave && !deny("billing");
  const canReview = !!onSave && !deny("tekiyo.review");
  const save = (next: Partial<TekiyoAnswer>, what: string) => {
    if (!onSave) return;
    const comments = next.comments ?? chosen;
    // 医師以外が選び直したら、医師の確認はやり直し。
    const reviewed = next.reviewedRequirements ?? (canReview ? !!answer?.reviewedRequirements : false);
    onSave(saveAnswer(saved, { patientId, month, claimCode: task.claimCode, comments, reviewedRequirements: reviewed, by: me.name, at }), what);
  };
  const toggle = (m: TekiyoMaster) => {
    const has = chosen.some((c) => c.code === m.code);
    const first = m.pattern === "50" && m.name.includes("入院年月日") ? gengoDate(admittedDate) : undefined;
    save({ comments: has ? chosen.filter((c) => c.code !== m.code) : [...chosen, m.pattern === "20" ? { code: m.code } : { code: m.code, text: first ?? "" }] }, `摘要のコメントを選んだ（${name}）`);
  };
  const setText = (code: string) => {
    const text = texts[code];
    if (text === undefined) return;
    save({ comments: chosen.map((c) => (c.code === code ? { code, text: text.trim() } : c)) }, `摘要のコメントを選んだ（${name}）`);
    setTexts((x) => {
      const rest = { ...x };
      delete rest[code];
      return rest;
    });
  };
  const words = filter.normalize("NFKC").trim();
  // 選んだものを上に、あとはマスターの順。
  const picked = (m: TekiyoMaster) => chosen.some((c) => c.code === m.code);
  const shown = task.candidates.filter((m) => !words || m.name.normalize("NFKC").includes(words) || picked(m)).sort((a, b) => Number(picked(b)) - Number(picked(a)));
  const autoFrom = task.status === "自動" ? task.evidence.map((e) => evidenceText(e, today)).filter(Boolean) : [];

  return (
    <div data-claim={task.claimCode} className="rounded-md border border-rule bg-paper px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold" title={`${src.title} ${task.basis.section}：${task.basis.text}`}>{name}</span>
        <span className="text-[10px] text-ink-faint">{task.claimCode}</span>
        <span className={`font-bold ${STATUS[task.status]}`}>{task.status}</span>
        {answer && task.status !== "自動" && <span className="nums text-ink-soft">{displayText(answer.by)} {md(answer.at)} {answer.at.slice(11, 16)}</span>}
        {task.status !== "自動" && task.candidates.length > 0 && !open && (
          <button type="button" onClick={() => setOpen(true)} className="ml-auto rounded border border-rule bg-sheet px-2 py-0.5 hover:bg-tab">直す</button>
        )}
      </div>
      {task.comments.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {task.comments.map((c) => (
            <li key={c.code + (c.text ?? "")} className="text-fuji">
              {c.label}
              {c.text ? `：${c.text}` : ""}
              <span className="ml-1 text-[10px] text-ink-faint">{c.code}</span>
            </li>
          ))}
        </ul>
      )}
      {autoFrom.length > 0 && <p className="mt-0.5 text-[11px] text-ink-soft">記録：{autoFrom.join("、")}</p>}
      {open && task.status !== "自動" && (
        <div className="mt-2 space-y-1.5">
          {task.candidates.length > 8 && (
            <input type="search" aria-label="候補を絞る" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="絞り込み" className="w-56 rounded border border-rule bg-sheet px-2 py-0.5 outline-none focus:border-ai" />
          )}
          <ul className="scroll-thin max-h-72 space-y-0.5 overflow-auto rounded border border-rule-soft bg-sheet p-1.5">
            {shown.map((m) => {
              const c = chosen.find((x) => x.code === m.code);
              const value = texts[m.code] ?? c?.text ?? "";
              const problem = c ? commentProblem(m, m.pattern === "20" ? undefined : value) : undefined;
              return (
                <li key={m.code} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <label className="flex min-w-0 flex-1 items-start gap-1.5">
                    <input type="checkbox" className="mt-0.5" checked={!!c} disabled={!canChoose} onChange={() => toggle(m)} />
                    <span className={c ? "text-ink" : "text-ink-soft"}>{m.name}<span className="ml-1 text-[10px] text-ink-faint">{m.code}</span></span>
                  </label>
                  {c && m.pattern !== "20" && (
                    <input
                      aria-label={`${m.name}の文字データ`}
                      value={value}
                      disabled={!canChoose}
                      list={m.pattern === "31" ? "tekiyo-claim-codes" : undefined}
                      placeholder={PLACEHOLDER[m.pattern] ?? ""}
                      onChange={(e) => setTexts((x) => ({ ...x, [m.code]: e.target.value }))}
                      onBlur={() => setText(m.code)}
                      onKeyDown={(e) => { if (e.key === "Enter") setText(m.code); }}
                      className="nums w-60 rounded border border-rule bg-paper px-1.5 py-0.5 outline-none focus:border-ai"
                    />
                  )}
                  {problem && <span className="w-full pl-5 text-shu">{problem}</span>}
                </li>
              );
            })}
          </ul>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={!!answer?.reviewedRequirements} disabled={!canReview || !chosen.length} onChange={(e) => save({ reviewedRequirements: e.target.checked }, e.target.checked ? `確定（摘要のコメント：${name}）` : `摘要のコメントの確認を外した（${name}）`)} />
            記載事項を確かめた（医師）
          </label>
          {!canReview && <DenyNote action="tekiyo.review" />}
          {task.status === "選択済み" && <button type="button" onClick={() => setOpen(false)} className="rounded px-2 py-0.5 text-ink-soft hover:text-ink">閉じる</button>}
        </div>
      )}
    </div>
  );
}
