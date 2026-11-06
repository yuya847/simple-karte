"use client";
import { useCallback, useState } from "react";

export function openedPanels<T extends string>(open: readonly T[], next: T | null, drawer: ReadonlySet<string>): T[] {
  if (next === null) return [];
  return [...open.filter((key) => key !== next && !drawer.has(key)), next];
}
/** パネルの選択と、開いたままのウインドウを分ける。患者切り替え時の null は全て閉じる。 */
export function usePanelWindows<T extends string>(drawer: ReadonlySet<string>) {
  const [state, setState] = useState<{ panel: T | null; open: T[]; activation: number }>({ panel: null, open: [], activation: 0 });
  const setPanel = useCallback((panel: T | null) => setState((s) => ({ panel, open: openedPanels(s.open, panel, drawer), activation: s.activation + 1 })), [drawer]);
  const close = useCallback((key: T) => setState((s) => ({ ...s, panel: s.panel === key ? null : s.panel, open: s.open.filter((k) => k !== key) })), []);
  return { ...state, setPanel, close };
}
