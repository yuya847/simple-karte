"use client";

import { CalendarDays, NotebookPen, PictureInPicture2, Pill, Syringe, X } from "lucide-react";
import { useEffect } from "react";

export type RightTab = "note" | "injection" | "rx" | "injcal";

export const RIGHT_TABS: Record<RightTab, { label: string; icon: typeof Pill; key: string }> = {
  note: { label: "記事作成", icon: NotebookPen, key: "1" },
  injection: { label: "注射", icon: Syringe, key: "2" },
  rx: { label: "内服", icon: Pill, key: "3" },
  injcal: { label: "注射カレンダー", icon: CalendarDays, key: "4" },
};
const BY_DIGIT: Record<string, RightTab> = { Digit1: "note", Digit2: "injection", Digit3: "rx", Digit4: "injcal" };

/**
 * Tabs over the right side of the chart. 記事作成 is always there; 注射・内服・注射カレンダー open
 * from the tools on the far right and close with ×. Any tab can be shown in its own window (別ウインドウ).
 */
export function RightTabs({
  open,
  value,
  floating,
  onChange,
  onOpen,
  onClose,
  onFloat,
  counts,
  canOrder,
}: {
  open: RightTab[];
  value: RightTab;
  /** Tabs shown in their own window. */
  floating: RightTab[];
  onChange: (t: RightTab) => void;
  onOpen: (t: RightTab) => void;
  onClose: (t: RightTab) => void;
  onFloat: (t: RightTab) => void;
  counts: Partial<Record<RightTab, number>>;
  canOrder: boolean;
}) {
  const shown: RightTab[] = ["note", ...open.filter((t) => t !== "note")];
  // ⌥1 記事作成・⌥2 注射・⌥3 内服・⌥4 注射カレンダー (Alt on Windows), from anywhere in the chart.
  // e.code, so the characters ⌥ types on a Mac do not matter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.altKey && !e.metaKey && !e.ctrlKey ? BY_DIGIT[e.code] : undefined;
      if (!t || ((t === "injection" || t === "rx") && !canOrder)) return;
      e.preventDefault();
      if (t === "note") onChange(t);
      else onOpen(t);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChange, onOpen, canOrder]);

  return (
    <div role="tablist" aria-label="右の欄" className="scroll-thin flex items-end gap-1 overflow-x-auto border-b border-rule bg-paper px-2 pt-1.5">
      {shown.map((key) => {
        const { label, icon: Icon } = RIGHT_TABS[key];
        const away = floating.includes(key);
        const on = value === key && !away;
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
            title={`${away ? "別ウインドウで表示中（押すと前に出す）" : key === "note" ? "記事と、貯まっているオーダの下書き・確定" : label}（⌥${RIGHT_TABS[key].key}）`}
            className={`flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-t-md border border-b-0 px-2.5 py-1.5 text-sm pointer-coarse:px-3 pointer-coarse:py-2.5 ${
              on ? "-mb-px border-rule bg-sheet font-bold text-ink" : away ? "border-dashed border-rule text-ink-faint" : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            <Icon size={14} />
            {label}
            {!!counts[key] && <span className="nums rounded-full bg-ai px-1.5 text-[10px] font-bold leading-4 text-white">{counts[key]}</span>}
            {!away && (
              <button
                type="button"
                aria-label={`${label}を別ウインドウで表示`}
                title="別ウインドウで表示（動かせて、右の欄と並べて見られる）"
                onClick={(e) => {
                  e.stopPropagation();
                  onFloat(key);
                }}
                className="rounded p-0.5 text-ink-faint hover:bg-paper hover:text-ink pointer-coarse:p-1.5"
              >
                <PictureInPicture2 size={13} />
              </button>
            )}
            {key !== "note" && (
              <button
                type="button"
                aria-label={`${label}のタブを閉じる`}
                title="閉じる（入れかけの Rp は消えます）"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(key);
                }}
                className="-mr-1 rounded p-0.5 text-ink-faint hover:bg-paper hover:text-ink pointer-coarse:p-1.5"
              >
                <X size={13} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
