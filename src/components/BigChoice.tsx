"use client";

/**
 * Choose one of a few values with large buttons (36px or taller, the whole label is the button), the chosen
 * one coloured 藍. Used where a choice is pressed often or on a tablet: the 受付's 初診／再診, the 会計's
 * 現金／カード. Each option is a radio inside its label, so Tab and ← → work as for any radio group.
 */
export interface BigChoiceOption<T extends string> {
  value: T;
  label: string;
}

export function BigChoice<T extends string>({ label, name, options, value, onChange, disabled, className = "" }: { label: string; name: string; options: readonly BigChoiceOption<T>[]; value: T | ""; onChange: (v: T) => void; disabled?: boolean; className?: string }) {
  return (
    <span role="radiogroup" aria-label={label} className={`flex flex-wrap items-center gap-1.5 text-[13px] ${className}`}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <label
            key={o.value}
            className={`flex min-h-9 cursor-pointer select-none items-center gap-1.5 rounded-md border px-3 ${on ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule bg-paper hover:border-ai"} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            data-chosen={on || undefined}
          >
            <input type="radio" name={name} checked={on} onChange={() => onChange(o.value)} disabled={disabled} className="accent-ai" />
            {o.label}
          </label>
        );
      })}
    </span>
  );
}
