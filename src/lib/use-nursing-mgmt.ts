"use client";

// The records of the ward's nursing management (褥瘡の経過 …), with the fictional state they start from.
// WardApp spreads `states` into useWorkspace so they are saved with the other records of the session.

import { useState } from "react";
import { initialUlcers, type PressureUlcer } from "./pressure-course";

export function useNursingMgmt() {
  const [ulcers, setUlcers] = useState<PressureUlcer[]>(initialUlcers);
  return {
    ulcers,
    setUlcers,
    /** For useWorkspace (the names must stay the same). */
    states: {
      ulcers: [ulcers, setUlcers],
    } as Record<string, [unknown, (v: never) => void]>,
  };
}
