export interface PatientWindow { patientId: string; key: string }

/** 患者が違う窓は閉じる。同じ患者の窓の順序は保つ。 */
export function closeOtherPatientWindows<T extends PatientWindow>(windows: readonly T[], patientId: string | null): T[] {
  return windows.filter((w) => w.patientId === patientId);
}
