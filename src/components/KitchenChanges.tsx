"use client";
import { floorOf } from "@/lib/ward";
import { displayText } from "@/lib/display-text";
import { auditLog } from "@/lib/audit";
import { kitchenChanges, type KitchenDesk } from "@/lib/kitchen";
import type { DietOrder } from "@/lib/diet";
import type { Patient } from "@/lib/types";
import { useDeny, useMe } from "./RoleContext";

export function KitchenChanges({ people, diets, desk, onDesk, nowTime }: { people: { patient: Patient; room: string }[]; diets: DietOrder[]; desk: KitchenDesk; onDesk: (f: (d: KitchenDesk) => KitchenDesk) => void; nowTime: string }) {
  const me = useMe(); const deny = useDeny();
  const rows = kitchenChanges(diets, desk).filter(r => people.some(p => p.patient.id === r.patientId));
  return <section className="rounded border border-rule bg-sheet p-3" aria-label="今日の変更"><h2 className="font-bold">今日の変更（今日・明日の食事） <span className="text-shu">{rows.filter(r => !desk.received?.[r.id]).length}</span></h2>
    {!rows.length && <p>変更はありません。</p>}
    <table className="w-full table-auto self-start text-left text-sm [&_th]:px-3 [&_th]:py-2 [&_th]:whitespace-nowrap [&_td]:px-3 [&_td]:py-2 [&_td]:align-top"><thead><tr>{["患者", "病棟", "時刻", "内容", "出した人", "受領"].map(s => <th key={s}>{s}</th>)}</tr></thead><tbody>{rows.map(r => {
      const p = people.find(x => x.patient.id === r.patientId); const received = desk.received?.[r.id];
      return <tr key={r.id} className="border-t border-rule"><td className="whitespace-nowrap font-medium">{p?.patient.name ?? r.patientId}</td><td className="whitespace-nowrap">{p?.patient.ward || (p?.room ? floorOf(p.room.replace(/[A-Z]$/, "")) : "")} {p?.room}</td><td className="whitespace-nowrap tabular-nums">{r.time}</td><td>{displayText(r.text)}</td><td>{displayText(r.by)}</td><td>{received ? `${received.by} ${received.time}` : <button type="button" disabled={!!deny("kitchen")} className="rounded border border-rule px-2 text-ai disabled:opacity-40" onClick={() => {
        auditLog({ role: me.role, actor: me.name, action: "給食の変更を受けた", patient: p?.patient.name, detail: `${r.id} ${r.text} ${nowTime}` });
        onDesk(d => d.received?.[r.id] ? d : ({ ...d, received: { ...d.received, [r.id]: { by: me.name, day: 0, time: nowTime } } }));
      }}>受けた</button>}</td></tr>;
    })}</tbody></table></section>;
}
