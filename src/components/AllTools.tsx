"use client";

// 全ツール（右の道具の上の「全ツール」）: every tool of this role by kind, with a search box (読みでも探せる).
// Pressing one opens it; dragging one onto the rail's tiles or the お気に入り column puts it there (a hidden one
// comes back). Hidden tools are faint with 隠し中.

import type { LucideIcon } from "lucide-react";
import { Search, Settings2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { PIN_DRAG } from "@/lib/rail";
import { toolMatches } from "@/lib/tool-search";
import { cssPx, viewH, viewW } from "@/lib/page-zoom";
import { usePressMenu } from "./PressMenu";
import type { CellAction } from "./FlowCellMenu";

export interface AllTool {
  pin: string;
  label: string;
  icon: LucideIcon;
  hidden: boolean;
  /** Why this person cannot use it (greyed and not opened; it can still be hidden or put back). */
  why?: string;
}

export interface AllToolGroup {
  key: string;
  title: string;
  tools: AllTool[];
}

const WIDTH = 288;

/** The list itself (drawn without a browser in the tests). */
export function AllToolsList({ groups, query, onOpen, onDragTool, menuFor }: { groups: AllToolGroup[]; query: string; onOpen: (pin: string) => void; onDragTool?: (pin: string | null) => void; menuFor?: (t: AllTool) => CellAction[] }) {
  const { bind, menu } = usePressMenu();
  const shown = groups.map((g) => ({ ...g, tools: g.tools.filter((t) => toolMatches(t.label, query)) })).filter((g) => g.tools.length > 0);
  return (
    <>
      {shown.length === 0 && <p className="px-2 py-3 text-center text-[12px] text-ink-faint">見つかりません</p>}
      {shown.map((g) => (
        <section key={g.key} aria-label={g.title} className="mb-1.5">
          <h3 className="px-1.5 pb-0.5 text-[11px] font-bold text-ink-faint">{g.title}</h3>
          <ul className="grid grid-cols-2 gap-0.5">
            {g.tools.map((t) => {
              const Icon = t.icon;
              const off = !!t.why;
              const press = menuFor ? bind(t.label, () => menuFor(t)) : null;
              return (
                <li key={t.pin}>
                  <button
                    type="button"
                    aria-disabled={off || undefined}
                    title={t.why ?? t.label}
                    data-tool={t.pin}
                    data-hidden={t.hidden || undefined}
                    {...press}
                    // A mouse drags it to the rail; a finger's long press is the menu (表示に戻す・★), as on the rail.
                    onPointerDown={(e) => {
                      e.currentTarget.draggable = e.pointerType === "mouse";
                      press?.onPointerDown(e);
                    }}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(PIN_DRAG, t.pin);
                      e.dataTransfer.effectAllowed = "copyMove";
                      onDragTool?.(t.pin);
                    }}
                    onDragEnd={() => onDragTool?.(null)}
                    onClick={() => !off && onOpen(t.pin)}
                    className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-[12px] ${off ? "cursor-not-allowed text-ink-faint/50" : `cursor-grab hover:bg-paper ${t.hidden ? "text-ink-faint" : "text-ink-soft hover:text-ink"}`}`}
                  >
                    <Icon size={15} strokeWidth={1.8} className={`shrink-0 ${t.hidden ? "opacity-50" : ""}`} />
                    <span className={`min-w-0 flex-1 truncate ${t.hidden ? "opacity-70" : ""}`}>{t.label}</span>
                    {t.hidden && <span className="shrink-0 rounded border border-rule px-1 text-[10px] leading-4 text-ink-faint">隠し中</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {menu}
    </>
  );
}

/**
 * The 全ツール window: next to the rail (to its left), so the rail stays in view as the place to drop on.
 * Esc or a press outside closes it.
 */
export function AllTools({ anchor, rail, groups, onOpen, onEdit, onClose, onDragTool, menuFor }: { anchor: RefObject<HTMLElement | null>; rail: RefObject<HTMLElement | null>; groups: AllToolGroup[]; onOpen: (pin: string) => void; onEdit: () => void; onClose: () => void; onDragTool?: (pin: string | null) => void; menuFor?: (t: AllTool) => CellAction[] }) {
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  useLayoutEffect(() => {
    const put = () => {
      const a = anchor.current?.getBoundingClientRect();
      const r = rail.current?.getBoundingClientRect();
      if (!a || !r) return;
      // In the page's CSS px (字の大きさ zooms the page; a rect is in screen px).
      const top = Math.max(8, cssPx(a.top));
      const left = Math.max(8, cssPx(r.left) - WIDTH - 6);
      setPos({ left, top, maxHeight: viewH() - top - 8 });
    };
    put();
    window.addEventListener("resize", put);
    return () => window.removeEventListener("resize", put);
  }, [anchor, rail]);
  useEffect(() => {
    search.current?.focus();
    const away = (e: PointerEvent) => {
      const t = e.target as Element;
      if (box.current?.contains(t) || anchor.current?.contains(t) || t.closest?.('[role="menu"]')) return;
      onClose();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector('[role="menu"]')) return;
      onClose();
      anchor.current?.focus();
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose, anchor]);
  if (typeof document === "undefined") return null;
  const first = groups.flatMap((g) => g.tools).find((t) => !t.why && toolMatches(t.label, query));
  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-label="全ツール"
      style={{ position: "fixed", zIndex: 1000, width: Math.min(WIDTH, viewW() - 16), ...(pos ?? { left: 8, top: 8 }), visibility: pos ? undefined : "hidden" }}
      className="flex flex-col overflow-hidden rounded-lg border border-rule bg-sheet shadow-[0_12px_32px_-8px_rgba(38,34,28,0.4)]"
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-rule-soft p-1.5">
        <label className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-rule bg-paper px-1.5">
          <Search size={13} className="shrink-0 text-ink-faint" />
          <input
            ref={search}
            type="search"
            aria-label="道具を探す"
            placeholder="道具を探す"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && first) onOpen(first.pin);
            }}
            className="min-w-0 flex-1 bg-transparent py-1 text-[12px]"
          />
        </label>
        <button type="button" onClick={onEdit} title="道具の配置を編集" aria-label="道具の配置を編集" className="rounded p-1 text-ink-faint hover:bg-paper hover:text-ink">
          <Settings2 size={14} />
        </button>
        <button type="button" onClick={onClose} aria-label="閉じる" className="rounded p-1 text-ink-faint hover:bg-paper hover:text-ink">
          <X size={14} />
        </button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-1.5">
        <AllToolsList groups={groups} query={query} onOpen={onOpen} onDragTool={onDragTool} menuFor={menuFor} />
      </div>
    </div>,
    document.body,
  );
}
