"use client";
import { isoDate, todayInTokyo, type CalendarDate } from "@/lib/dates";
import { useState } from "react";
import { useDeny, useMe } from "./RoleContext";
import type { NoteEntry } from "@/lib/types";
import type { RehabRx } from "@/lib/rehab";

export function RehabConference({ rxs, nowTime, onNote, today = todayInTokyo() }: { today?: CalendarDate; rxs: RehabRx[]; nowTime: string; onNote?: (pid: string, note: NoteEntry) => void }) {
  const me = useMe();
  const deny = useDeny()("rehab.therapy");
  const [pid, setPid] = useState(rxs[0]?.patientId ?? "");
  const [time, setTime] = useState(nowTime);
  const [date, setDate] = useState(isoDate(today));
  const day = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${isoDate(today)}T00:00:00Z`)) / 86400000);
  const [participants, setParticipants] = useState("");
  const [goal, setGoal] = useState("");
  const [policy, setPolicy] = useState("");
  const [saved, setSaved] = useState(false);
  return <section className="space-y-2 rounded border border-rule p-3">
    <h3 className="font-bold">多職種カンファレンス</h3>
    <select aria-label="カンファレンスの患者" value={pid} onChange={e => setPid(e.target.value)}>{rxs.map(r => <option key={r.orderId} value={r.patientId}>{r.room} {r.name}</option>)}</select>
    <label>日付<input type="date" max={isoDate(today)} value={date} onChange={e => setDate(e.target.value)} /></label>
    <label>時刻<input type="time" value={time} onChange={e => setTime(e.target.value)} /></label>
    {[["参加者", participants, setParticipants], ["目標", goal, setGoal], ["方針", policy, setPolicy]].map(([label, value, set]) => <label key={String(label)} className="block">{String(label)}<textarea className="block w-full border border-rule" value={value as string} onChange={e => (set as (v: string) => void)(e.target.value)} /></label>)}
    <button type="button" disabled={!!deny || !onNote || !pid || !time || !Number.isInteger(day) || day > 0 || !participants.trim() || !goal.trim() || !policy.trim()} onClick={() => { onNote?.(pid, { kind: "note", id: crypto.randomUUID(), day, time, author: me.name, role: me.role, text: `リハビリ多職種カンファレンス\n参加者：${participants}\n目標：${goal}\n方針：${policy}` }); setSaved(true); }} className="rounded bg-ai px-3 py-1 text-white disabled:opacity-40">カンファレンスを記録</button>
    {saved && <p role="status">カルテの経過に記録しました。</p>}
  </section>;
}
