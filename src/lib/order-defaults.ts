import { patientPlace } from "./patient-place";
import type { InjectionSchedule } from "./types";

/** 架空の病院の入力上の取り決め。現在時刻は呼び出し側で渡す。 */
export function orderDefaults(patientId: string, category: "定期" | "臨時", now: string) {
  const immediate = patientPlace(patientId) === "er" || category === "臨時";
  return {
    schedule: (immediate ? { kind: "once" } : { kind: "per_day", count: 1 }) as InjectionSchedule,
    start: { day: 0, time: immediate ? now : "10:00" },
    drawMode: patientPlace(patientId) === "er" ? "now" as const : "routine" as const,
    imagingTime: patientPlace(patientId) === "er" ? now : null,
  };
}
