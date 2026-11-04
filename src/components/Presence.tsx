"use client";

import { RefreshCw, Users } from "lucide-react";
import { peerLine, type Peer, type Stale } from "@/lib/presence";

/** Over a chart: the others who have it open (another tab of this browser, another device). */
export function PresenceStrip({ peers }: { peers: Peer[] }) {
  if (!peers.length) return null;
  const writing = peers.some((p) => p.editing);
  return (
    <div role="status" className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b px-4 py-1 text-[12px] print:hidden ${writing ? "border-yamabuki bg-yamabuki-soft" : "border-rule-soft bg-sheet"}`}>
      <Users size={13} className={writing ? "text-yamabuki" : "text-ink-soft"} />
      <b>このカルテを開いている人：</b>
      <span>{peers.map(peerLine).join("、")}</span>
      <span className="hint text-ink-soft">同じ患者の記事やオーダを別々に書くと、あとから保存したほうが前のものを上書きするので、ここで確定する前に声をかけ合ってください。あちらが先に保存すると、こちらは読み込み直すまで確定できません。</span>
    </div>
  );
}

/** At the top while this page's records are older than the saved ones (saving is stopped). */
export function StaleBanner({ stale, onRefresh, busy }: { stale: Stale; onRefresh: () => void; busy: boolean }) {
  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-40 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-yamabuki bg-yamabuki-soft px-4 py-1.5 text-[13px] shadow print:hidden">
      <span>
        別の{stale.where}（{stale.by}）で {stale.at} に記録が保存されました。このページの記録はそれより古いので、上書きしないように保存を止めています。
      </span>
      <button type="button" disabled={busy} onClick={onRefresh} className="flex items-center gap-1 rounded-md bg-ai px-3 py-0.5 font-bold text-white disabled:opacity-50">
        <RefreshCw size={13} />
        {busy ? "読み込んでいます…" : "最新の記録を読み込む"}
      </button>
      <span className="text-[11px] text-ink-soft">開いているカルテで書いている記事と下書きは残します。</span>
    </div>
  );
}

/** Confirming a note or an order while the saved records are newer: read them first. */
export function StaleAsk({ text, onRefresh, onCancel, busy }: { text: string; onRefresh: () => void; onCancel: () => void; busy: boolean }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="確定の前に最新の記録を読み込む" className="fixed inset-0 z-[60] grid place-items-center bg-ink/30 p-4 print:hidden">
      <div className="max-w-md space-y-3 rounded-lg border border-yamabuki bg-sheet p-4 text-[13px] shadow-lg">
        <h2 className="font-bold text-yamabuki">確定していません</h2>
        <p>{text}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={onRefresh} className="flex items-center gap-1 rounded-md bg-ai px-3 py-1.5 font-bold text-white disabled:opacity-50">
            <RefreshCw size={14} />
            {busy ? "読み込んでいます…" : "最新の記録を読み込む"}
          </button>
          <button type="button" onClick={onCancel} className="rounded-md border border-rule px-3 py-1.5">
            やめる
          </button>
        </div>
      </div>
    </div>
  );
}
