"use client";

// 「自分の目で確かめた」 before 指示を受ける・確認した: the whole label is the target (32px high, coloured
// when ticked), and the button beside it says in words what it waits for while it is disabled.
// Shared by the ward's 指示受け (TakeTable), the radiology's 指示受け・指示確認 (RadiologyTake) and the
// ○ of an order block (OrderSheet).

import { displayText } from "@/lib/display-text";
import type { ReactNode } from "react";

/** The words beside a disabled button that waits for the check. */
export const CHECK_FIRST = "確かめたにチェックすると受けられます";

/** The check with its whole label as the target. */
export function ConfirmCheck({ checked, onChange, disabled, children }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: ReactNode }) {
  return (
    <label className={`flex min-h-8 cursor-pointer items-center gap-2 rounded border px-2 py-1 select-none ${checked ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule hover:bg-tab"} ${disabled ? "cursor-default opacity-50" : ""}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 shrink-0 accent-ai" />
      <span>{children}</span>
    </label>
  );
}

/** The reason a button is disabled, beside it (nothing when it is not). */
export function Waits({ on, text = CHECK_FIRST }: { on: boolean; text?: string }) {
  return on ? <span className="text-[11px] font-bold text-yamabuki">{displayText(text)}</span> : null;
}

/** The button that waits for the check: plainly disabled (faint, no pointer) until it can be pressed. */
export const WAITING_BUTTON = "rounded bg-ai px-3 py-1 font-bold text-white disabled:cursor-not-allowed disabled:bg-rule disabled:text-ink-faint";

/** The ○ at the left of an order block: a 32px target, coloured when ticked. */
export function BlockCheck({ checked, disabled, title, label, onChange }: { checked: boolean; disabled?: boolean; title?: string; label: string; onChange: (v: boolean) => void }) {
  return (
    <label title={title} className={`flex h-8 w-8 items-center justify-center rounded ${disabled ? "cursor-default" : "cursor-pointer hover:bg-tab"} ${checked ? "bg-ai-soft" : ""}`}>
      <input type="checkbox" aria-label={label} className="h-4 w-4 accent-ai disabled:opacity-30" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
