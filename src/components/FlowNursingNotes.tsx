"use client";

import { useState } from "react";
import { Copy, X } from "lucide-react";
import { nursingNoteLayout, type NoteRoleFilter } from "@/lib/flow-nursing-notes";
import type { HistoryEntry } from "@/lib/types";

export function FlowNursingNotes({ entries, lo, hi, xAbs, plotW, labelW, fmtAt }: { entries: HistoryEntry[]; lo: number; hi: number; xAbs: (at: number) => number; plotW: number; labelW: number; fmtAt: (at: number) => string }) {
  const [filter, setFilter] = useState<NoteRoleFilter>("nurse");
  const [open, setOpen] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const notes = nursingNoteLayout(entries, filter, lo, hi, xAbs, plotW);
  const selected = notes.find(n => n.key === open);
  return <div className="flex border-b border-rule-soft">
    <div className="shrink-0 py-1 pr-2 text-right text-ink-soft" style={{ width: labelW }}>
      看護記録
      <select aria-label="記録の職種" value={filter} onChange={e => { setFilter(e.target.value as NoteRoleFilter); setOpen(null); }} className="block w-full bg-sheet text-[10px] print:hidden">
        <option value="nurse">看護師だけ</option><option value="all">全職種</option>
      </select>
    </div>
    <div className="relative flex-1" style={{ minHeight: Math.max(48, ...notes.map(n => (n.lane + 1) * 36 + 4)) }}>
      {notes.map((n, i) => <button key={`${n.key}-${i}`} type="button" aria-expanded={open === n.key} aria-label={`${fmtAt(n.at)} ${n.n.role} ${n.preview.join(" ")}の全文を開く`} onClick={() => { setOpen(open === n.key ? null : n.key); setCopyStatus(""); }} className="absolute overflow-hidden rounded border border-wakatake/40 bg-sheet px-1 text-left text-[10px] leading-4 text-wakatake hover:bg-paper" style={{ left: n.left, width: n.width, top: n.lane * 36 + 2, height: 34 }} data-nursing-note={i}>
        <span className="block truncate">{n.n.time} {n.preview[0]}</span><span className="block truncate">{n.preview[1] || "本文を開く"}</span>
      </button>)}
      {selected && <div role="dialog" aria-label="記録の全文" onKeyDown={e => { if (e.key === "Escape") setOpen(null); }} className="absolute z-30 rounded border border-wakatake bg-sheet p-2 text-[11px] shadow-lg print:hidden" style={{ left: Math.max(0, Math.min(selected.left, plotW - 320)), top: (selected.lane + 1) * 36 + 4, width: Math.min(320, plotW) }}>
        <div className="flex items-center gap-2"><b>{fmtAt(selected.at)} {selected.n.role} {selected.n.author}</b>
          <button type="button" aria-label="記録の全文をコピー" className="ml-auto" onClick={async () => { try { await navigator.clipboard.writeText(selected.full); setCopyStatus("コピーしました"); } catch { setCopyStatus("コピーできませんでした。本文を選択してコピーしてください"); } }}><Copy size={14} /></button>
          <button type="button" aria-label="全文を閉じる" onClick={() => setOpen(null)}><X size={14} /></button>
        </div>
        <div className="max-h-72 select-text overflow-auto whitespace-pre-wrap break-words pt-2 text-ink">{selected.full}</div><div role="status">{copyStatus}</div>
      </div>}
    </div>
  </div>;
}
