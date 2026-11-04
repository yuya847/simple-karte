/** Rp入力の欄。医師の入力だけで進み、用量は補正しない。 */
export type RxStep = "drug" | "dose" | "times" | "usage" | "days" | "done";
const STEPS: RxStep[] = ["drug", "dose", "times", "usage", "days", "done"];
export function rxEntryStep(step: RxStep, key: string, valid = true): RxStep {
  const i = STEPS.indexOf(step);
  if (["Escape", "ArrowUp"].includes(key)) return STEPS[Math.max(0, i - 1)];
  if ((key === "Enter" || key === "Tab") && valid) return STEPS[Math.min(STEPS.length - 1, i + 1)];
  return step;
}
export function candidateIndex(count: number, selected: number): number | null {
  return count ? count === 1 ? 0 : Math.max(0, Math.min(count - 1, selected)) : null;
}
export function doseStep(drug: { unit: string; scored?: boolean }): number {
  return drug.unit === "錠" ? drug.scored === undefined ? 0.25 : drug.scored ? 0.5 : 1 : drug.unit === "カプセル" ? 1 : 0.001;
}
export function validDose(value: string, drug: { unit: string; scored?: boolean }): boolean {
  const n = Number(value), step = doseStep(drug);
  return Number.isFinite(n) && n > 0 && Math.abs(n / step - Math.round(n / step)) < 1e-7;
}
export function rxChoiceIndex(index: number, key: string, count: number): number {
  if (/^[1-9]$/.test(key)) return Math.min(count - 1, Number(key) - 1);
  return (index + (key === "ArrowRight" || key === "ArrowDown" ? 1 : key === "ArrowLeft" || key === "ArrowUp" ? -1 : 0) + count) % count;
}

export function rxEntryLines(active: RxStep, values: { times: string; usage: string; days: string }): { step: RxStep; text: string }[] {
  return (["times", "usage", "days"] as const).filter((step) => STEPS.indexOf(step) < STEPS.indexOf(active) && !!values[step]).map((step) => ({ step, text: values[step] }));
}
