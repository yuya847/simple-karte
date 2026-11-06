"use client";
import { expiryDay } from "@/lib/rx-expiry";
import type { expiryInbox } from "@/lib/rx-expiry-workflow";
export function RxExpiryInbox({ inbox, onOpen, onClose }: { inbox: ReturnType<typeof expiryInbox>; onOpen: (id: string) => void; onClose: () => void }) {
  return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/30 p-4" onClick={onClose}><section role="dialog" aria-modal="true" aria-label="処方切れの患者" className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded border border-rule bg-sheet p-4 shadow-xl" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape") onClose(); }}><div className="flex justify-between"><h2 className="font-bold">処方切れ</h2><button autoFocus onClick={onClose}>閉じる</button></div>{inbox.length ? inbox.map(x => <div key={x.patient.id} className="border-b border-rule py-3 text-sm"><button className="font-bold text-ai" onClick={() => { onOpen(x.patient.id); onClose(); }}>{x.patient.name}さん：{x.rows.length}件（{expiryDay(Math.min(...x.rows.map(r => r.lastDay)))}）</button><p>{x.rows.map(r => r.name).join("、")}</p>{x.messages.map(m => <p key={m}>{m}</p>)}</div>) : <p>処方切れはありません</p>}</section></div>;
}
