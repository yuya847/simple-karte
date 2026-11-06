"use client";
import { rehabPrescriptions, progressOf, type RehabDesk } from "@/lib/rehab";
import type { WorkPatient } from "@/lib/worksheet";
export function RehabPatients({ people, desk, onOpen, me }: { people: WorkPatient[]; desk: RehabDesk; onOpen: (id: string) => void; me: string }) {
  const rxs = rehabPrescriptions(people).sort((a,b) => Number(desk.bookings.some(x => x.patientId === b.patientId && x.therapist === me)) - Number(desk.bookings.some(x => x.patientId === a.patientId && x.therapist === me)) || a.room.localeCompare(b.room));
  return <section className="overflow-auto p-4"><h1 className="mb-3 font-bold">受け持ち患者</h1><table className="w-auto table-auto self-start text-left text-sm"><thead><tr>{["部屋", "患者", "リハビリの区分", "今日の単位", "BI", "算定日数"].map(x => <th key={x} className="whitespace-nowrap p-2">{x}</th>)}</tr></thead><tbody>{rxs.map(r => { const p = progressOf(desk, r, 0); return <tr key={r.orderId} className="border-t border-rule"><td className="whitespace-nowrap p-2">{r.room}</td><td className="p-2"><button onClick={() => onOpen(r.patientId)}>{r.name}</button></td><td className="p-2">{r.order.field}</td><td className="p-2">{p.units.find(u => u.day === 0)?.units ?? 0}</td><td className="p-2">{p.bi.at(-1)?.total ?? "—"}</td><td className="p-2">{p.standard.dayNo}日目</td></tr>; })}</tbody></table></section>;
}
