"use client";

import { createContext, useContext, useEffect, useState, type Dispatch, type SetStateAction } from "react";

/** 入れかけの入力。確定用の Draft とは別に、患者・職種ごとに workspace に保存する。 */
export type WindowEntries = Record<string, unknown>;
export const WindowEntryContext = createContext<{ scope: string; entries: WindowEntries; setEntries: Dispatch<SetStateAction<WindowEntries>> } | null>(null);

export const entryKey = (scope: string, field: string) => JSON.stringify([scope, field]);

export function useWindowEntry<T>(field: string, initial: T | (() => T), scope?: string): [T, Dispatch<SetStateAction<T>>, () => void] {
  const context = useContext(WindowEntryContext);
  const key = entryKey(scope ?? context?.scope ?? "", field);
  const read = (): T => context && key in context.entries ? context.entries[key] as T : typeof initial === "function" ? (initial as () => T)() : initial;
  const fresh = () => { const value = read(); return { key, value, source: context?.entries[key], published: value, cleared: false }; };
  const [stored, setStored] = useState(fresh);
  // A scope change must never write the previous patient's input under the new key.
  const source = context?.entries[key];
  const loaded = stored.key !== key ? fresh()
    : !Object.is(stored.source, source) ? { ...stored, source, value: source === undefined || Object.is(source, stored.published) ? stored.value : source as T }
    : stored;
  // The effect publishes this render's value. Remember it before a provider echo arrives.
  const current = Object.is(loaded.published, loaded.value) ? loaded : { ...loaded, published: loaded.value };
  if (current !== stored) setStored(current);
  const value = current.value;
  const setValue: Dispatch<SetStateAction<T>> = (next) => setStored((previous) => {
    const base = previous.key === key ? previous.value : read();
    return { key, value: typeof next === "function" ? (next as (v: T) => T)(base) : next, source: previous.source, published: previous.published, cleared: false };
  });
  const setEntries = context?.setEntries;
  useEffect(() => {
    if (current.cleared) return;
    setEntries?.((all) => Object.is(all[key], value) ? all : { ...all, [key]: value });
  }, [key, value, setEntries, current.cleared]);
  const clear = () => {
    setStored({ key, value, source: undefined, published: value, cleared: true });
    setEntries?.((all) => { const next = { ...all }; delete next[key]; return next; });
  };
  return [value, setValue, clear];
}
