"use client";

// The records of the ward's nursing management (褥瘡の経過・状態の一括登録 …), with the fictional state they
// start from. WardApp spreads `states` into useWorkspace so they are saved with the other records of the session.

import { useState } from "react";
import { initialUlcers, type PressureUlcer } from "./pressure-course";
import type { StatusBook } from "./ward-status";

export function useNursingMgmt() {
  const [ulcers, setUlcers] = useState<PressureUlcer[]>(initialUlcers);
  /** 状態の一括登録, by floor. */
  const [statusBook, setStatusBook] = useState<Record<string, StatusBook>>({});
  return {
    ulcers,
    setUlcers,
    statusBook,
    setStatusBook,
    /** For useWorkspace (the names must stay the same). */
    states: {
      ulcers: [ulcers, setUlcers],
      statusBook: [statusBook, setStatusBook],
    } as Record<string, [unknown, (v: never) => void]>,
  };
}
