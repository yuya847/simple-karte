"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { ASK_STATES, FACILITIES, decidedOf, type AskState, type TransferAsk } from "@/lib/transfer";

const STATE_STYLE: Record<AskState, string> = {
  打診中: "bg-yamabuki-soft text-yamabuki",
  受け入れ可: "bg-wakatake-soft text-wakatake",
  受け入れ不可: "bg-tab text-ink-soft",
  "面談・見学の予定": "bg-ai-soft text-ai",
  決定: "bg-ai text-white",
  取り下げ: "bg-tab text-ink-faint",
};

/** 転院・施設の調整: ask several places with a summary that does not name the patient; keep each answer. */
export function TransferPanel({ summary, asks, onAsk, onUpdate }: { summary: string[]; asks: TransferAsk[]; onAsk: (facilities: { name: string; kind: string }[]) => void; onUpdate: (id: string, state: AskState, note: string, meeting?: string) => void }) {
  const [pick, setPick] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState<Record<string, { state: AskState | ""; note: string; meeting: string }>>({});
  const asked = new Set(asks.map((a) => a.facility));
  const decided = decidedOf(asks);
  return (
    <div className="space-y-3 text-[13px]">
      <div className="rounded-md border border-rule bg-paper p-2">
        <div className="mb-1 flex items-center gap-2">
          <b className="text-xs text-ink-soft">打診に使う要約（氏名・ID・生年月日・住所は入れません。カルテからコードで作成）</b>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(summary.join("\n")).then(() => setCopied(true), () => setCopied(false));
            }}
            className="ml-auto flex items-center gap-1 rounded border border-rule px-2 py-0.5 text-xs hover:border-ai hover:text-ai"
          >
            <Copy size={12} />
            {copied ? "写しました" : "写す"}
          </button>
        </div>
        <ul className="list-disc pl-5">
          {summary.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
      {decided && (
        <p className="rounded-md bg-ai-soft px-2 py-1 font-bold text-ai">
          決定：{decided.facility}（{decided.log.at(-1)?.note}）
        </p>
      )}
      <div className="rounded-md border border-rule-soft p-2">
        <b className="text-xs text-ink-soft">打診先を選ぶ（架空の病院・施設）</b>
        <ul className="mt-1 space-y-0.5">
          {FACILITIES.filter((f) => !asked.has(f.name)).map((f) => (
            <li key={f.name}>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={pick.includes(f.name)} onChange={() => setPick((p) => (p.includes(f.name) ? p.filter((x) => x !== f.name) : [...p, f.name]))} className="accent-ai" />
                {f.name}
                <span className="text-xs text-ink-faint">{f.kind}</span>
              </label>
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={!pick.length}
          onClick={() => {
            onAsk(FACILITIES.filter((f) => pick.includes(f.name)));
            setPick([]);
          }}
          className="mt-1 rounded-md bg-ai px-3 py-1 font-bold text-white disabled:opacity-40"
        >
          まとめて打診した（{pick.length}か所）
        </button>
      </div>
      {asks.map((a) => {
        const f = form[a.id] ?? { state: "", note: "", meeting: "" };
        const needWho = f.state === "決定";
        return (
          <article key={a.id} className="rounded-md border border-rule p-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <b>{a.facility}</b>
              <span className="text-xs text-ink-faint">{a.kind}</span>
              <span className={`ml-auto rounded px-1.5 text-[11px] font-bold ${STATE_STYLE[a.state]}`}>{a.state}</span>
            </div>
            {a.meeting && <div className="text-xs text-ai">面談・見学：{a.meeting}</div>}
            <ul className="nums mt-1 space-y-0.5 text-xs text-ink-soft">
              {a.log.map((l, i) => (
                <li key={i}>
                  {l.at} {l.by}　{l.state}
                  {l.note ? `：${l.note}` : ""}
                </li>
              ))}
            </ul>
            {a.state !== "決定" && a.state !== "取り下げ" && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                <select value={f.state} onChange={(e) => setForm((m) => ({ ...m, [a.id]: { ...f, state: e.target.value as AskState } }))} aria-label={`${a.facility} の状態`} className="rounded border border-rule bg-paper px-1 py-0.5">
                  <option value="">状態を変える</option>
                  {/* Only one place can be 決定. */}
                  {ASK_STATES.filter((s) => s !== a.state && s !== "打診中" && !(s === "決定" && decided)).map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                {f.state === "面談・見学の予定" && <input value={f.meeting} onChange={(e) => setForm((m) => ({ ...m, [a.id]: { ...f, meeting: e.target.value } }))} placeholder="日時（例：11/6 14:00 家族と見学）" aria-label="面談・見学の日時" className="w-44 rounded border border-rule bg-paper px-1.5 py-0.5" />}
                <input value={f.note} onChange={(e) => setForm((m) => ({ ...m, [a.id]: { ...f, note: e.target.value } }))} placeholder={needWho ? "誰が決めたか（例：本人・長女と主治医で決めた）" : "返事の内容（例：空床は11/10から）"} aria-label={`${a.facility} の返事`} className="min-w-40 flex-1 rounded border border-rule bg-paper px-1.5 py-0.5" />
                <button
                  type="button"
                  disabled={!f.state || (needWho && !f.note.trim()) || (f.state === "面談・見学の予定" && !f.meeting.trim())}
                  onClick={() => {
                    onUpdate(a.id, f.state as AskState, f.note.trim(), f.meeting.trim() || undefined);
                    setForm((m) => ({ ...m, [a.id]: { state: "", note: "", meeting: "" } }));
                  }}
                  className="rounded border border-ai px-2 py-0.5 text-ai disabled:opacity-40"
                >
                  記録
                </button>
              </div>
            )}
          </article>
        );
      })}
      <p className="text-[11px] text-ink-faint">送り先を決めるのは本人・家族と医師です。「決定」には誰が決めたかを書きます。実際に送る機能はありません（試作）。</p>
    </div>
  );
}
