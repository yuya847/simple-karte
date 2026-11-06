import type { InjectionOrder } from "./types";

export interface InsulinDose { label: "朝" | "昼" | "夕" | "眠前"; time: string; units: number }
export const INSULIN_SLOTS = ["朝", "昼", "夕", "眠前"] as const;
export const INSULIN_CLOCKS = ["07:30", "11:30", "17:30", "21:00"];
export function parseInsulinDoses(text: string): number[] | null {
  const parts = text.normalize("NFKC").trim().split(/\s*[-－−ー–—]\s*|\s+/);
  if (parts.length !== 4 || parts.some(p => !/^\d+(?:\.\d+)?$/.test(p) || !Number.isFinite(Number(p)))) return null;
  return parts.map(Number);
}
export function insulinDoses(units: number[]): InsulinDose[] {
  return INSULIN_SLOTS.map((label, i) => ({ label, time: INSULIN_CLOCKS[i], units: units[i] }));
}
export function fixedInsulinUnits(o: Pick<InjectionOrder, "insulinDoses" | "items">, at: number): number {
  if (!o.insulinDoses) return o.items[0]?.amount ?? 0;
  const minute = ((at % 1440) + 1440) % 1440;
  return o.insulinDoses.find(d => Number(d.time.slice(0, 2)) * 60 + Number(d.time.slice(3)) === minute)?.units ?? 0;
}
export function insulinDoseText(doses: InsulinDose[]): string {
  return doses.map(d => `${d.label} ${d.units}U（${d.time}）`).join("・");
}
export function insulinDoseProblems(doses?: InsulinDose[]): string[] {
  if (!doses) return [];
  return doses.length !== 4 || doses.some((d, i) => d.label !== INSULIN_SLOTS[i] || !Number.isFinite(d.units) || d.units < 0 || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(d.time)) || new Set(doses.map(d => d.time)).size !== 4 ? ["朝・昼・夕・眠前の量と重複のない時刻を入力してください。"] : [];
}

export function insulinDoseTimes(doses: InsulinDose[], slidingTimes: string[] = []): string[] {
  return [...new Set([...doses.filter(d => d.units > 0).map(d => d.time), ...slidingTimes])].sort();
}
