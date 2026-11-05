"use client";

import { createContext, useContext, useEffect, useState, type Dispatch, type SetStateAction } from "react";

/** 入れかけの入力。確定用の Draft とは別に、患者・職種ごとに workspace に保存する。 */
export type WindowEntries = Record<string, unknown>;
export const WindowEntryContext = createContext<{ scope: string; entries: WindowEntries; setEntries: Dispatch<SetStateAction<WindowEntries>> } | null>(null);

export const entryKey = (scope: string, field: string) => JSON.stringify([scope, field]);

export function useWindowEntry<T>(field: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>, () => void] {
  const context = useContext(WindowEntryContext);
  const key = entryKey(context?.scope ?? "", field);
  const [value, setValue] = useState<T>(() => context && key in context.entries ? context.entries[key] as T : typeof initial === "function" ? (initial as () => T)() : initial);
  const setEntries = context?.setEntries;
  useEffect(() => {
    setEntries?.((all) => Object.is(all[key], value) ? all : { ...all, [key]: value });
  }, [key, value, setEntries]);
  const clear = () => setEntries?.((all) => { const next = { ...all }; delete next[key]; return next; });
  return [value, setValue, clear];
}
