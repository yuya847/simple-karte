"use client";

import { createContext, useContext, useEffect, useRef, useState, useMemo, useId } from "react";
import { AppWindow, X } from "lucide-react";
import { minimizeWindow, windowTray, trayTransform } from "@/lib/window-tray";

type Entry = { key: string; title: string; close: () => void };
function useTrayStore() {
  const scope = useId();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [minimized, setMinimized] = useState<string[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const actions = useMemo(() => ({
    register(entry: Entry) {
      setEntries((all) => [...all.filter((e) => e.key !== entry.key), entry]);
      setOrder((all) => [...all.filter((k) => k !== entry.key), entry.key]);
      return () => {
        setEntries((all) => all.filter((e) => e.key !== entry.key));
        setMinimized((all) => minimizeWindow(all, entry.key, false));
        setOrder((all) => all.filter((k) => k !== entry.key));
      };
    },
    hide(key: string) { setMinimized((all) => minimizeWindow(all, key, true)); },
    front(key: string) {
      setMinimized((all) => minimizeWindow(all, key, false));
      setOrder((all) => [...all.filter((k) => k !== key), key]);
    },
  }), []);
  return { scope, entries, items: windowTray(entries.map((e) => e.key), minimized, order), ...actions };
}
const Context = createContext<ReturnType<typeof useTrayStore> | null>(null);
export function PatientWindowProvider({ children, focusKey, focusVersion, focusTabs }: { children: React.ReactNode; focusKey?: string | null; focusVersion?: number; focusTabs?: readonly string[] }) {
  const store = useTrayStore();
  const front = store.front;
  useEffect(() => { if (focusKey) front(focusKey); }, [focusKey, focusVersion, front]);
  useEffect(() => { const tab = focusTabs?.at(-1); if (tab) front(`tab:${tab}`); }, [focusTabs, front]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useTrayWindow(key: string, title: string, open: boolean, close: () => void) {
  const store = useContext(Context);
  const callback = useRef(close);
  useEffect(() => { callback.current = close; });
  const register = store?.register;
  useEffect(() => {
    if (open) return register?.({ key, title, close: () => callback.current() });
  }, [key, title, open, register]);
  const item = store?.items.find((e) => e.key === key);
  return { frontmost: !store || store.items.filter((e) => !e.minimized).sort((a, b) => a.z - b.z).at(-1)?.key === key, minimized: item?.minimized ?? false, z: item?.z, minimize: async (event: React.MouseEvent<HTMLButtonElement>) => {
    const element = event.currentTarget.closest<HTMLElement>('[role="dialog"]');
    const group = store ? document.getElementById(`window-tray-${store.scope}`) : null;
    const destination = Array.from(group?.querySelectorAll<HTMLElement>("[data-tray-key]") ?? []).find(el => el.dataset.trayKey === key) ?? group;
    if (element && destination && !window.matchMedia("(prefers-reduced-motion: reduce)").matches && element.animate) {
      const from = element.getBoundingClientRect();
      const to = destination.getBoundingClientRect();
      const animation = element.animate([
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: trayTransform(from, to), opacity: 0 },
      ], { duration: 300, easing: "ease-in", fill: "forwards" });
      try { await animation.finished; } catch { return; }
      store?.hide(key);
      animation.cancel();
    } else store?.hide(key);
  }, front: () => store?.front(key) };
}
export function WindowTray() {
  const store = useContext(Context);
  if (!store?.entries.length) return null;
  return <div id={`window-tray-${store.scope}`} aria-label="しまったウインドウ" className="flex shrink-0 gap-1 overflow-x-auto border-b border-rule bg-paper px-3 py-1">
    {store.items.map((item) => {
      const entry = store.entries.find((e) => e.key === item.key)!;
      return <div key={item.key} data-tray-key={item.key} className={`flex shrink-0 items-center rounded border border-rule ${item.minimized ? "bg-sheet" : "bg-paper text-ink-soft"}`}>
        <button type="button" aria-label={`${entry.title}を${item.minimized ? "戻す" : "前面へ"}`} onClick={() => store.front(item.key)} className="flex items-center gap-1 px-2 py-1 text-xs"><AppWindow size={13} />{entry.title}</button>
        <button type="button" aria-label={`${entry.title}を閉じる`} onClick={entry.close} className="p-1"><X size={13} /></button>
      </div>;
    })}
  </div>;
}
