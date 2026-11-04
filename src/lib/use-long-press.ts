"use client";

// 長押し: on a finger (iPad) there is no double-click, so a press held for `ms` does what a double-click does
// with a mouse. Moving the finger or letting go earlier cancels it. The handlers go on the element together
// with onDoubleClick.

import { useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export const LONG_PRESS_MS = 500;

export function useLongPress<T extends Element>(onLongPress: (() => void) | undefined, ms = LONG_PRESS_MS) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  useEffect(() => clear, []);
  if (!onLongPress) return {};
  return {
    onPointerDown: (e: ReactPointerEvent<T>) => {
      // A mouse double-clicks; only a finger or a pen long-presses.
      if (e.pointerType === "mouse") return;
      // A button inside (☆ etc.) does its own thing.
      if ((e.target as Element).closest("button")) return;
      clear();
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        clear();
        onLongPress();
      }, ms);
    },
    onPointerMove: (e: ReactPointerEvent<T>) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
  };
}
