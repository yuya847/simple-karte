"use client";

// Small parts shared by the department screens (地域医療連携・レセプト・統計・外来の受付): the screen's own
// tabs, saving a file, and a sheet that only exists while printing.

import { displayText } from "@/lib/display-text";
import { useState, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import type { Icon } from "./nav-icons";

export interface SubTab<K extends string> {
  key: K;
  label: string;
  icon?: Icon;
  badge?: number;
}

/** The tabs inside one screen (not the top row). */
export function SubTabs<K extends string>({ label, tabs, value, onChange }: { label: string; tabs: SubTab<K>[]; value: K; onChange: (k: K) => void }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap rounded-md border border-rule bg-paper p-0.5 text-sm">
      {tabs.map(({ key, label: l, icon: I, badge }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={`flex items-center gap-1 rounded px-2.5 py-0.5 pointer-coarse:py-1.5 ${value === key ? "bg-ink font-bold text-white" : "text-ink-soft hover:text-ink"}`}
        >
          {I && <I size={14} />}
          {l}
          {!!badge && <span className={`nums rounded-full px-1.5 text-[11px] ${value === key ? "bg-white/25" : "bg-ai-soft text-ai"}`}>{badge}</span>}
        </button>
      ))}
    </div>
  );
}

/** Save text (CSV etc.) or bytes as a file in the browser. */
export function saveFile(name: string, data: string | Uint8Array, type = "text/csv;charset=utf-8") {
  const blob = new Blob([typeof data === "string" ? data : new Uint8Array(data)], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Printing: `print(node)` puts the node on the page only while the print dialog is open (the app itself
 * is hidden when printing), so one screen can print different sheets.
 */
export function usePrintSheet(): [(node: ReactNode, opts?: { portrait?: boolean }) => void, ReactNode] {
  const [sheet, setSheet] = useState<{ node: ReactNode; portrait: boolean } | null>(null);
  const print = (node: ReactNode, opts?: { portrait?: boolean }) => {
    flushSync(() => setSheet({ node, portrait: !!opts?.portrait }));
    const done = () => {
      setSheet(null);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };
  const portal = sheet ? createPortal(<div className={`${sheet.portrait ? "print-consent" : "print-sheet"} hidden bg-white text-[10pt] text-ink print:block`}>{sheet.node}</div>, document.body) : null;
  return [print, portal];
}

/** The 架空 mark beside a title. */
export function Fictional({ text = "" }: { text?: string }) {
  if (!text) return null;
  return <span className="ml-1 rounded border border-dashed border-ink-faint px-1.5 py-0.5 align-middle text-[10px] font-normal text-ink-soft">{displayText(text)}</span>;
}

/** Sources (name and URL). Shown only with 「使い方」 (class "hint"). */
export function Sources(props: { items: { label: string; url: string }[] }) {
  void props;
  return (
    null
  );
}

/* Help migration source (references and dynamic wording):
<ul >
      {items.map((s) => (
        <li key={s.url + s.label}>
          出典：{s.label}{" "}
          <a href={s.url} target="_blank" rel="noreferrer" >
            {s.url}
          </a>
        </li>
      ))}
    </ul>
*/
