"use client";

import { useRef } from "react";

export interface TabOption<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
  title?: string;
}

/**
 * The large chips (size="lg", for choices pressed often on a tablet, e.g. the injection's 経路・回数): 30px
 * and up, room on the sides, the chosen one 藍 with white letters.
 */
export const TAB_CHOICE_LG = "min-h-[30px] px-3 py-1 text-[13px]";

/**
 * Choose one of a few values as tabs. Keyboard: Tab comes in on the chosen one (or the first),
 * ← → (↑ ↓) move and choose, Home / End jump to the ends, Space or Enter chooses the focused one.
 */
export function TabChoice<T extends string | number>({ label, options, value, onChange, size = "sm" }: { label: string; options: TabOption<T>[]; value: T | null; onChange: (v: T) => void; size?: "sm" | "lg" }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const selected = options.findIndex((o) => o.value === value);
  const tabStop = selected >= 0 && !options[selected].disabled ? selected : (enabled[0] ?? -1);
  const move = (from: number, step: number | "home" | "end") => {
    if (!enabled.length) return;
    const pos = enabled.indexOf(from);
    const next =
      step === "home" ? enabled[0] : step === "end" ? enabled[enabled.length - 1] : enabled[(((pos < 0 ? 0 : pos) + step) % enabled.length + enabled.length) % enabled.length];
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-md border border-rule bg-paper p-0.5">
      {options.map((o, i) => {
        const on = i === selected;
        return (
          <button
            key={String(o.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            title={o.title}
            tabIndex={i === tabStop ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const k = e.key;
              if (k === "ArrowRight" || k === "ArrowDown") move(i, 1);
              else if (k === "ArrowLeft" || k === "ArrowUp") move(i, -1);
              else if (k === "Home") move(i, "home");
              else if (k === "End") move(i, "end");
              else return;
              e.preventDefault();
            }}
            className={`nums rounded outline-none focus-visible:ring-2 focus-visible:ring-ai/60 ${size === "lg" ? TAB_CHOICE_LG : "px-2 py-0.5 text-[12px] pointer-coarse:px-3 pointer-coarse:py-1.5 pointer-coarse:text-[13px]"} ${
              on ? (size === "lg" ? "bg-ai font-bold text-white" : "bg-ink font-bold text-white") : "text-ink-soft hover:text-ink disabled:text-ink-faint/40"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
