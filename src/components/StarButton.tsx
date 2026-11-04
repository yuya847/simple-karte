"use client";

import { Star } from "lucide-react";

/** ☆ next to a patient's name: press to star or unstar (kept per person in this browser only). */
export function StarButton({ on, name, onToggle, size = 15, className = "" }: { on: boolean; name: string; onToggle: () => void; size?: number; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `${name}をお気に入りから外す` : `${name}をお気に入りに登録`}
      title={on ? "お気に入りから外す（この端末のみ）" : "お気に入りに登録（この端末のみ）"}
      onClick={(e) => {
        // The row opens the chart: the star must not.
        e.stopPropagation();
        onToggle();
      }}
      className={`inline-flex shrink-0 rounded p-0.5 ${on ? "text-yamabuki" : "text-ink-faint/60 hover:text-yamabuki"} ${className}`}
    >
      <Star size={size} fill={on ? "currentColor" : "none"} />
    </button>
  );
}
