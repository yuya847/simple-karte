"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { kanaMatch } from "@/lib/kana";
import { candidateIndex } from "@/lib/rx-entry";
export function RpDrugSearch({ options, onPick, placeholder, prefix = false, onEmptyEnter, onBack, onComment }: { onEmptyEnter?: () => void; onBack?: () => void; onComment?: (text: string) => void; options: { code: string; name: string; sub: string; aliases: string[] }[]; onPick: (code: string) => void; placeholder: string; prefix?: boolean }) {
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  // ひらがなでもカタカナでも、全角・半角でも引ける（「かろな」→ カロナール）.
  const hits = q.trim() ? options.filter((d) => [d.name, d.sub, ...d.aliases].some((a) => kanaMatch(a, q, prefix))).slice(0, 8) : [];
  const pick = (code: string) => {
    onPick(code);
    setQ("");
    setAt(0);
  };
  return (
    <div className="relative">
      <label className="flex items-center gap-1.5 rounded border border-dashed border-rule bg-paper px-2 py-1 focus-within:border-ai">
        <Search size={13} className="text-ink-faint" />
        <input
          value={q}
          onChange={(e) => {
            if (onComment && e.target.value.startsWith(";")) { onComment(e.target.value.slice(1)); setQ(""); return; }
            setQ(e.target.value);
            setAt(0);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "ArrowDown" && hits.length) setAt((a) => Math.min(a + 1, hits.length - 1));
            else if (e.key === "ArrowUp" && hits.length) setAt((a) => Math.max(a - 1, 0));
            else if ((e.key === "Enter" || (e.key === "Tab" && onEmptyEnter && !e.shiftKey)) && !e.metaKey && !e.ctrlKey && candidateIndex(hits.length, at) !== null) pick(hits[candidateIndex(hits.length, at)!].code);
            else if (e.key === "Enter" && !q && onEmptyEnter) onEmptyEnter();
            else if (e.key === "Escape" && q) setQ("");
            else if (e.key === "Escape" && onBack) onBack();
            else return;
            e.preventDefault();
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          role="combobox"
          aria-expanded={hits.length > 0}
          className="flex-1 bg-transparent text-[13px] outline-none"
        />
      </label>
      {hits.length > 0 && (
        <ul role="listbox" className="absolute inset-x-0 top-full z-10 mt-0.5 divide-y divide-rule-soft rounded border border-rule bg-sheet shadow-md">
          {hits.map((d, i) => (
            <li key={d.code} role="option" aria-selected={i === at}>
              <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(d.code)} className={`nums flex w-full items-baseline gap-2 px-2 py-1.5 text-left ${i === at ? "bg-ai-soft" : "hover:bg-paper"}`}>
                <b>{d.name}</b>
                <span className="text-xs text-ink-soft">{d.sub}</span>
                <span className="ml-auto text-[11px] text-ink-faint">{d.aliases.slice(0, 3).join("・")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim() && hits.length === 0 && <p className="mt-0.5 text-[11px] text-ink-faint">院内のマスターにありません。</p>}
    </div>
  );
}


export function LineEntry({ children }: { children: React.ReactNode }) { return <div className="divide-y divide-rule border-y border-rule">{children}</div>; }

export function DoseTimesEntry({ label, times, onChange }: { label: string; times: string[]; onChange: (times: string[]) => void }) {
  return <div className="flex flex-wrap items-center gap-1" aria-label={label}><span>投与時刻</span>{times.map((time, i) => <label key={i} className="inline-flex items-center gap-1"><input aria-label={`${label} ${i + 1}回目`} value={time} placeholder="HH:MM" className="w-16 border-b border-rule bg-transparent" onChange={(e) => onChange(times.map((t, k) => k === i ? e.target.value : t))} /><button type="button" aria-label={`${label} ${i + 1}回目を消す`} onClick={() => onChange(times.filter((_, k) => k !== i))}>×</button></label>)}<button type="button" onClick={() => onChange([...times, ""])}>＋時刻</button></div>;
}

/** 確定済みの段は罫線の一行。押すとその段へ戻る。 */
export function DecidedEntryLines<S extends string>({ lines, onEdit }: { lines: { step: S; text: string }[]; onEdit: (step: S) => void }) {
  return <div className="divide-y divide-rule border-b border-rule">{lines.map(({ step, text }) => <button key={step} type="button" data-decided-step={step} className="block w-full px-2 py-1.5 text-left hover:bg-paper focus:bg-ai-soft" onClick={() => onEdit(step)}>{text}</button>)}</div>;
}
