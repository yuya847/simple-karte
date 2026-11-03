"use client";

import { NotebookPen, Pill, Syringe, X } from "lucide-react";

export type RightTab = "note" | "injection" | "rx";

const TABS: Record<RightTab, { label: string; icon: typeof Pill }> = {
  note: { label: "記事作成", icon: NotebookPen },
  injection: { label: "注射", icon: Syringe },
  rx: { label: "内服", icon: Pill },
};

/**
 * Tabs over the right side of the chart. 記事作成 is always there; 注射 and 内服 open from the tools
 * on the far right and close with ×.
 */
export function RightTabs({ open, value, onChange, onClose, counts }: { open: RightTab[]; value: RightTab; onChange: (t: RightTab) => void; onClose: (t: RightTab) => void; counts: Record<RightTab, number> }) {
  const shown: RightTab[] = ["note", ...open.filter((t) => t !== "note")];
  return (
    <div role="tablist" aria-label="右の欄" className="flex items-end gap-1 border-b border-rule bg-paper px-3 pt-1.5">
      {shown.map((key) => {
        const { label, icon: Icon } = TABS[key];
        const on = value === key;
        return (
          <div
            key={key}
            role="tab"
            aria-selected={on}
            tabIndex={0}
            onClick={() => onChange(key)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onChange(key);
            }}
            title={key === "note" ? "記事と、貯まっているオーダの下書き・確定" : `${label}を Rp ごとに入れる`}
            className={`flex cursor-pointer items-center gap-1.5 rounded-t-md border border-b-0 px-3 py-1.5 text-sm ${on ? "-mb-px border-rule bg-sheet font-bold text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}
          >
            <Icon size={14} />
            {label}
            {counts[key] > 0 && <span className="nums rounded-full bg-ai px-1.5 text-[10px] font-bold leading-4 text-white">{counts[key]}</span>}
            {key !== "note" && (
              <button
                type="button"
                aria-label={`${label}のタブを閉じる`}
                title="閉じる（入れかけの Rp は消えます）"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(key);
                }}
                className="-mr-1 rounded p-0.5 text-ink-faint hover:bg-paper hover:text-ink"
              >
                <X size={13} />
              </button>
            )}
          </div>
        );
      })}
      {open.length === 0 && <span className="pb-1.5 pl-2 text-[11px] text-ink-faint">注射・内服は右端のツールから開きます</span>}
    </div>
  );
}
