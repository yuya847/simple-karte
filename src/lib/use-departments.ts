"use client";

// The records of 輸血部門・病理・生理検査室・放射線部・リハビリテーション部, with the fictional state they start from. WardApp spreads
// `states` into useWorkspace so they are saved with the other records of the session.

import { useMemo, useState } from "react";
import { EMPTY_BANK, initialBank, type BloodBank } from "./blood-bank";
import { nowTimeInTokyo } from "./dates";
import { abs } from "./flowsheet";
import { initialPathology, pathResultItems, type PathCase } from "./pathology";
import { demoPhysioOrders, initialPhysioDesk, physioResultItems, type PhysioDesk } from "./physio-desk";
import type { ResultItem } from "./results";
import { demoRehabOrders, EMPTY_REHAB, initialRehabDesk, type RehabDesk } from "./rehab";
import { demoRisOrders, initialRisDesk, risResultItems, type RisDesk } from "./ris";
import type { OrderEntry } from "./types";

/** The fictional start, made in the browser only (it depends on the time the page is opened). */
const onClient =
  <T,>(empty: T, make: (nowAbs: number) => T) =>
  () =>
    typeof window === "undefined" ? empty : make(abs(0, nowTimeInTokyo()));

/** The departments' demo orders for each fictional ward patient, merged. */
const demoOrders = (nowAbs: number): Record<string, OrderEntry[]> => {
  const out: Record<string, OrderEntry[]> = {};
  for (const part of [demoPhysioOrders(nowAbs), demoRisOrders(nowAbs), demoRehabOrders()]) for (const [id, list] of Object.entries(part)) out[id] = [...(out[id] ?? []), ...list];
  return out;
};

export function useDepartments() {
  const [bloodBank, setBloodBank] = useState<BloodBank>(onClient(EMPTY_BANK, initialBank));
  const [pathology, setPathology] = useState<PathCase[]>(onClient([], initialPathology));
  const [physioDesk, setPhysioDesk] = useState<PhysioDesk>(onClient({}, initialPhysioDesk));
  const [ris, setRis] = useState<RisDesk>(onClient({}, initialRisDesk));
  const [rehab, setRehab] = useState<RehabDesk>(onClient(EMPTY_REHAB, initialRehabDesk));
  /** Physiological tests, imaging and rehabilitation ordered for the fictional ward patients (merged into their records). */
  const [demo] = useState<Record<string, OrderEntry[]>>(onClient({}, demoOrders));
  /** Reports the doctor marks as read, like the other results (生理・病理・画像). */
  const results: ResultItem[] = useMemo(() => [...physioResultItems(physioDesk), ...pathResultItems(pathology), ...risResultItems(ris)], [physioDesk, pathology, ris]);
  return {
    bloodBank,
    setBloodBank,
    pathology,
    setPathology,
    physioDesk,
    setPhysioDesk,
    ris,
    setRis,
    rehab,
    setRehab,
    demoOrders: demo,
    results,
    /** For useWorkspace (the names must stay the same). */
    states: {
      bloodBank: [bloodBank, setBloodBank],
      pathology: [pathology, setPathology],
      physioDesk: [physioDesk, setPhysioDesk],
      ris: [ris, setRis],
      rehab: [rehab, setRehab],
    } as Record<string, [unknown, (v: never) => void]>,
  };
}
