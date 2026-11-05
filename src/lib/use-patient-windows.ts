"use client";

import { useState } from "react";
import { closeOtherPatientWindows } from "./patient-windows";

/** Render-time reset prevents even one frame of the previous patient's windows. */
export function usePatientWindows(patientId: string | null, keys: readonly string[], close: () => void) {
  const [owner, setOwner] = useState(patientId);
  if (owner !== patientId) {
    setOwner(patientId);
    const windows = keys.map((key) => ({ patientId: owner ?? "", key }));
    if (closeOtherPatientWindows(windows, patientId).length !== windows.length) close();
  }
}
