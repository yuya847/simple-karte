"use client";
import { useState } from "react";
import { CONFERENCE_PEOPLE, conferenceText, type SupportConference as Conference } from "@/lib/life-support";
export function SupportConference({ today, nowTime, by, records = [], onSave }: { today: string; nowTime: string; by: string; records?: Conference[]; onSave: (c: Conference) => void }) {
  const [c, setC] = useState<Conference>({ date: today, time: nowTime, people: [], agreement: "", nextAction: "", by });
  return <section aria-label="退院前カンファレンス" className="space-y-2 rounded border border-rule p-2">
    <h4 className="font-bold">退院前カンファレンス</h4>
    <label>開催日<input aria-label="開催日" type="date" max={today} value={c.date} onChange={e => setC({ ...c, date: e.target.value })} /></label>
    <label>時刻<input aria-label="開催時刻" type="time" value={c.time} onChange={e => setC({ ...c, time: e.target.value })} /></label>
    <div aria-label="参加者" className="flex flex-wrap gap-1">{CONFERENCE_PEOPLE.map(p => <button type="button" key={p} aria-pressed={c.people.includes(p)} className={`rounded border px-2 py-1 ${c.people.includes(p) ? "border-ai bg-ai-soft text-ai" : "border-rule"}`} onClick={() => setC({ ...c, people: c.people.includes(p) ? c.people.filter(v => v !== p) : [...c.people, p] })}>{p}</button>)}</div>
    <label className="block">合意事項<textarea aria-label="合意事項" className="block w-full border border-rule" value={c.agreement} onChange={e => setC({ ...c, agreement: e.target.value })} /></label>
    <label className="block">次の行動<textarea aria-label="カンファレンスの次の行動" className="block w-full border border-rule" value={c.nextAction} onChange={e => setC({ ...c, nextAction: e.target.value })} /></label>
    <button type="button" disabled={!c.date || c.date > today || !c.time || !c.people.length || !c.agreement.trim() || !c.nextAction.trim()} className="rounded bg-ai px-3 py-1 text-white disabled:opacity-40" onClick={() => { onSave(c); setC({ ...c, agreement: "", nextAction: "" }); }}>開催記録を追記</button>
    {records.map((r, i) => <p key={i} className="whitespace-pre-wrap border-t border-rule">{conferenceText(r)}</p>)}
  </section>;
}
