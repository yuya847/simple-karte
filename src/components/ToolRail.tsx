"use client";

import { Activity, Bandage, CalendarCheck, CalendarDays, CalendarRange, ClipboardList, FileHeart, FlaskConical, ListChecks, Pill, ReceiptJapaneseYen, ScanLine, Syringe, TestTube, HeartPulse, Radiation } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { LeftView } from "./HistoryPane";

export type PanelKind = "diagnoses" | "add-injection" | "add-rx" | "add-lab" | "add-imaging" | "add-physio" | "add-procedure" | "results" | "imaging" | "active-orders" | "billing";

interface Tool {
  key: PanelKind;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
}

const GROUPS: { title: string; tools: Tool[] }[] = [
  {
    title: "オーダ",
    tools: [
      { key: "diagnoses", label: "病名", icon: FileHeart },
      { key: "add-injection", label: "注射", icon: Syringe },
      { key: "add-lab", label: "検体検査", icon: TestTube },
      { key: "add-imaging", label: "画像検査", icon: Radiation },
      { key: "add-physio", label: "生理検査", icon: HeartPulse },
      { key: "add-rx", label: "処方", icon: Pill },
      { key: "add-procedure", label: "処置", icon: Bandage },
    ],
  },
  {
    title: "参照",
    tools: [
      { key: "results", label: "検査結果", icon: FlaskConical },
      { key: "imaging", label: "放射線画像", icon: ScanLine },
      { key: "active-orders", label: "有効オーダ", icon: ListChecks },
    ],
  },
  {
    title: "医事",
    tools: [{ key: "billing", label: "算定", icon: ReceiptJapaneseYen }],
  },
];

interface Props {
  open: PanelKind | null;
  onOpen: (p: PanelKind | null) => void;
  /** These replace the past record in the left pane, so they are switches, not panels. */
  leftView: LeftView;
  onLeftView: (v: LeftView) => void;
}

const LEFT_TOOLS: { key: LeftView; label: string; icon: LucideIcon }[] = [
  { key: "flowsheet", label: "経過表", icon: Activity },
  { key: "injection-cal", label: "注射カレンダー", icon: CalendarDays },
  { key: "rx-cal", label: "処方カレンダー", icon: CalendarRange },
  { key: "proc-cal", label: "処置カレンダー", icon: CalendarCheck },
];

/** Fixed column of tools on the far right: order types, then things to look at. */
export function ToolRail({ open, onOpen, leftView, onLeftView }: Props) {
  return (
    <aside aria-label="ツール" className="scroll-thin flex min-h-0 flex-col items-stretch gap-1 overflow-y-auto border-l border-rule bg-paper px-1 py-2">
      {GROUPS.map((g, gi) => (
        <div key={g.title} className={gi > 0 ? "mt-2 border-t border-rule pt-2" : ""}>
          <div className="mb-1 text-center text-[10px] text-ink-faint">{g.title}</div>
          {g.title === "参照" &&
            LEFT_TOOLS.map((t) => {
              const Icon = t.icon;
              const on = leftView === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  title={`${t.label}（左の欄に出します）`}
                  onClick={() => onLeftView(on ? "record" : t.key)}
                  aria-pressed={on}
                  className={`flex w-full flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[10px] leading-tight ${
                    on ? "bg-ai text-white" : "text-ink-soft hover:bg-sheet hover:text-ink"
                  }`}
                >
                  <Icon size={18} strokeWidth={1.8} />
                  {t.label}
                </button>
              );
            })}
          {g.tools.map((t) => {
            const Icon = t.icon;
            const active = open === t.key;
            return (
              <button
                key={t.key}
                type="button"
                disabled={t.disabled}
                title={t.disabled ? `${t.label}（この試作では未対応）` : t.label}
                onClick={() => !t.disabled && onOpen(active ? null : (t.key as PanelKind))}
                aria-pressed={active}
                className={`flex w-full flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[10px] leading-tight ${
                  t.disabled
                    ? "cursor-not-allowed text-ink-faint/50"
                    : active
                      ? "bg-ai text-white"
                      : "text-ink-soft hover:bg-sheet hover:text-ink"
                }`}
              >
                <Icon size={18} strokeWidth={1.8} />
                {t.label}
              </button>
            );
          })}
        </div>
      ))}
      <div className="mt-auto flex flex-col items-center text-ink-faint" title="キー操作：⌘K 患者を開く／Esc 小窓を閉じる">
        <ClipboardList size={14} />
      </div>
    </aside>
  );
}
