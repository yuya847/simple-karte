"use client";
import { expiryRequest } from "@/lib/rx-expiry-workflow";
import { expiryDay, expiryKey, rxExpiries } from "@/lib/rx-expiry";
import type { CalendarDate } from "@/lib/dates";
import type { OrderEntry, Patient } from "@/lib/types";
import type { Sticky } from "./StickyStrip";
export function RxExpiryNotice({ people, today, sender, stickies, onSend }: { people: { patient: Patient; entries: OrderEntry[] }[]; today: CalendarDate; sender: string; stickies: Record<string, Sticky[]>; onSend: (pid: string, sticky: Sticky) => void }) {
  const rows = people.flatMap(x => rxExpiries(x.patient, x.entries, today).filter(r => !(stickies[x.patient.id] ?? []).some(s => s.id === `${expiryKey(r)}:done`)).map(r => ({ ...r, patient: x.patient })));
  if (!rows.length) return null;
  return <details className="text-xs"><summary>処方切れ {rows.length}件</summary><div className="max-h-48 overflow-auto">{rows.map(r => <div key={`${r.patient.id}:${r.entry.id}`} className="flex gap-3 py-1"><span>{r.patient.name}さん：{r.name}が{expiryDay(r.lastDay)}で切れます</span><button disabled={(stickies[r.patient.id] ?? []).some(s => s.id === expiryKey(r))} onClick={() => onSend(r.patient.id, expiryRequest(r.patient, r, sender))}>処方切れを医師に伝える</button></div>)}</div></details>;
}
