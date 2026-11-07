"use client";
// The small menu of the record and of the drafts: at the pointer (right click) or under a 「…」 button (touch).

import { useEffect, useRef } from "react";
import { cssPx, viewH, viewW } from "@/lib/page-zoom";
import { createPortal } from "react-dom";
import type { Copy } from "lucide-react";

/** A small menu at the pointer (right click) or under the 「…」 button (touch). Esc or a press outside closes it. */
export function Menu({ at, onClose, items }: { at: { x: number; y: number }; onClose: () => void; items: { label: string; icon: typeof Copy; onClick: () => void; disabled?: string }[] }) {
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
  // Pointer positions are screen pixels; with the 字の大きさ zoom the menu is placed in CSS pixels.
  const left = Math.min(cssPx(at.x), viewW() - 230);
  const top = Math.min(cssPx(at.y), viewH() - 40 * items.length - 16);
  return createPortal(
    <div ref={ref} role="menu" style={{ position: "fixed", left, top, zIndex: 1000 }} className="w-56 rounded-lg border border-rule bg-sheet p-1 text-[13px] shadow-[0_12px_32px_-8px_rgba(38,34,28,0.4)]">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            disabled={!!it.disabled}
            title={it.disabled}
            onClick={() => {
              onClose();
              it.onClick();
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-paper disabled:text-ink-faint/60 pointer-coarse:py-2.5"
          >
            <Icon size={14} />
            {it.label}
            {it.disabled && <span className="ml-auto text-[10px]">—</span>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
