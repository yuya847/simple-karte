"use client";

import { GitMerge, PencilLine, Users, X } from "lucide-react";
import { editorLine, mergedText, peerLine, type NoteEditor, type Peer, type Where } from "@/lib/presence";

/** Over a chart: the others who have it open (another tab of this browser, another device), and who is correcting which note. */
export function PresenceStrip({ peers, editors = [] }: { peers: Peer[]; editors?: NoteEditor[] }) {
  if (!peers.length && !editors.length) return null;
  const writing = peers.some((p) => p.editing) || editors.length > 0;
  return (
    <div role="status" className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b px-4 py-1 text-[12px] print:hidden ${writing ? "border-yamabuki bg-yamabuki-soft" : "border-rule-soft bg-sheet"}`}>
      <Users size={13} className={writing ? "text-yamabuki" : "text-ink-soft"} />
      {peers.length > 0 && (
        <>
          <b>このカルテを開いている人：</b>
          <span>{peers.map(peerLine).join("、")}</span>
        </>
      )}
      {editors.length > 0 && (
        <>
          <PencilLine size={12} className="text-yamabuki" />
          <span>{editors.map(editorLine).join("、")}</span>
        </>
      )}
      <span className="hint text-ink-soft">同じ患者を何人で開いても、それぞれの記事やオーダはあとから合わせて保存されます。同じ記事を同時に直すと、お互いの文字が入って見え、確定すると一つの版に二人の名前が付きます。</span>
    </div>
  );
}

/** For a few seconds after newer records of someone else were merged into this page. */
export function MergedNotice({ by, where, at, onClose }: { by: string; where: Where; at: string; onClose: () => void }) {
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-40 flex items-center justify-center gap-2 px-4 py-1 print:hidden">
      <div className="flex items-center gap-2 rounded-full border border-wakatake bg-wakatake-soft px-3 py-1 text-[12px] text-ink shadow">
        <GitMerge size={13} className="text-wakatake" />
        <span>{mergedText(by, where, at)}</span>
        <span className="hint text-ink-soft">この画面の記録と合わせました。書いている記事と下書きはそのままです。</span>
        <button type="button" onClick={onClose} aria-label="閉じる" className="rounded p-0.5 text-ink-soft hover:bg-sheet">
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

/** How the devices are connected, for the status in the corner. */
export function liveLabel(live: "unknown" | "on" | "off"): string {
  return live === "on" ? "ほかの端末の変更はすぐ届きます" : live === "off" ? "ほかの端末の変更は30秒ごとに確かめます" : "";
}
