"use client";

import { useEffect, useRef } from "react";
import { WARD_TABS, wardTabInfo, type WardTab } from "@/lib/nav";
import { WARD_ICON } from "./nav-icons";

interface Props {
  /** The screens this role may open. */
  options: WardTab[];
  /** Already open as ② tabs. */
  open: WardTab[];
  /** Opened first when 病棟 is opened (checked), in the order checked. */
  defaults: WardTab[];
  badges: Partial<Record<WardTab, number>>;
  onOpen: (t: WardTab) => void;
  onToggleDefault: (t: WardTab) => void;
}

const GROUPS: { key: "patients" | "work"; title: string }[] = [
  { key: "patients", title: "患者を見る" },
  { key: "work", title: "病棟の仕事" },
];

/**
 * 病棟's menu: what to open as a tab (入院患者一覧・病棟マップ・受け持ち患者・最近開いた患者,
 * and the ward's work). A check marks the screens to open first whenever 病棟 is opened (既定).
 * Keyboard: Tab between the screens and their checks, Enter opens, Space checks.
 */
export function WardMenu({ options, open, defaults, badges, onOpen, onToggleDefault }: Props) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  const firstKey = WARD_TABS.find((t) => options.includes(t.key))?.key;
  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-paper">
      <div className="mx-auto max-w-4xl space-y-5 px-6 py-6 text-sm">
        <header>
          <h1 className="text-lg font-bold">病棟で開く画面を選ぶ</h1>
          <p className="hint mt-1 text-[12px] text-ink-soft">押すと上のタブに開きます。「最初に開く」にチェックした画面は、次から病棟を開いたときに最初から開きます（チェックした順に並び、1つ目を表示）。</p>
        </header>
        {GROUPS.map((g) => {
          const items = WARD_TABS.filter((t) => t.group === g.key && options.includes(t.key));
          if (!items.length) return null;
          return (
            <section key={g.key}>
              <h2 className="mb-2 font-bold text-ink-soft">{g.title}</h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((t) => {
                  const Icon = WARD_ICON[t.key];
                  const isOpen = open.includes(t.key);
                  const order = defaults.indexOf(t.key);
                  return (
                    <li key={t.key} className="flex flex-col rounded-lg border border-rule bg-sheet hover:border-ai">
                      <button ref={t.key === firstKey ? first : undefined} type="button" onClick={() => onOpen(t.key)} className="flex flex-1 items-start gap-3 rounded-t-lg px-3 py-2.5 text-left pointer-coarse:py-3.5">
                        <Icon size={20} className="mt-0.5 shrink-0 text-ai" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 font-bold">
                            {t.label}
                            {!!badges[t.key] && <span className="nums rounded-full bg-shu px-1.5 text-[10px] leading-4 text-white">{badges[t.key]}</span>}
                            {isOpen && <span className="ml-auto text-[11px] font-normal text-ink-faint">開いています</span>}
                          </span>
                          <span className="mt-0.5 block text-[12px] text-ink-soft">{t.hint}</span>
                        </span>
                      </button>
                      <label className="flex cursor-pointer items-center gap-2 border-t border-rule-soft px-3 py-1.5 text-[12px] text-ink-soft pointer-coarse:py-2.5">
                        <input type="checkbox" checked={order >= 0} onChange={() => onToggleDefault(t.key)} className="h-4 w-4 accent-ai" />
                        最初に開く
                        {order >= 0 && <span className="nums ml-auto text-[11px] text-ai">{order + 1}番目</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        <p className="text-[11px] text-ink-faint">
          「最初に開く」は職種ごとに、このブラウザに保存します（この端末のみに適用されます）。
          {defaults.length > 0 && <> いまの設定：{defaults.map((t) => wardTabInfo(t).label).join(" → ")}</>}
        </p>
      </div>
    </div>
  );
}
