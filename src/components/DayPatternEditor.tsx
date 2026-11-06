"use client";
import { useState } from "react";
import type { DayPattern } from "@/lib/types";
import { DAY_NAMES } from "@/lib/day-pattern";
import { TabChoice } from "./TabChoice";

const OPTIONS = ["毎日", "隔日", "週1回（曜日）", "月水金", "火木土", "曜日を選ぶ"];
export function DayPatternEditor({ value, onChange, label = "投与日" }: { value?: DayPattern; onChange: (p: DayPattern | undefined) => void; label?: string }) {
  const infer = () => !value || value.kind === "every" && value.n === 1 ? 0 : value.kind === "every" ? 1 : value.days.length === 1 ? 2 : value.days.join() === "1,3,5" ? 3 : value.days.join() === "2,4,6" ? 4 : 5;
  const [mode, setMode] = useState(infer);
  const days = value?.kind === "weekdays" ? value.days : [];
  return <div className="space-y-1" onKeyDown={(e) => {
    if (e.key === "Tab") e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault(); e.stopPropagation();
      const target = e.target as HTMLElement;
      if (target instanceof HTMLInputElement) target.click();
      const weekday = target instanceof HTMLButtonElement ? e.currentTarget.querySelector<HTMLInputElement>('input[type="checkbox"]') : null;
      const count = e.currentTarget.closest("[data-step]")?.querySelector<HTMLInputElement>('input[inputmode="numeric"]');
      (weekday ?? count)?.focus();
    }
  }}>
    <TabChoice label={label} options={OPTIONS.map((text, i) => ({ value: i, label: text }))} value={mode} onChange={(i) => { setMode(i); onChange(i === 0 ? undefined : i === 1 ? { kind: "every", n: 2 } : { kind: "weekdays", days: i === 3 ? [1, 3, 5] : i === 4 ? [2, 4, 6] : [days[0] ?? 1] }); }} />
    {(mode === 2 || mode === 5) && <div role="group" aria-label={`${label}の曜日`} className="flex gap-2">{DAY_NAMES.map((text, d) => <label key={d}><input type="checkbox" checked={days.includes(d)} onChange={() => onChange({ kind: "weekdays", days: mode === 2 ? [d] : days.includes(d) ? days.length === 1 ? days : days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b) })} />{text}</label>)}</div>}
  </div>;
}
