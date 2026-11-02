"use client";

import { Activity, Bandage, ClipboardList, FlaskConical, ListChecks, Pill, ScanLine, Syringe, TestTube } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type PanelKind = "add-injection" | "add-lab" | "results" | "imaging" | "active-orders";

interface Tool {
  key: PanelKind | "disabled-rx" | "disabled-proc";
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
}

const GROUPS: { title: string; tools: Tool[] }[] = [
  {
    title: "オーダ",
    tools: [
      { key: "add-injection", label: "注射", icon: Syringe },
      { key: "add-lab", label: "検体検査", icon: TestTube },
      { key: "disabled-rx", label: "処方", icon: Pill, disabled: true },
      { key: "disabled-proc", label: "処置", icon: Bandage, disabled: true },
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
];

interface Props {
  open: PanelKind | null;
  onOpen: (p: PanelKind | null) => void;
  /** The flow sheet replaces the past record in the left pane, so it is a switch, not a panel. */
  flowsheet: boolean;
  onToggleFlowsheet: () => void;
}

/** Fixed column of tools on the far right: order types, then things to look at. */
export function ToolRail({ open, onOpen, flowsheet, onToggleFlowsheet }: Props) {
  return (
    <aside aria-label="ツール" className="flex flex-col items-stretch gap-1 border-l border-rule bg-paper px-1 py-2">
      {GROUPS.map((g, gi) => (
        <div key={g.title} className={gi > 0 ? "mt-2 border-t border-rule pt-2" : ""}>
          <div className="mb-1 text-center text-[10px] text-ink-faint">{g.title}</div>
          {g.title === "参照" && (
            <button
              type="button"
              title="経過表（左の欄に出します）"
              onClick={onToggleFlowsheet}
              aria-pressed={flowsheet}
              className={`flex w-full flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[10px] leading-tight ${
                flowsheet ? "bg-ai text-white" : "text-ink-soft hover:bg-sheet hover:text-ink"
              }`}
            >
              <Activity size={18} strokeWidth={1.8} />
              経過表
            </button>
          )}
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
