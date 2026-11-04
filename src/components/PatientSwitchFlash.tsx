"use client";

import { useEffect } from "react";

/** "5階東 508"; just "外来" when the ward and the room are the same word (outpatients, 救急外来). */
export function placeLabel(ward: string | undefined, room: string): string {
  return ward && ward !== room ? `${ward} ${room}` : room;
}

const FLASH_MS = 1600;
const TAB_SELECTOR = '[role="tablist"][aria-label="開いているカルテ"] [aria-selected="true"]';

/**
 * 取違い防止: when the chart's patient changes, the name on the chart's tab pulses for a moment (a ring and a
 * slight grow, CSS `karte-tab-flash`). Nothing covers the chart, so it never gets in the way (ユーザー: デバッグの邪魔).
 * Renders nothing itself; it only tags the selected chart tab for FLASH_MS.
 */
export function PatientSwitchFlash({ patient }: { patient: { id: string } }) {
  const { id } = patient;
  useEffect(() => {
    const tab = document.querySelector<HTMLElement>(TAB_SELECTOR);
    if (!tab) return;
    tab.classList.remove("karte-tab-flash");
    // Restart the animation even when the same element is tagged again.
    void tab.offsetWidth;
    tab.classList.add("karte-tab-flash");
    const t = setTimeout(() => tab.classList.remove("karte-tab-flash"), FLASH_MS);
    return () => {
      clearTimeout(t);
      tab.classList.remove("karte-tab-flash");
    };
  }, [id]);
  return null;
}
