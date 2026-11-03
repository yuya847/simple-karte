"use client";

import { Lock, NotebookPen, Pill, Syringe } from "lucide-react";

export type RightTab = "note" | "injection" | "rx";

const TABS: { key: RightTab; label: string; icon: typeof Pill }[] = [
  { key: "note", label: "記事作成", icon: NotebookPen },
  { key: "injection", label: "注射", icon: Syringe },
  { key: "rx", label: "内服", icon: Pill },
];

/** Tabs over the right side of the chart: write the note, or enter injections / oral drugs by Rp. */
export function RightTabs({ value, onChange, counts, locked }: { value: RightTab; onChange: (t: RightTab) => void; counts: Record<RightTab, number>; locked?: string }) {
  return (
    <div role="tablist" aria-label="右の欄" className="flex items-end gap-1 border-b border-rule bg-paper px-3 pt-1.5">
      {TABS.map(({ key, label, icon: Icon }) => {
        const on = value === key;
        const off = key !== "note" && !!locked;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={on}
            disabled={off}
            title={off ? locked : key === "note" ? "記事と、貯まっているオーダの下書き・確定" : `${label}を Rp ごとに入れる`}
            onClick={() => onChange(key)}
            className={`flex items-center gap-1.5 rounded-t-md border border-b-0 px-3 py-1.5 text-sm ${
              on ? "-mb-px border-rule bg-sheet font-bold text-ink" : "border-transparent text-ink-soft hover:text-ink disabled:text-ink-faint/60"
            }`}
          >
            {off ? <Lock size={13} /> : <Icon size={14} />}
            {label}
            {counts[key] > 0 && <span className="nums rounded-full bg-ai px-1.5 text-[10px] font-bold leading-4 text-white">{counts[key]}</span>}
          </button>
        );
      })}
    </div>
  );
}
