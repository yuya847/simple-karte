"use client";
// 囲んで選ぶ: pressing the mouse where there is no card and moving it draws a faint blue box, and the cards it touches
// are chosen (⌘/Ctrl/Shift held: added to those chosen before). ⌘/Ctrl/Shift + click on a card adds or takes off
// that one; a click where there is no card, or Esc, clears the choice. A finger (iPad) draws no box.
// The cards carry data-pick="key"; the box is drawn inside the scrolling element, which needs `relative`.

import { useEffect, useRef, useState, type RefObject } from "react";
import { boxFrom, boxSelection, edgeScroll, hitKeys, movedFrom, sameKeys, toggleKey, type Box } from "@/lib/record-select";

/** Where a press must not start a box: inside a card, or on a control. */
const NOT_HERE = "[data-pick], button, a, input, textarea, select, label, summary, [contenteditable='true'], [role='menu'], [role='dialog']";

export function useMarquee(scroller: RefObject<HTMLElement | null>, selected: string[], onSelect: (keys: string[]) => void) {
  const [box, setBox] = useState<Box | null>(null);
  const pointer = useRef("mouse");
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  // Esc clears the choice (not while a menu or a small box of its own is open: Esc closes that first).
  const has = selected.length > 0;
  useEffect(() => {
    if (!has) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("[role='menu'], [data-pick-popover]")) return;
      onSelect([]);
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [has, onSelect]);

  const local = (el: HTMLElement, x: number, y: number) => {
    const r = el.getBoundingClientRect();
    return { x: x - r.left - el.clientLeft + el.scrollLeft, y: y - r.top - el.clientTop + el.scrollTop };
  };
  const cards = (el: HTMLElement) =>
    [...el.querySelectorAll<HTMLElement>("[data-pick]")].map((c) => {
      const r = c.getBoundingClientRect();
      const a = local(el, r.left, r.top);
      return { key: c.dataset.pick!, box: { left: a.x, top: a.y, right: a.x + r.width, bottom: a.y + r.height } };
    });

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      pointer.current = e.pointerType;
    },
    onMouseDown: (e: React.MouseEvent) => {
      const el = scroller.current;
      if (!el || e.button !== 0 || pointer.current !== "mouse" || (e.target as Element).closest(NOT_HERE)) return;
      // A press here does not start selecting text, and a text chosen before is let go.
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      const add = e.metaKey || e.ctrlKey || e.shiftKey;
      const before = add ? selected : [];
      const from = { x: e.clientX, y: e.clientY };
      const start = local(el, from.x, from.y);
      let at = from;
      let drawing = false;
      let frame = 0;
      let last = selected;
      const draw = () => {
        const b = boxFrom(start, local(el, at.x, at.y));
        setBox(b);
        const next = boxSelection(before, hitKeys(b, cards(el)), add);
        if (!sameKeys(next, last)) {
          last = next;
          onSelect(next);
        }
      };
      // At the top or bottom edge (or past it) the list scrolls on, and the box grows with it.
      const tick = () => {
        const r = el.getBoundingClientRect();
        const d = edgeScroll(at.y, r.top, r.bottom);
        if (d) {
          const was = el.scrollTop;
          el.scrollTop += d;
          if (el.scrollTop !== was) draw();
        }
        frame = requestAnimationFrame(tick);
      };
      const move = (ev: MouseEvent) => {
        at = { x: ev.clientX, y: ev.clientY };
        if (!drawing) {
          if (!movedFrom(from, at)) return;
          drawing = true;
          frame = requestAnimationFrame(tick);
        }
        draw();
      };
      const end = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        cancelAnimationFrame(frame);
        stop.current = null;
      };
      const up = () => {
        end();
        if (drawing) setBox(null);
        else if (!add && selected.length) onSelect([]);
      };
      stop.current = end;
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    // ⌘/Ctrl/Shift + click on a card: that card is added or taken off (a button in it does not act).
    onMouseDownCapture: (e: React.MouseEvent) => {
      if ((e.metaKey || e.ctrlKey || e.shiftKey) && e.button === 0 && pointer.current === "mouse" && (e.target as Element).closest("[data-pick]")) e.preventDefault();
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (!(e.metaKey || e.ctrlKey || e.shiftKey) || pointer.current !== "mouse") return;
      const card = (e.target as Element).closest<HTMLElement>("[data-pick]");
      if (!card || !scroller.current?.contains(card)) return;
      e.preventDefault();
      e.stopPropagation();
      onSelect(toggleKey(selected, card.dataset.pick!));
    },
  };
  const view = box && (
    <div
      aria-hidden
      data-marquee
      className="pointer-events-none absolute z-20 rounded-sm border border-ai/60 bg-ai/10"
      style={{ left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top }}
    />
  );
  return { handlers, view };
}
