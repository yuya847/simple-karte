"use client";

import { useEffect, useRef, useState } from "react";
import { contextualHelp, foregroundHelp, helpSections, searchHelp } from "@/lib/help";
import { HELP_EVENT } from "@/lib/help/events";

export function HelpPanel({ screen, panel }: { screen: string; panel?: string | null }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const open = (event: Event) => {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const requested = (event as CustomEvent<string | undefined>).detail;
      const foreground = foregroundHelp(
        Array.from(document.querySelectorAll<HTMLElement>("[data-help-section]")).map((element) => ({
          id: element.dataset.helpSection ?? "", z: Number(getComputedStyle(element).zIndex) || 0,
          visible: element.getClientRects().length > 0,
        })),
      );
      setSelected(requested && helpSections.some((s) => s.id === requested) ? requested : foreground ?? contextualHelp(screen, panel));
      setQuery("");
    };
    window.addEventListener(HELP_EVENT, open);
    return () => window.removeEventListener(HELP_EVENT, open);
  }, [screen, panel]);
  if (!selected) return null;
  return <HelpWindow selected={selected} query={query} onQuery={setQuery} onSelect={setSelected} onClose={() => { setSelected(null); opener.current?.focus(); }} />;
}

/** Controlled view: the same dialog serves top-row and department requests. */
export function HelpWindow({ selected, query, onQuery, onSelect, onClose }: {
  selected: string; query: string; onQuery: (query: string) => void;
  onSelect: (section: string) => void; onClose: () => void;
}) {
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => { search.current?.focus(); }, []);
  const results = searchHelp(query);
  const section = results.find((s) => s.id === selected) ?? results[0];
  const dismiss = onClose;
  return (
    <div className="fixed inset-0 z-[100] bg-ink/20 print:hidden" onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}>
    <aside role="dialog" aria-modal="true" aria-label="ヘルプ" className="fixed inset-y-0 right-0 z-[100] flex w-[min(960px,100vw)] flex-col border-l border-rule bg-sheet shadow-2xl print:hidden"
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.stopPropagation(); dismiss(); }
        if (e.key === "Tab") {
          const nodes = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button, input')).filter((n) => !n.hasAttribute("disabled"));
          const first = nodes[0], last = nodes[nodes.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }
      }}>
      <header className="flex items-center gap-4 border-b border-rule p-4">
        <h1 className="font-bold">ヘルプ</h1>
        <input ref={search} aria-label="ヘルプを検索" placeholder="ヘルプを検索" value={query} onChange={(e) => onQuery(e.target.value)} className="min-w-0 flex-1 rounded border border-rule px-3 py-2" />
        <button type="button" onClick={dismiss} className="rounded border border-rule px-3 py-2">閉じる</button>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="ヘルプの目次" className="w-2/5 overflow-y-auto border-r border-rule p-3">
          {results.map((s) => <button key={s.id} type="button" aria-current={s.id === section?.id ? "page" : undefined} onClick={() => onSelect(s.id)} className={`block w-full rounded px-2 py-2 text-left text-sm ${s.id === section?.id ? "bg-ai-soft font-bold text-ai" : "hover:bg-paper"}`}>{s.title}</button>)}
        </nav>
        <article key={section?.id} className="min-w-0 flex-1 overflow-y-auto p-5">
          {section ? <><h2 className="mb-4 text-lg font-bold">{section.title}</h2><ul className="list-disc space-y-3 pl-5 text-sm">{section.bullets.map((b) => <li key={b}>{b}</li>)}</ul>{section.related?.map((id) => <button key={id} type="button" onClick={() => onSelect(id)} className="mt-3 block text-sm text-ai underline">{helpSections.find((s) => s.id === id)?.title}</button>)}</> : <p role="status">一致するヘルプはありません。</p>}
        </article>
      </div>
    </aside>
    </div>
  );
}
