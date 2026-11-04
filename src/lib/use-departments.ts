"use client";

// The records of 輸血部門 (and, as they are added, 病理 and 生理検査室), with the fictional state they start
// from. WardApp spreads `states` into useWorkspace so they are saved with the other records of the session.

import { useState } from "react";
import { EMPTY_BANK, initialBank, type BloodBank } from "./blood-bank";
import { nowTimeInTokyo } from "./dates";
import { abs } from "./flowsheet";

/** The fictional start, made in the browser only (it depends on the time the page is opened). */
const onClient =
  <T,>(empty: T, make: (nowAbs: number) => T) =>
  () =>
    typeof window === "undefined" ? empty : make(abs(0, nowTimeInTokyo()));

export function useDepartments() {
  const [bloodBank, setBloodBank] = useState<BloodBank>(onClient(EMPTY_BANK, initialBank));
  return {
    bloodBank,
    setBloodBank,
    /** For useWorkspace (the names must stay the same). */
    states: {
      bloodBank: [bloodBank, setBloodBank],
    } as Record<string, [unknown, (v: never) => void]>,
  };
}
