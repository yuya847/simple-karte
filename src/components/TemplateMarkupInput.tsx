"use client";
import { useId } from "react";
import type { MarkupField } from "@/lib/template-syntax";

export function TemplateMarkupInput({ field: f, value, onChange }: { field: MarkupField; value: string | string[] | undefined; onChange: (v: string | string[]) => void }) {
  const id = useId();
  const v = value ?? f.defaultValue;
  const input = "rounded border border-rule bg-sheet px-2 py-1 text-xs outline-none focus:border-ai";
  const shortcuts = (e: React.KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey || !/^[1-9]$/.test(e.key)) return;
    const option = f.options[Number(e.key) - 1];
    if (!option) return;
    e.preventDefault();
    const list = Array.isArray(v) ? v : [];
    onChange(f.multiple ? list.includes(option) ? list.filter(x => x !== option) : [...list, option] : option);
  };
  return <div className="my-1 flex flex-wrap items-center gap-2 text-xs">
    <span>{f.label}{f.required && <span className="text-shu"> *</span>}</span>
    {f.type === "combo" ? <><input aria-label={f.label} aria-required={f.required} list={id} value={typeof v === "string" ? v : ""} onChange={e => onChange(e.target.value)} className={input} /><datalist id={id}>{f.options.map(o => <option key={o} value={o} />)}</datalist></>
      : f.type === "list" ? <select aria-label={f.label} aria-required={f.required} multiple={f.multiple} size={Math.min(6, Math.max(2, f.options.length))} value={f.multiple ? Array.isArray(v) ? v : [] : typeof v === "string" ? v : ""} onKeyDown={shortcuts} onChange={e => onChange(f.multiple ? Array.from(e.target.selectedOptions, o => o.value) : e.target.value)} className={input}>{f.options.map(o => <option key={o} value={o}>{o}</option>)}</select>
      : f.type === "radio" ? <span role="radiogroup" aria-label={f.label} aria-required={f.required} onKeyDown={shortcuts} className="flex flex-wrap gap-2">{f.options.map(o => <label key={o}><input type="radio" aria-label={`${f.label} ${o}`} name={id} checked={v === o} onChange={() => onChange(o)} /> {o}</label>)}</span>
      : f.type === "check" ? <input type="checkbox" aria-label={f.label} aria-required={f.required} checked={v === "true"} onChange={e => onChange(String(e.target.checked))} />
      : <input aria-label={f.label} aria-required={f.required} type={f.type === "text" ? "text" : f.type} step={f.type === "number" ? "any" : undefined} value={typeof v === "string" ? v : ""} onChange={e => onChange(e.target.value)} className={input} />}
    {f.unit}
  </div>;
}
