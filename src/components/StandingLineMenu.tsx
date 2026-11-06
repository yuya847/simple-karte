"use client";
import { STANDING_MENU, standingMenuEnabled } from "@/lib/standing-menu";
import type { StandingLine } from "@/lib/standing-lines";
export function StandingLineMenu({ line, canOrder, canAdd, onAction }: { line: StandingLine; canOrder: boolean; canAdd: boolean; onAction: (index: number) => void }) {
  const enabled = standingMenuEnabled(line, canOrder);
  return <div role="menu" aria-label="指示の操作" className="flex w-52 flex-col rounded border border-rule bg-sheet p-1 text-[12px] shadow-lg" onKeyDown={e => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(i + (e.key === "ArrowDown" ? 1 : buttons.length - 1) + buttons.length) % buttons.length]?.focus();
  }}>
    {STANDING_MENU.map((label, i) => <button autoFocus={i === (enabled[0] ? 0 : 4)} role="menuitem" type="button" key={label} disabled={!enabled[i] || ((i === 2 || i === 3) && !canAdd)} className="rounded px-3 py-2 text-left hover:bg-ai-soft disabled:opacity-40" onClick={() => onAction(i)}>{label}</button>)}
  </div>;
}
