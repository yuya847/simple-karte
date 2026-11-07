"use client";
import { applyChoice, dosesPerDay, effectiveRoute, ratePlan, type InjectionDraft, type Issue } from "@/lib/drafts";
import { anyDrugName, findDrug } from "@/lib/master";

type Field = `amount-${number}` | `unit-${number}` | "route" | "schedule" | "rate";

/** 点滴時間・mL/時 are shown for a drip (or when one of them is already set). */
function showsRate(d: InjectionDraft): boolean {
  return !d.sliding && !d.insulinDoses && (effectiveRoute(d) === "点滴静注" || d.rateMlPerH !== null || d.infusionMinutes !== null);
}

/** The field where an issue is fixed (it gets a mark there), or null when it stays a row under the fields. */
export function injectionFieldOf(issue: Issue, d: InjectionDraft): Field | null {
  if (issue.level === "info") return null;
  const item = /^(amount|unit)-(\d+)$/.exec(issue.key);
  if (item && Number(item[2]) < d.items.length) return issue.key as Field;
  if (issue.key === "route") return "route";
  if (issue.key === "schedule" && !d.sliding) return "schedule";
  if (issue.key === "rate" && showsRate(d)) return "rate";
  return null;
}

/** 3–6 characters on the field: 点滴時間？・単位？・量？… */
function markText(i: Issue): string {
  return i.key === "route" && i.level === "stop" ? "使えない経路" : `${i.title}？`;
}

const num = (v: string) => (v ? Number(v) : null);

export function InjectionDraftEditor({ draft: d, issues = [], onApply }: { draft: InjectionDraft; issues?: Issue[]; onApply: (d: InjectionDraft) => void }) {
  const patch = (p: Partial<InjectionDraft>) => onApply({ ...d, ...p });
  const marks = new Map<Field, Issue>();
  for (const i of issues) {
    const f = injectionFieldOf(i, d);
    if (f && !marks.has(f)) marks.set(f, i);
  }
  const box = (f: Field) => {
    const i = marks.get(f);
    return `rounded border bg-sheet px-1 py-0.5 ${!i ? "border-rule" : i.level === "stop" ? "border-shu ring-1 ring-shu/40" : "border-yamabuki ring-1 ring-yamabuki/40"}`;
  };
  const mark = (f: Field) => {
    const i = marks.get(f);
    if (!i) return null;
    // A select already lists the choices; a typed field keeps its shortcut (1袋 …) as a chip.
    const chips = f === "route" || f === "schedule" ? [] : (i.choices ?? []).filter((c) => !c.remove);
    return (
      <>
        <span title={i.message} className={`whitespace-nowrap text-[11px] font-bold ${i.level === "stop" ? "text-shu" : "text-yamabuki"}`}>{markText(i)}</span>
        {chips.map((c) => (
          <button key={c.label} type="button" onClick={() => onApply(applyChoice(d, c) as InjectionDraft)} className="rounded border border-ai/40 bg-sheet px-1.5 text-[11px] text-ai hover:bg-ai hover:text-white">
            {c.label}
          </button>
        ))}
      </>
    );
  };
  const plan = ratePlan(d);
  const n = d.schedule ? dosesPerDay(d.schedule) : 1;
  // The 1回 field shows minutes per dose; a 1日分 time (2袋を20時間で) is shown divided.
  const minutes = d.infusionMinutes === null ? "" : d.infusionScope === "whole_day" && n > 1 ? Math.round(d.infusionMinutes / n) : d.infusionMinutes;
  const route = effectiveRoute(d);
  const label = "inline-flex items-center gap-1";
  const name = "text-ink-soft";
  return (
    <fieldset className="nums flex flex-wrap items-center gap-x-3 gap-y-1.5 py-1 text-xs">
      <legend className="sr-only">注射の下書きを修正</legend>
      {d.items.map((it, i) => {
        const m = it.drugCode ? findDrug(it.drugCode) : undefined;
        const units = m ? [...new Set([...(it.unit && !m.units.includes(it.unit) ? [it.unit] : []), ...m.units])] : [];
        return (
          <span key={i} className={label}>
            {d.items.length > 1 ? (
              <span className={`max-w-[11rem] truncate ${name}`} title={it.drugCode ? anyDrugName(it.drugCode) : it.said}>{it.drugCode ? anyDrugName(it.drugCode) : it.said}</span>
            ) : (
              <span className={name}>量</span>
            )}
            <input aria-label={`薬${i + 1}の量`} type="number" min="0.001" step="any" className={`w-16 ${box(`amount-${i}`)}`} value={it.amount ?? ""} onChange={(e) => patch({ items: d.items.map((x, k) => (k === i ? { ...x, amount: num(e.target.value) } : x)) })} />
            {m ? (
              <select aria-label={`薬${i + 1}の単位`} className={box(`unit-${i}`)} value={it.unit ?? ""} onChange={(e) => patch({ items: d.items.map((x, k) => (k === i ? { ...x, unit: e.target.value || null } : x)) })}>
                {!it.unit && <option value="">単位</option>}
                {units.map((u) => <option key={u}>{u}</option>)}
              </select>
            ) : (
              it.unit
            )}
            {mark(`amount-${i}`)}
            {mark(`unit-${i}`)}
          </span>
        );
      })}
      <label className={label}>
        <span className={name}>経路</span>
        <select className={box("route")} value={d.route ?? route ?? ""} onChange={(e) => patch({ route: (e.target.value || null) as InjectionDraft["route"] })}>
          {["", "点滴静注", "静注", "皮下注", "筋注"].map((r) => <option key={r} value={r}>{r || "未定"}</option>)}
        </select>
        {mark("route")}
      </label>
      {!d.sliding && (
        <label className={label}>
          <span className={name}>回数</span>
          <select aria-label="注射の回数" className={box("schedule")} value={d.schedule?.kind === "per_day" ? `day:${d.schedule.count}` : d.schedule?.kind === "every_hours" ? `hours:${d.schedule.hours}` : (d.schedule?.kind ?? "")} onChange={(e) => { const [kind, count] = e.target.value.split(":"); patch({ schedule: kind === "day" ? { kind: "per_day", count: Number(count) } : kind === "hours" ? { kind: "every_hours", hours: Number(count) } : kind === "once" ? { kind: "once" } : null, doseTimes: undefined }); }}>
            <option value="">未定</option>
            <option value="once">1回</option>
            {[1, 2, 3, 4].map((c) => <option key={c} value={`day:${c}`}>1日{c}回</option>)}
            {[4, 6, 8, 12, 24].map((h) => <option key={h} value={`hours:${h}`}>{h}時間ごと</option>)}
          </select>
          {mark("schedule")}
        </label>
      )}
      <span className={label}>
        <span className={name}>開始</span>
        <input aria-label="開始日（今日からの日数）" type="number" placeholder="0" className="w-12 rounded border border-rule bg-sheet px-1 py-0.5" value={d.start.day ?? ""} onChange={(e) => patch({ startNow: false, start: { ...d.start, day: num(e.target.value) } })} />
        <span className={name}>日後</span>
        <input aria-label="注射の開始時刻" type="time" className="rounded border border-rule bg-sheet px-1 py-0.5" value={d.start.time ?? ""} onChange={(e) => patch({ startNow: false, start: { ...d.start, time: e.target.value || null } })} />
      </span>
      <label className={label}>
        <span className={name}>日数</span>
        <input type="number" min="1" className="w-12 rounded border border-rule bg-sheet px-1 py-0.5" value={d.days ?? ""} onChange={(e) => patch({ days: num(e.target.value), end: undefined })} />
      </label>
      {showsRate(d) && (
        <span className={label}>
          <span className={name}>点滴</span>
          <input aria-label="1回の点滴時間（分）" type="number" min="1" step="any" className={`w-14 ${box("rate")}`} value={minutes} placeholder={plan.minutesPerDose !== null ? String(Math.round(plan.minutesPerDose)) : ""} onChange={(e) => patch({ infusionMinutes: num(e.target.value), infusionScope: "per_dose", rateMlPerH: null, prefer: "time" })} />
          <span className={name}>分</span>
          <input aria-label="mL/時" type="number" min="0.1" step="any" className={`w-16 ${box("rate")}`} value={d.rateMlPerH ?? ""} placeholder={plan.rateMlPerH !== null ? String(plan.rateMlPerH) : ""} onChange={(e) => patch({ rateMlPerH: num(e.target.value), infusionMinutes: null, prefer: "rate" })} />
          <span className={name}>mL/時</span>
          {mark("rate")}
        </span>
      )}
    </fieldset>
  );
}
