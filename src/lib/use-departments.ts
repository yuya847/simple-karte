"use client";

// The records of 輸血部門 and 病理 (and, as it is added, 生理検査室), with the fictional state they start
// from. WardApp spreads `states` into useWorkspace so they are saved with the other records of the session.

import { useMemo, useState } from "react";
import { EMPTY_BANK, initialBank, type BloodBank } from "./blood-bank";
import { nowTimeInTokyo } from "./dates";
import { abs } from "./flowsheet";
import { initialPathology, pathResultItems, type PathCase } from "./pathology";
import type { ResultItem } from "./results";

/** The fictional start, made in the browser only (it depends on the time the page is opened). */
const onClient =
  <T,>(empty: T, make: (nowAbs: number) => T) =>
  () =>
    typeof window === "undefined" ? empty : make(abs(0, nowTimeInTokyo()));

export function useDepartments() {
  const [bloodBank, setBloodBank] = useState<BloodBank>(onClient(EMPTY_BANK, initialBank));
  const [pathology, setPathology] = useState<PathCase[]>(onClient([], initialPathology));
  /** Reports the doctor marks as read, like the other results (病理). */
  const results: ResultItem[] = useMemo(() => pathResultItems(pathology), [pathology]);
  return {
    bloodBank,
    setBloodBank,
    pathology,
    setPathology,
    results,
    /** For useWorkspace (the names must stay the same). */
    states: {
      bloodBank: [bloodBank, setBloodBank],
      pathology: [pathology, setPathology],
    } as Record<string, [unknown, (v: never) => void]>,
  };
}
