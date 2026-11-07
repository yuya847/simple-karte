"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cssPx, viewH, viewW } from "@/lib/page-zoom";

export interface CellAction {
  label: string;
  onClick: () => void;
  /** Why it cannot be done by this person (shown instead of doing it). */
  disabled?: string | null;
}

/** The choices for a pressed cell of the flow sheet, at the pointer. Esc or a press outside closes it. */
export function FlowCellMenu({ at, title, actions, onClose }: { at: { x: number; y: number }; title: string; actions: CellAction[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc);
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  // `at` is where the pointer was (screen px); the menu is placed in the page's CSS px (字の大きさ zooms the page).
  const left = Math.min(cssPx(at.x), viewW() - 260);
  const top = Math.min(cssPx(at.y) + 4, viewH() - 48 * actions.length - 40);
  return createPortal(
    <div ref={ref} role="menu" aria-label={title} style={{ position: "fixed", left, top, zIndex: 1000 }} className="w-64 rounded-lg border border-rule bg-sheet p-1 text-[12px] shadow-[0_12px_32px_-8px_rgba(38,34,28,0.4)]">
      <div className="px-2 py-1 text-[11px] font-bold text-ink-soft">{title}</div>
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          role="menuitem"
          disabled={!!a.disabled}
          onClick={() => {
            onClose();
            a.onClick();
          }}
          className="block w-full rounded px-2 py-1.5 text-left hover:bg-paper disabled:text-ink-faint pointer-coarse:py-2.5"
        >
          {a.label}
          {a.disabled && <span className="block text-[10px] text-ink-faint">{a.disabled}</span>}
        </button>
      ))}
    </div>,
    document.body,
  );
}
