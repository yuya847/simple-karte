"use client";

import { IsoDayInput } from "./DayInput";

import { displayText } from "@/lib/display-text";
import { useState } from "react";
import { addDays, daysFrom, isoDate, type CalendarDate } from "@/lib/dates";
import { standingStopDraft, type StandingStopDraft } from "@/lib/standing-calendar";
import type { StandingLine } from "@/lib/standing-lines";

export function StandingBulkStop({ lines, ids, today, onConfirm, onClear }: { lines: StandingLine[]; ids: string[]; today: CalendarDate; onConfirm: (draft: StandingStopDraft) => void; onClear: () => void }) {
  const [kind, setKind] = useState<"中止" | "終了">("中止");
  const [day, setDay] = useState(0);
  const [reason, setReason] = useState("");
  const [draft, setDraft] = useState<StandingStopDraft | null>(null);
  const eligible = { ...standingStopDraft(lines, ids, day, reason), ...(kind === "終了" ? { kind } : {}) };
  return <div className="flex flex-wrap items-center gap-2 border-b border-rule bg-paper p-2 text-[12px]">
    <select aria-label="終了か中止" value={kind} onChange={(e) => { setKind(e.target.value as "終了" | "中止"); setDraft(null); }}><option>中止</option><option>終了</option></select><span>{ids.length}件を選択</span>
    <label>{kind}日 <IsoDayInput aria-label={`一括${kind}の日`} value={isoDate(addDays(today, day))} onChange={(e) => { if (e.target.value) { const [y, m, d] = e.target.value.split("-").map(Number); setDay(daysFrom(today, { y, m, d })); setDraft(null); } }} /></label>
    <input aria-label={`一括${kind}の理由`} placeholder="理由（任意）" value={reason} onChange={(e) => { setReason(e.target.value); setDraft(null); }} className="rounded border border-rule px-2 py-1" />
    <button type="button" disabled={!eligible.ids.length} onClick={() => setDraft(eligible)} className="rounded border border-shu px-2 py-1 text-shu disabled:opacity-40">選んだ指示を{kind}</button>
    {draft && <div role="region" aria-label={`${kind}の下書き`} className="w-full rounded border border-rule p-2">
      <b>{kind}の下書き：{draft.ids.length}件</b>
      <ul>{draft.ids.map((id) => <li key={id}>{displayText(lines.find((l) => l.id === id)?.text)}</li>)}</ul>
      <p>{isoDate(addDays(today, draft.day))}　{displayText(draft.reason || "理由なし")}</p>
      <button type="button" onClick={() => { const next = standingStopDraft(lines, draft.ids, draft.day, draft.reason); if (next.ids.length) onConfirm({ ...next, kind: draft.kind }); setDraft(null); onClear(); }} className="mt-2 rounded bg-shu px-3 py-1 text-white">{kind}を確定</button>
      <button type="button" onClick={() => setDraft(null)} className="ml-2">下書きを取り消す</button>
    </div>}

    {!!ids.length && eligible.ids.length !== ids.length && <p className="w-full text-yamabuki">{kind}日が有効期間内の指示だけを{kind}します（{eligible.ids.length}件）。</p>}
  </div>;
}

/* Help migration source (references and dynamic wording):
<p >選択した行の終了日と理由を確認して確定します。項目で選ぶ指示は、各行の「指示を終了」から1件ずつ終了します。</p>
*/
