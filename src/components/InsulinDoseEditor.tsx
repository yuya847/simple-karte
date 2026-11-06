"use client";
import { useState } from "react";
import { insulinDoses, parseInsulinDoses, type InsulinDose } from "@/lib/insulin-doses";
import { TimeInput } from "./TimeInput";
export function InsulinDoseEditor({ value, onChange }: { value?: InsulinDose[]; onChange: (value: InsulinDose[] | undefined) => void }) {
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  return <div className="space-y-1">
    <label><input type="checkbox" checked={!!value} onChange={e => { onChange(e.target.checked ? insulinDoses([0, 0, 0, 0]) : undefined); setText(""); setInvalid(false); }} /> 時刻ごとの量</label>
    {value && <><label className="block">朝・昼・夕・眠前 <input aria-label="インスリンの朝昼夕眠前の量" placeholder="2-2-2-0" value={text} onChange={e => { setText(e.target.value); const units = parseInsulinDoses(e.target.value); setInvalid(!units); onChange(value.map((d, i) => ({ ...d, units: units ? units[i] : NaN }))); }} onKeyDown={e => e.stopPropagation()} className="w-28 rounded border border-rule px-1" aria-invalid={invalid} /></label>
    <div className="flex flex-wrap gap-2">{value.map((d, i) => <label key={d.label}>{d.label} <input aria-label={`${d.label}のインスリン量`} type="number" min="0" step="any" value={Number.isFinite(d.units) ? d.units : ""} className="w-14 rounded border border-rule px-1" onChange={e => { onChange(value.map((x, j) => j === i ? { ...x, units: e.target.value === "" ? NaN : Number(e.target.value) } : x)); setText(""); setInvalid(false); }} /> U <TimeInput aria-label={`${d.label}のインスリン時刻`} value={d.time} onChange={e => onChange(value.map((x, j) => j === i ? { ...x, time: e.target.value } : x))} className="w-20 rounded border border-rule" /></label>)}</div></>}
  </div>;
}
