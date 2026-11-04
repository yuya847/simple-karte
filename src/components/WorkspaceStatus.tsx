"use client";

import { ChevronRight, Cloud, CloudOff, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { WorkspaceStatus as Status } from "@/lib/use-workspace";

const LABEL: Record<Status, string> = { off: "", loading: "読み込み中…", saving: "保存中…", saved: "保存しました", error: "保存できませんでした" };

/**
 * Where the records are kept (Supabase), the link to open them on another device, and 初めの状態に戻す.
 * Folded to a small pill by default so it does not cover the bottom of the right column (the 「記録しました」
 * band after vitals, the drafts' count); the pill opens on click.
 */
export function WorkspaceStatus({ status, id, onReset, live }: { status: Status; id: string | null; onReset: () => void; live?: string }) {
  const [open, setOpen] = useState(false);
  const [sure, setSure] = useState(false);
  const [copied, setCopied] = useState(false);
  if (status === "off") return null;
  const link = id ? `${window.location.origin}${window.location.pathname}?ws=${id}` : "";
  const icon = status === "error" ? <CloudOff size={13} className="text-shu" /> : <Cloud size={13} className="text-ai" />;
  if (!open && status !== "error") {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="記録の保存先（今日の記録・架空の患者だけ）。押すと、ほかの端末で開くリンクと「初めの状態に戻す」"
        aria-label={`${LABEL[status]}。保存先の詳細を開く`}
        className="fixed bottom-2 right-2 z-30 flex items-center gap-1 rounded-full border border-rule bg-sheet px-2 py-0.5 text-[11px] text-ink-soft shadow hover:border-ai print:hidden"
      >
        {icon}
        {LABEL[status]}
        <ChevronRight size={11} />
      </button>
    );
  }
  return (
    <div className="fixed bottom-2 right-2 z-30 flex flex-wrap items-center gap-2 rounded-md border border-rule bg-sheet px-2.5 py-1 text-[11px] text-ink-soft shadow print:hidden">
      {icon}
      <span className={status === "error" ? "text-shu" : ""}>{LABEL[status]}（今日の記録・架空の患者だけ）</span>
      {live && <span className="hint">{live}</span>}
      {link && (
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true), () => setCopied(false))}
          className="underline hover:text-ai"
          title="この記録をほかの端末で開くリンク"
        >
          {copied ? "リンクを写しました" : "ほかの端末で開くリンク"}
        </button>
      )}
      {sure ? (
        <>
          <span className="font-bold text-shu">今日の記録を消して初めに戻す？</span>
          <button type="button" onClick={onReset} className="rounded bg-shu px-1.5 font-bold text-white">
            戻す
          </button>
          <button type="button" onClick={() => setSure(false)} className="underline">
            やめる
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setSure(true)} className="flex items-center gap-0.5 underline hover:text-shu">
          <RotateCcw size={11} />
          初めの状態に戻す
        </button>
      )}
      <button type="button" onClick={() => { setOpen(false); setSure(false); }} aria-label="閉じる" className="rounded px-1 hover:bg-paper">
        ×
      </button>
    </div>
  );
}
