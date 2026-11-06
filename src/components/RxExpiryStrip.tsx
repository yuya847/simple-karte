"use client";
import { useState } from "react";
import { expiryRequest } from "@/lib/rx-expiry-workflow";
import { expiryDay, expirySummary, expiryKey, rxExpiries } from "@/lib/rx-expiry";
import type { CalendarDate } from "@/lib/dates";
import type { OrderEntry, Patient } from "@/lib/types";
import type { Sticky } from "./StickyStrip";

export function RxExpiryStrip({ patient, entries, today, doctor, sender, stickies, onSticky, onRemove, onExtend, pending }: { patient: Patient; entries: OrderEntry[]; today: CalendarDate; doctor: boolean; sender: string; stickies: Sticky[]; onSticky: (s: Sticky) => void; onRemove: (id: string) => void; onExtend: (entry: OrderEntry, days: number) => void; pending: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(7);
  const rows = rxExpiries(patient, entries, today).filter(r => !stickies.some(s => s.id === `${expiryKey(r)}:done`));
  if (!rows.length) return null;
  const finish = (id: string) => { onRemove(id); onSticky({ id: `${id}:done`, text: "処方切れ：終了を確認", by: sender, at: "", shared: true }); };
  return <section className="border-b border-rule bg-yamabuki-soft px-4 py-1 text-xs">
    <button onClick={() => setOpen(!open)}>{expirySummary(rows)}</button>
    {open && <div className="space-y-2 py-2">
      {doctor && <div className="flex gap-3"><button onClick={() => rows.filter(r => !pending[r.entry.id]).forEach(r => onExtend(r.entry, r.days))}>まとめて延長（同じ日数で Do）</button><label>日数 <input aria-label="延長日数" type="number" min={1} max={365} value={days} onChange={e => setDays(Number(e.target.value))} className="w-14 border border-rule" /></label><button disabled={!Number.isInteger(days) || days < 1 || days > 365} onClick={() => rows.forEach(r => onExtend(r.entry, days))}>日数を変えてまとめて延長</button><button onClick={() => rows.forEach(r => finish(expiryKey(r)))}>まとめて終了にする</button></div>}
      {rows.map(r => <div key={r.entry.id} className="flex flex-wrap gap-3"><span>{r.entry.order.type === "prescription" ? "内服" : "注射"} {r.name}：{expiryDay(r.lastDay)}まで{r.beforeRegular ? "・次の定期処方日まで" : ""}</span>{doctor ? <>{pending[r.entry.id] ? <span>延長の下書きあり（{pending[r.entry.id]}日）</span> : <><button onClick={() => onExtend(r.entry, r.days)}>延長（{r.days}日で Do）</button><button disabled={!Number.isInteger(days) || days < 1 || days > 365} onClick={() => onExtend(r.entry, days)}>日数を変えて延長</button></>}<button onClick={() => finish(expiryKey(r))}>終了にする（何もしない）</button></> : <button disabled={stickies.some(s => s.id === expiryKey(r))} onClick={() => onSticky(expiryRequest(patient, r, sender))}>処方切れを医師に伝える</button>}</div>)}
    </div>}
  </section>;
}
