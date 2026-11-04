"use client";
import { useEffect } from "react";
import type { Patient } from "./types";
import { allergyChanges, type KitchenDesk } from "./kitchen";
import type { Staff } from "./roles";
/** Observe the same profile allergies used by the chart; the initial snapshot is not a new order. */
export function useKitchenAllergies(patients: Patient[], desk: KitchenDesk, onDesk: (f: (d: KitchenDesk) => KitchenDesk) => void, me: Staff, time: string) {
  useEffect(() => {
    if (!time) return;
    const snapshot = Object.fromEntries(patients.map(p => [p.id, p.allergies]));
    if (Object.entries(snapshot).every(([id, foods]) => JSON.stringify(foods) === JSON.stringify(desk.allergySnapshot?.[id]))) return;
    onDesk(d => {
      const additions = allergyChanges(d.allergySnapshot ?? {}, snapshot, me.name, time, (d.allergyChanges ?? []).length);
      return { ...d, allergySnapshot: { ...d.allergySnapshot, ...snapshot }, allergyChanges: [...(d.allergyChanges ?? []), ...additions] };
    });
  }, [patients, desk.allergySnapshot, onDesk, me.name, time]);
}
