"use client";

// 右クリック・長押し（指）・ContextMenu キー／Shift+F10 で、押した位置に FlowCellMenu を出す（InjectionOrderMenu と同じ入り方）。
// One menu per list: `bind` goes on each row or card with that row's choices; `menu` is rendered once.

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { FlowCellMenu, type CellAction } from "./FlowCellMenu";

const HOLD_MS = 600;

export function usePressMenu() {
  const [open, setOpen] = useState<{ at: { x: number; y: number }; title: string; actions: CellAction[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  // A long press ends with the finger lifted: that click must not also open the row.
  const held = useRef(false);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);
  const close = useCallback(() => setOpen(null), []);
  const bind = (title: string, actions: () => CellAction[]) => {
    const show = (x: number, y: number) => setOpen({ at: { x, y }, title, actions: actions() });
    return {
      onContextMenu: (e: MouseEvent) => {
        // A menu of its own inside (a dose, an order) already took it.
        if (e.defaultPrevented) return;
        e.preventDefault();
        show(e.clientX, e.clientY);
      },
      onKeyDown: (e: KeyboardEvent) => {
        if (e.defaultPrevented || !(e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))) return;
        e.preventDefault();
        const r = (e.currentTarget as Element).getBoundingClientRect();
        show(r.left + 8, r.top + Math.min(r.height, 28));
      },
      onPointerDown: (e: PointerEvent) => {
        held.current = false;
        if (e.pointerType === "mouse") return;
        origin.current = { x: e.clientX, y: e.clientY };
        cancel();
        const { clientX, clientY } = e;
        timer.current = setTimeout(() => {
          held.current = true;
          show(clientX, clientY);
        }, HOLD_MS);
      },
      onPointerMove: (e: PointerEvent) => {
        if (timer.current && Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 10) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onClickCapture: (e: MouseEvent) => {
        if (!held.current) return;
        held.current = false;
        e.preventDefault();
        e.stopPropagation();
      },
    };
  };
  const menu = open ? <FlowCellMenu at={open.at} title={open.title} actions={open.actions} onClose={close} /> : null;
  return { bind, menu };
}
