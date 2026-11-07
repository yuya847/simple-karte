"use client";
import { scenarioStorageKey } from "./scenarios/mode";
import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { PERSON_KEY, displayKey, readDisplay, readPerson, type DisplayState } from "./display-state";
import type { Role } from "./roles";
const get = (key: string) => { try { return sessionStorage.getItem(scenarioStorageKey(key)); } catch { return null; } };
const put = (key: string, value: unknown) => { try { sessionStorage.setItem(scenarioStorageKey(key), JSON.stringify(value)); } catch { /* This page still works without storage. */ } };
type Setters = { [K in keyof DisplayState]: Dispatch<SetStateAction<DisplayState[K]>> };
export function useDisplayState(role: Role, name: string, setRole: Dispatch<SetStateAction<Role>>, setName: Dispatch<SetStateAction<string>>, state: DisplayState, setters: Setters, ids: ReadonlySet<string>, ready: boolean, defaults: readonly string[], setNurseName?: Dispatch<SetStateAction<string>>) {
  const restored = useRef<Role | null>(null);
  const personReady = useRef(false);
  useEffect(() => {
    if (!ready) return;
    if (!personReady.current) {
      personReady.current = true;
      const person = readPerson(get(PERSON_KEY));
      setRole(person.role);
      if (person.role === "医師") setName(person.name);
      if (person.role === "看護師") setNurseName?.(person.name);
      if (person.role !== role || person.name !== name) return;
    }
    if (restored.current !== role) {
      restored.current = role;
      const next = readDisplay(get(displayKey(role)), role, ids, defaults);
      for (const key of Object.keys(next) as (keyof DisplayState)[]) (setters[key] as (v: DisplayState[typeof key]) => void)(next[key]);
      return;
    }
    put(PERSON_KEY, { role, name });
    put(displayKey(role), state);
  });
}
