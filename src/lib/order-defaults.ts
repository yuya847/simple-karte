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

export const ONCE_INFUSION_HINT = "1回だけの輸液の入力既定：500mLは1時間、250mL・100mLは30分（架空の病院の取り決め。医師が変更できます）";
export function onceInfusionMinutes(volume: number): number | null {
  return ({ 500: 60, 250: 30, 100: 30 } as Record<number, number>)[volume] ?? null;
}
