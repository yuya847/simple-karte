"use client";
import type { InjectionDraft } from "@/lib/drafts";
import { anyDrugName } from "@/lib/master";

export function InjectionDraftEditor({ draft: d, onApply }: { draft: InjectionDraft; onApply: (d: InjectionDraft) => void }) {
  const field = "w-24 rounded border border-rule bg-sheet px-1 py-0.5";
  const patch = (p: Partial<InjectionDraft>) => onApply({ ...d, ...p });
  return <fieldset className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs"><legend className="sr-only">注射の下書きを修正</legend>
    {d.items.map((it, i) => <label key={i}>{it.drugCode ? anyDrugName(it.drugCode) : it.said} <input aria-label={`薬${i + 1}の量`} type="number" min="0.001" step="any" className={field} value={it.amount ?? ""} onChange={e => patch({ items: d.items.map((x, n) => n === i ? { ...x, amount: e.target.value ? Number(e.target.value) : null } : x) })} />{it.unit}</label>)}
    <label>経路 <select className={field} value={d.route ?? ""} onChange={e => patch({ route: e.target.value as InjectionDraft["route"] })}>{["", "点滴静注", "静注", "皮下注", "筋注"].map(r => <option key={r}>{r}</option>)}</select></label>
    {!d.sliding && <label>回数 <select aria-label="注射の回数" className={field} value={d.schedule?.kind === "per_day" ? `day:${d.schedule.count}` : d.schedule?.kind === "every_hours" ? `hours:${d.schedule.hours}` : d.schedule?.kind ?? ""} onChange={e => { const [kind, count] = e.target.value.split(":"); patch({ schedule: kind === "day" ? { kind: "per_day", count: Number(count) } : kind === "hours" ? { kind: "every_hours", hours: Number(count) } : kind === "once" ? { kind: "once" } : null, doseTimes: undefined }); }}>
      <option value="">未定</option><option value="once">1回</option>{[1, 2, 3, 4].map(n => <option key={n} value={`day:${n}`}>1日{n}回</option>)}{[4, 6, 8, 12, 24].map(n => <option key={n} value={`hours:${n}`}>{n}時間ごと</option>)}
    </select></label>}
    <label>開始日 <input aria-label="開始日（今日からの日数）" className={field} type="number" value={d.start.day ?? ""} onChange={e => patch({ startNow: false, start: { ...d.start, day: e.target.value ? Number(e.target.value) : null } })} /></label>
    <label>時刻 <input aria-label="注射の開始時刻" className={field} type="time" value={d.start.time ?? ""} onChange={e => patch({ startNow: false, start: { ...d.start, time: e.target.value || null } })} /></label>
    <label>日数 <input className={field} type="number" min="1" value={d.days ?? ""} onChange={e => patch({ days: e.target.value ? Number(e.target.value) : null, end: undefined })} /></label>
    {!d.sliding && !d.insulinDoses && <label>mL/時 <input className={field} type="number" min="0.1" step="any" value={d.rateMlPerH ?? ""} onChange={e => patch({ rateMlPerH: e.target.value ? Number(e.target.value) : null, infusionMinutes: null, prefer: "rate" })} /></label>}
  </fieldset>;
}
