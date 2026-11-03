"use client";

import { Lock, X } from "lucide-react";
import { useEffect } from "react";

/** Panel that slides over the right side of the chart. The chart behind stays as it was. */
export function Drawer({ title, onClose, children, wide, locked }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; locked?: string | null }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label={title}
      className={`absolute inset-y-0 right-0 z-30 flex flex-col border-l border-rule bg-sheet shadow-[-8px_0_24px_-12px_rgba(38,34,28,0.35)] ${
        wide ? "w-[min(760px,100%)]" : "w-[min(560px,100%)]"
      }`}
    >
      <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
        <h2 className="font-bold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="閉じる" className="rounded p-1 text-ink-faint hover:bg-paper hover:text-ink">
          <X size={16} />
        </button>
      </div>
      {locked && (
        <p className="flex items-center gap-1.5 border-b border-rule bg-paper px-4 py-1.5 text-xs text-ink-soft">
          <Lock size={12} className="shrink-0" />
          見るだけです。{locked}
        </p>
      )}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4">
        {locked ? (
          <fieldset disabled className="m-0 min-w-0 border-0 p-0">
            {children}
          </fieldset>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
