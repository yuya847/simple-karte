"use client";
import { useId, useState, type InputHTMLAttributes } from "react";
import { flushSync } from "react-dom";
import { HALF_HOUR_TIMES, normalizeTime } from "@/lib/time-input";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "list"> & {
  value: string;
  onChange: (event: { target: { value: string } }, value: string) => void;
  options?: readonly string[];
  /** 候補を30分刻みの一覧に足す。false なら置き換える。 */
  includeDefaultOptions?: boolean;
  allow24?: boolean;
};
export function TimeInput({ value, onChange, options = [], includeDefaultOptions = true, allow24 = false, className = "", onBlur, onKeyDown, onCompositionEnd, ...props }: Props) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [previous, setPrevious] = useState(value);
  const [error, setError] = useState(false);
  if (previous !== value) {
    setPrevious(value);
    if (normalizeTime(draft, { allow24 }) !== value) { setDraft(value); setError(false); }
  }
  const publish = (text: string, finish = false) => {
    const normalized = text.trim() === "" ? "" : normalizeTime(text, { allow24 });
    if (normalized === null) { if (finish) setError(true); return false; }
    setError(false);
    if (finish) setDraft(normalized);
    if (normalized !== value) onChange({ target: { value: normalized } }, normalized);
    return true;
  };
  const choices = [...new Set([...options, ...(includeDefaultOptions ? HALF_HOUR_TIMES : []), ...(allow24 ? ["24:00"] : [])])].filter((t) => normalizeTime(t, { allow24 }) !== null);
  return <span className="inline-flex flex-col align-middle">
    <input {...props} type="text" inputMode="numeric" size={6} list={`${id}-times`} value={draft}
      className={`${className} ${error ? "border-shu outline outline-1 outline-shu" : ""}`}
      aria-invalid={error || props["aria-invalid"]} aria-describedby={[props["aria-describedby"], error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined}
      onChange={(e) => { setDraft(e.target.value); if (!(e.nativeEvent as InputEvent).isComposing) publish(e.target.value); }}
      onCompositionEnd={(e) => { publish(e.currentTarget.value); onCompositionEnd?.(e); }}
      onBlur={(e) => { publish(e.currentTarget.value, true); onBlur?.(e); }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          let valid = false;
          flushSync(() => { valid = publish(e.currentTarget.value, true); });
          if (!valid) { e.preventDefault(); e.stopPropagation(); return; }
        }
        onKeyDown?.(e);
      }} />
    <datalist id={`${id}-times`}>{choices.map((t) => <option key={t} value={t} />)}</datalist>
    {error && <span id={`${id}-error`} role="alert" className="text-[11px] text-shu">時刻は 11:00 か 1100 のように</span>}
  </span>;
}


export function TimeInputs({ times, onChange, label, options = [], allow24 = false }: { times: string[]; onChange: (times: string[]) => void; label: string; options?: readonly string[]; allow24?: boolean }) {
  return <span className="inline-flex flex-wrap items-center gap-1">
    {times.map((time, i) => <span key={i} className="inline-flex items-center gap-1">
      <TimeInput value={time} options={options} allow24={allow24} aria-label={i === 0 ? label : `${label} ${i + 1}回目`} className="w-16 rounded border border-rule bg-sheet px-1" onChange={(e) => onChange(times.map((t, j) => j === i ? e.target.value : t))} />
      <button type="button" aria-label={`${label} ${i + 1}回目を消す`} onClick={() => onChange(times.filter((_, j) => j !== i))}>×</button>
    </span>)}
    <button type="button" onClick={() => onChange([...times, ""])}>＋時刻</button>
  </span>;
}
