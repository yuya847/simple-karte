"use client";

// The records of 給食（栄養部門）・内視鏡室・チーム医療, with the fictional state they start from. WardApp spreads
// `states` into useWorkspace so they are saved with the other records of the session.

import { scenarioMode } from "./scenarios/mode";
import { SCENARIOS } from "./scenarios";
import { scenarioNutritionTeams } from "./scenarios/nutrition";
import { useMemo, useState } from "react";
import { nowTimeInTokyo } from "./dates";
import { EMPTY_ENDO, demoEndoOrders, demoEndoPatients, endoResultItems, initialEndo, type EndoDesk } from "./endoscopy";
import { abs } from "./flowsheet";
import { initialKitchen, type KitchenDesk } from "./kitchen";
import { PATIENTS } from "./patients";
import type { ResultItem } from "./results";
import { initialTeams, type TeamDesk } from "./teams";
import type { HistoryEntry, OrderEntry, Patient } from "./types";
import type { BedAssignment } from "./ward";
import { WARD_CHART_PATIENTS } from "./ward-charts";

/** The inpatients of 消化器内科 the demo's endoscopies are for (the same ones every time). */
const DEMO_ENDO_IDS = demoEndoPatients([...PATIENTS, ...WARD_CHART_PATIENTS]);

const onClient =
  <T,>(empty: T, make: (nowAbs: number) => T) =>
  () =>
    typeof window === "undefined" ? empty : make(abs(0, nowTimeInTokyo()));

export function useCareDepts() {
  const [kitchen, setKitchen] = useState<KitchenDesk>(initialKitchen);
  const [endo, setEndo] = useState<EndoDesk>(onClient(EMPTY_ENDO, (n) => initialEndo(DEMO_ENDO_IDS, n)));
  /** Endoscopies ordered for the fictional patients (merged into their records). */
  const [demoEndo] = useState<Record<string, OrderEntry[]>>(onClient({}, (n) => demoEndoOrders(DEMO_ENDO_IDS, n)));
  const [teams, setTeams] = useState<TeamDesk>(() => scenarioMode() ? scenarioNutritionTeams(SCENARIOS.patients) : initialTeams());
  /** Endoscopy reports the ordering doctor marks as read, like the other results. */
  const results: ResultItem[] = useMemo(() => endoResultItems(endo), [endo]);
  return {
    kitchen,
    setKitchen,
    endo,
    setEndo,
    demoEndo,
    teams,
    setTeams,
    results,
    /** For useWorkspace (the names must stay the same). */
    states: {
      kitchenDesk: [kitchen, setKitchen],
      endoDesk: [endo, setEndo],
      teamDesk: [teams, setTeams],
    } as Record<string, [unknown, (v: never) => void]>,
  };
}

/** Every inpatient in a bed with the orders in force (for the hospital-wide desks). */
export function bedPeople(beds: BedAssignment[], find: (id: string) => Patient | undefined, entriesOf: (p: Patient) => HistoryEntry[]): { patient: Patient; room: string; entries: OrderEntry[] }[] {
  return beds.flatMap((b) => {
    const p = b.patientId ? find(b.patientId) : undefined;
    if (!p || p.dischargedAt) return [];
    return [{ patient: p, room: `${b.room}${b.bed}`, entries: entriesOf(p).filter((e): e is OrderEntry => e.kind === "order") }];
  });
}
