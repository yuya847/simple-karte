"use client";

// The records of the ward's nursing management (褥瘡の経過・状態の一括登録・業務分担 …), with the fictional state they
// start from. WardApp spreads `states` into useWorkspace so they are saved with the other records of the session.

import { useState } from "react";
import { initialUlcers, type PressureUlcer } from "./pressure-course";
import type { StatusBook } from "./ward-status";
import type { AssignBook } from "./assignments";

export function useNursingMgmt() {
  const [ulcers, setUlcers] = useState<PressureUlcer[]>(initialUlcers);
  /** 状態の一括登録, by floor. */
  const [statusBook, setStatusBook] = useState<Record<string, StatusBook>>({});
  /** 業務分担, by floor and shift. */
  const [assignBook, setAssignBook] = useState<AssignBook>({});
  return {
    ulcers,
    setUlcers,
    statusBook,
    setStatusBook,
    assignBook,
    setAssignBook,
    /** For useWorkspace (the names must stay the same). */
    states: {
      ulcers: [ulcers, setUlcers],
      statusBook: [statusBook, setStatusBook],
      assignBook: [assignBook, setAssignBook],
    } as Record<string, [unknown, (v: never) => void]>,
  };
}
