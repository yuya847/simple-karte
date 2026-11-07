"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { isoDate, todayInTokyo } from './dates';
import { scenarioStorageKey } from './scenarios/mode';
import { workspaceOn } from './workspace';
import type { TeamDesk } from './teams';

export function readTeamSnapshot(raw: string | null, day: string): TeamDesk | null {
  try {
    const saved = JSON.parse(raw ?? 'null');
    return saved?.day === day && Array.isArray(saved.desk?.requests) && Array.isArray(saved.desk?.rounds) ? saved.desk as TeamDesk : null;
  } catch { return null; }
}

/** Shared workspaces remain authoritative; keep local rounds on reload in a standalone demo. */
export function useTeamPersistence(desk: TeamDesk, setDesk: Dispatch<SetStateAction<TeamDesk>>) {
  const skip = useRef(true);
  const initial = useRef(setDesk);
  const day = isoDate(todayInTokyo());
  const key = scenarioStorageKey('simple-karte:teams');
  useEffect(() => {
    if (workspaceOn()) return;
    skip.current = true;
    try {
      const saved = readTeamSnapshot(localStorage.getItem(key), day);
      if (saved) initial.current(saved);
    } catch { /* Keep the current session usable when local storage is unavailable. */ }
  }, [day, key]);
  useEffect(() => {
    if (workspaceOn()) return;
    if (skip.current) { skip.current = false; return; }
    try { localStorage.setItem(key, JSON.stringify({ day, desk })); }
    catch { /* Keep the current session usable when local storage is unavailable. */ }
  }, [desk, day, key]);
}
