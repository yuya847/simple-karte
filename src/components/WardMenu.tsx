"use client";

import { useEffect, useRef } from "react";
import { WARD_TABS, type WardTab } from "@/lib/nav";
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
                          <span className="mt-0.5 block truncate text-[12px] text-ink-soft">{t.hint.split(/[。：（(]/)[0]}</span>
                        </span>
                      </button>

                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        <details><summary className="cursor-pointer text-ink-soft">最初に開く画面の設定</summary>
          <div className="mt-2 flex flex-wrap gap-3">{WARD_TABS.filter(t => options.includes(t.key)).map(t => <label key={t.key} className="flex items-center gap-1"><input type="checkbox" checked={defaults.includes(t.key)} onChange={() => onToggleDefault(t.key)} className="accent-ai" />{t.label}</label>)}</div>
        </details>
      </div>
    </div>
  );
}

/* Help migration source (references and dynamic wording):
<p >押すと上のタブに開きます。「最初に開く」にチェックした画面は、次から病棟を開いたときに最初から開きます（チェックした順に並び、1つ目を表示）。</p>
*/
