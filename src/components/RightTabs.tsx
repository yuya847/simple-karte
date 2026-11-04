"use client";

import { Activity, ArrowRightLeft, Bandage, CalendarCheck, CalendarDays, ClipboardList, NotebookPen, PictureInPicture2, Pill, PillBottle, Syringe, X } from "lucide-react";
import { useEffect } from "react";

export type RightTab = "note" | "injection" | "rx" | "injcal" | "flowsheet" | "rxcal" | "proccal" | "dietcal" | "standingcal" | "bookings";

export const RIGHT_TABS: Record<RightTab, { label: string; icon: typeof Pill; key: string; title?: string }> = {
  note: { label: "記事作成", icon: NotebookPen, key: "1" },
  injection: { label: "注射", icon: Syringe, key: "2" },
  rx: { label: "内服", icon: Pill, key: "3" },
  injcal: { label: "注射カレンダー", icon: CalendarDays, key: "4" },
  flowsheet: { label: "経過表", icon: Activity, key: "5", title: "経過表（温度板）：バイタル・検査値・注射・食事・水分出納を日ごとに" },
  rxcal: { label: "内服カレンダー", icon: PillBottle, key: "6", title: "内服カレンダー：処方の行ごとに、続く期間を帯で" },
  proccal: { label: "処置カレンダー", icon: Bandage, key: "7", title: "処置カレンダー：処置の行ごとに、実施の予定と済みを" },
  dietcal: { label: "移動・食事", icon: ArrowRightLeft, key: "8", title: "移動・食事カレンダー（日付を押すと転床・転棟・転科・退院を予約）" },
  standingcal: { label: "指示簿", icon: ClipboardList, key: "9", title: "指示簿カレンダー（指示の行ごとに、続く期間を帯で）" },
  bookings: { label: "予約", icon: CalendarCheck, key: "0", title: "予約の一覧（検査・透析・リハビリ・手術・外来予約など）" },
};
const BY_DIGIT: Record<string, RightTab> = { Digit1: "note", Digit2: "injection", Digit3: "rx", Digit4: "injcal", Digit5: "flowsheet", Digit6: "rxcal", Digit7: "proccal", Digit8: "dietcal", Digit9: "standingcal", Digit0: "bookings" };

/** The reading tabs: they open from the tools on the far right (参照), in their own large window first, and close with ×. */
export const REF_TABS = ["flowsheet", "rxcal", "proccal", "dietcal", "standingcal", "bookings"] as const;
export type RefTab = (typeof REF_TABS)[number];
export const isRefTab = (t: string): t is RefTab => (REF_TABS as readonly string[]).includes(t);
/** Tabs that open in a large window of their own (where this browser last had it), not in the right column. */
export const WINDOW_TABS: ReadonlySet<RightTab> = new Set<RightTab>(["injcal", ...REF_TABS]);
/** Tabs that are not always there: opened from the tools and closed with ×. */
const CLOSABLE: ReadonlySet<RightTab> = WINDOW_TABS;

/**
 * Tabs over the right side of the chart. 記事作成・注射・内服 are always there; 注射カレンダー and the reading
 * tabs (経過表・内服・処置・移動・食事・指示簿・予約) open from the tools on the far right and close with ×.
 * Any tab can be shown in its own window (別ウインドウ).
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
  // 記事作成・注射・内服 are always there (the only place to enter 注射 and 内服); the others open from
  // the tools on the far right and close with ×.
  const shown: RightTab[] = ["note", "injection", "rx", ...open.filter((t) => CLOSABLE.has(t))];
  // ⌥1 記事作成・⌥2 注射・⌥3 内服・⌥4 注射カレンダー・⌥5〜⌥0 the reading tabs (Alt on Windows), from anywhere
  // in the chart. e.code, so the characters ⌥ types on a Mac do not matter.
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
            title={`${away ? "別ウインドウで表示中（押すと前に出す）" : key === "note" ? "記事と、貯まっているオーダの下書き・確定" : RIGHT_TABS[key].title ?? label}（⌥${RIGHT_TABS[key].key}）`}
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
            {CLOSABLE.has(key) && (
              <button
                type="button"
                aria-label={`${label}のタブを閉じる`}
                title={key === "injcal" ? "閉じる（入れかけの Rp は消えます）" : "閉じる（右端のツールの「参照」からまた開けます）"}
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
