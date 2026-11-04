"use client";

import { Cloud, CloudOff, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { WorkspaceStatus as Status } from "@/lib/use-workspace";

const LABEL: Record<Status, string> = { off: "", loading: "読み込み中…", saving: "保存中…", saved: "保存しました", error: "保存できませんでした" };

/** Where the records are kept (Supabase), the link to open them on another device, and 初めの状態に戻す. */
export function WorkspaceStatus({ status, id, onReset, live }: { status: Status; id: string | null; onReset: () => void; live?: string }) {
  const [sure, setSure] = useState(false);
  const [copied, setCopied] = useState(false);
  if (status === "off") return null;
  const link = id ? `${window.location.origin}${window.location.pathname}?ws=${id}` : "";
  return (
    <div className="fixed bottom-2 right-2 z-30 flex flex-wrap items-center gap-2 rounded-md border border-rule bg-sheet px-2.5 py-1 text-[11px] text-ink-soft shadow print:hidden">
      {status === "error" ? <CloudOff size={13} className="text-shu" /> : <Cloud size={13} className="text-ai" />}
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
    </div>
  );
}
