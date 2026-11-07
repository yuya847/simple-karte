"use client";

// 設定（右上、人の名前のメニューの左の歯車）：見た目・字の大きさ・右の道具。人ごとに、この端末だけに覚える。
// The button is always on the top row, so it is also what puts this person's look on the page.

import { LayoutGrid, List, Settings, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FONT_SIZES, THEMES, THEME_SWATCH, applyAppearance, rememberShown, type Appearance } from "@/lib/appearance";
import { useAppearance } from "@/lib/use-appearance";
import { useRail, type RailMode } from "@/lib/rail";
import { showAllTools } from "@/lib/tool-layout";
import { cssPx, viewW } from "@/lib/page-zoom";
import { useMe } from "./RoleContext";

/** The size of the "あ" on each 字の大きさ button (what 標準 looks like at 13px). */
const SAMPLE_PX: Record<string, number> = { sm: 11.5, md: 13, lg: 14.5, xl: 16 };

const choice = "relative flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-md border border-rule bg-sheet px-1 py-1.5 text-[12px] text-ink-soft hover:border-ai has-[:checked]:border-ai has-[:checked]:bg-ai-soft has-[:checked]:font-bold has-[:checked]:text-ai has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ai";

function Choices<K extends string>({ name, label, value, items, onChange }: { name: string; label: string; value: K; items: { key: K; label: string; sample: React.ReactNode }[]; onChange: (k: K) => void }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-[12px] font-bold text-ink-soft">{label}</legend>
      <div className="flex gap-1">
        {items.map((it) => (
          <label key={it.key} className={choice}>
            <input type="radio" name={name} value={it.key} checked={value === it.key} onChange={() => onChange(it.key)} className="sr-only" />
            {it.sample}
            <span>{it.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** What the 設定 window shows (drawn without a browser in the tests). */
export function SettingsPanel({ value, onChange, railMode, onRailMode, hiddenCount, onShowAll }: { value: Appearance; onChange: (v: Appearance) => void; railMode: RailMode; onRailMode: (m: RailMode) => void; hiddenCount: number; onShowAll: () => void }) {
  return (
    <div className="space-y-3">
      <Choices
        name="theme"
        label="見た目"
        value={value.theme}
        onChange={(theme) => onChange({ ...value, theme })}
        items={THEMES.map((t) => {
          const sw = THEME_SWATCH[t.key];
          return { key: t.key, label: t.label, sample: <span aria-hidden className="grid h-7 w-full place-items-center rounded border border-rule text-[13px] font-bold" style={{ background: sw.paper, color: sw.ink }}><span className="rounded-sm px-1.5" style={{ background: sw.sheet }}>あ</span></span> };
        })}
      />
      <Choices
        name="font"
        label="字の大きさ"
        value={value.font}
        onChange={(font) => onChange({ ...value, font })}
        items={FONT_SIZES.map((f) => ({ key: f.key, label: f.label, sample: <span aria-hidden className="grid h-7 place-items-center leading-none text-ink" style={{ fontSize: SAMPLE_PX[f.key] }}>あ</span> }))}
      />
      <div className="space-y-1.5">
        <Choices
          name="rail"
          label="右の道具"
          value={railMode}
          onChange={onRailMode}
          items={[
            { key: "icons", label: "アイコン", sample: <LayoutGrid aria-hidden size={16} /> },
            { key: "list", label: "名前の一覧", sample: <List aria-hidden size={16} /> },
          ]}
        />
        <button type="button" disabled={hiddenCount === 0} onClick={onShowAll} className="w-full rounded-md border border-rule bg-sheet px-2 py-1.5 text-[12px] text-ink-soft hover:border-ai hover:text-ai disabled:cursor-not-allowed disabled:opacity-50">
          隠した道具を全部戻す{hiddenCount > 0 && <span className="nums">（{hiddenCount}）</span>}
        </button>
      </div>
      <p className="text-[11px] text-ink-faint">この端末のみに適用されます</p>
    </div>
  );
}

/**
 * The gear on the top row and its window. It also puts this person's look on <html> (and again after React resets
 * <html> in development) and keeps it as the look for the next page load.
 */
export function SettingsButton({ className }: { className: string }) {
  const me = useMe();
  const [look, setLook] = useAppearance(me.name);
  const [rail, putRail] = useRail(me.name);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  useLayoutEffect(() => {
    applyAppearance(look);
    rememberShown(look);
  }, [look]);
  // Under the button, kept on screen; placed again when the zoom (字の大きさ) or the window changes.
  useLayoutEffect(() => {
    if (!open) return;
    const put = () => {
      const r = btn.current?.getBoundingClientRect();
      if (r) setPos({ top: cssPx(r.bottom) + 4, right: Math.max(8, viewW() - cssPx(r.right)) });
    };
    put();
    window.addEventListener("resize", put);
    return () => window.removeEventListener("resize", put);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btn.current?.focus();
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  const hiddenCount = rail.layout?.hidden.length ?? 0;
  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open} aria-label="設定" title="設定" className={className}>
        <Settings size={16} />
        <span className="hidden lg:inline">設定</span>
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div ref={box} role="dialog" aria-label="設定" style={{ position: "fixed", zIndex: 1000, width: 300, maxHeight: `calc(100vh / var(--page-zoom, 1) - ${(pos?.top ?? 0) + 8}px)`, top: pos?.top ?? 0, right: pos?.right ?? 8, visibility: pos ? undefined : "hidden" }} className="scroll-thin overflow-y-auto rounded-lg border border-rule bg-sheet p-3 shadow-[0_12px_32px_-8px_rgba(38,34,28,0.4)]">
            <div className="mb-2 flex items-center">
              <h2 className="text-sm font-bold">設定</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="閉じる" className="ml-auto rounded p-0.5 text-ink-faint hover:bg-paper hover:text-ink pointer-coarse:p-1.5">
                <X size={16} />
              </button>
            </div>
            <SettingsPanel value={look} onChange={setLook} railMode={rail.mode} onRailMode={(mode) => putRail({ ...rail, mode })} hiddenCount={hiddenCount} onShowAll={() => putRail({ ...rail, layout: showAllTools(rail.layout) })} />
          </div>,
          document.body,
        )}
    </>
  );
}
