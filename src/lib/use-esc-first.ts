"use client";

// Esc on a menu opened over a window (Drawer): the window listens for Esc on `window` too and would close
// with the menu. While `open`, this takes Esc first (in the capture phase) and closes only the menu.

import { useEffect } from "react";

export function useEscFirst(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [open, close]);
}
