"use client";

// The records of 輸血部門・病理・生理検査室, with the fictional state they start from. WardApp spreads
// `states` into useWorkspace so they are saved with the other records of the session.

import { useMemo, useState } from "react";
import { EMPTY_BANK, initialBank, type BloodBank } from "./blood-bank";
import { nowTimeInTokyo } from "./dates";
import { abs } from "./flowsheet";
import { initialPathology, pathResultItems, type PathCase } from "./pathology";
import { demoPhysioOrders, initialPhysioDesk, physioResultItems, type PhysioDesk } from "./physio-desk";
import type { ResultItem } from "./results";
import type { OrderEntry } from "./types";

/** The fictional start, made in the browser only (it depends on the time the page is opened). */
const onClient =
  <T,>(empty: T, make: (nowAbs: number) => T) =>
  () =>
    typeof window === "undefined" ? empty : make(abs(0, nowTimeInTokyo()));

export function useDepartments() {
  const [bloodBank, setBloodBank] = useState<BloodBank>(onClient(EMPTY_BANK, initialBank));
  const [pathology, setPathology] = useState<PathCase[]>(onClient([], initialPathology));
  const [physioDesk, setPhysioDesk] = useState<PhysioDesk>(onClient({}, initialPhysioDesk));
  /** Physiological tests ordered for the fictional ward patients (merged into their records). */
  const [demoPhysio] = useState<Record<string, OrderEntry[]>>(onClient({}, demoPhysioOrders));
  /** Reports the doctor marks as read, like the other results (生理・病理). */
  const results: ResultItem[] = useMemo(() => [...physioResultItems(physioDesk), ...pathResultItems(pathology)], [physioDesk, pathology]);
  return {
    bloodBank,
    setBloodBank,
    pathology,
    setPathology,
    physioDesk,
    setPhysioDesk,
    demoPhysio,
    results,
    /** For useWorkspace (the names must stay the same). */
    states: {
      bloodBank: [bloodBank, setBloodBank],
      pathology: [pathology, setPathology],
      physioDesk: [physioDesk, setPhysioDesk],
    } as Record<string, [unknown, (v: never) => void]>,
  };
}
