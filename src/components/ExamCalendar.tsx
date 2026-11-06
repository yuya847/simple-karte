"use client";
import { TimeInput } from "@/components/TimeInput";

import { useState } from "react";
import { addDays, daysFrom, formatMonth, formatShort, type CalendarDate } from "@/lib/dates";
import { firstExamSlot, slotsFor, type ExamKind, type TakenExam } from "@/lib/exam-slots";

export function ExamCalendar({ kind, today, taken, value, onChange }: {
  kind: ExamKind; today: CalendarDate; taken: TakenExam[];
  value: { day: number | null; time?: string | null; priority: string | null };
  onChange: (v: { day: number; time: string | null; priority: "予約" | "至急" }) => void;
}) {
  const [month, setMonth] = useState(() => { const d = addDays(today, value.day ?? 0); return { ...d, d: 1 }; });
  const [day, setDay] = useState(value.day ?? 0);
  const start = new Date(Date.UTC(month.y, month.m - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate();
  const move = (n: number) => { const d = new Date(Date.UTC(month.y, month.m - 1 + n, 1)); setMonth({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: 1 }); };
  const selected = value.priority !== "至急";
  return <section className="space-y-2 text-sm" aria-label="いつ行うか">
    <div role="radiogroup" aria-label="予約か至急" className="flex gap-2">
      <button type="button" role="radio" aria-checked={!selected} onClick={() => onChange({ day: 0, time: null, priority: "至急" })} className={`rounded border px-2 py-1 text-xs ${!selected ? "border-shu bg-shu-soft font-bold text-shu" : "border-rule text-ink-soft"}`}>今すぐ（至急）</button>
      <button type="button" role="radio" aria-checked={selected} onClick={() => { const v = firstExamSlot(kind, taken, today, kind.startsWith("PHY-") ? 1 : 0); setDay(v.day); const d = addDays(today, v.day); setMonth({ ...d, d: 1 }); onChange(v); }} className={`rounded border px-2 py-1 text-xs ${selected ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule text-ink-soft"}`}>日時を選ぶ</button>
    </div>
    {selected && <div className="grid gap-3 @md:grid-cols-[18rem_1fr]">
    <div className="rounded border border-rule p-2 text-xs">
      <div className="mb-1 flex items-center justify-between font-bold"><button type="button" aria-label="前の月" disabled={daysFrom(today, month) <= 0} onClick={() => move(-1)}>←</button><span>{formatMonth(month)}</span><button type="button" aria-label="次の月" disabled={daysFrom(today, { ...month, d: count }) >= 56} onClick={() => move(1)}>→</button></div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {["日", "月", "火", "水", "木", "金", "土"].map((w) => <span key={w} className="text-ink-faint">{w}</span>)}
        {Array.from({ length: start }, (_, i) => <span key={`blank${i}`} />)}
        {Array.from({ length: count }, (_, i) => { const date = { ...month, d: i + 1 }; const offset = daysFrom(today, date); return <button key={i} type="button" aria-label={formatShort(date)} aria-pressed={day === offset} disabled={offset < 0 || offset > 56} onClick={() => { setDay(offset); if (kind === "PORT") onChange({ day: offset, time: value.time ?? null, priority: "予約" }); }} className={`nums rounded border py-0.5 disabled:opacity-30 ${day === offset ? "border-ai bg-ai-soft font-bold" : "border-rule"}`}>{i + 1}</button>; })}
      </div>
    </div>
    <div className="min-w-0">
    <p className="mb-1 text-xs text-ink-soft">{formatShort(addDays(today, day))}の枠{selected && value.time ? `（選択：${formatShort(addDays(today, value.day ?? day))} ${value.time}）` : ""}</p>
    {kind === "PORT" ? <label>時刻（枠なし）<TimeInput aria-label="時刻" value={value.time ?? ""} onChange={(e) => onChange({ day, time: e.target.value || null, priority: "予約" })} /></label> : <div className="flex max-h-56 flex-wrap gap-1 overflow-y-auto">
      {slotsFor(kind, day, taken, today).map((s) => <button key={s.time} type="button" disabled={s.status !== "空き"} aria-pressed={selected && value.day === day && value.time === s.time} onClick={() => onChange({ day, time: s.time, priority: "予約" })} title={`${s.time} ${s.status}${s.label ? `（${s.label}）` : ""}`} className={`nums rounded border px-1.5 py-0.5 text-xs disabled:opacity-50 ${selected && value.day === day && value.time === s.time ? "border-ai bg-ai text-white" : s.status === "空き" ? "border-rule bg-sheet" : "border-rule-soft bg-paper text-ink-faint line-through"}`}>{s.time}{s.status !== "空き" && ` ${s.label ? s.label : s.status}`}</button>)}
    </div>}
    </div>
    </div>}

  </section>;
}

/* Help migration source (references and dynamic wording):
<p >今日から8週間の予約枠です。土曜は午前のみ、日曜・祝日・年末年始は休みです（祝日は2026年のみ対応）。ポータブルは時刻を直接入れます。ほかの患者の名前は予約の調整のために出しています。</p>
*/
