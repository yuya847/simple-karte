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
/** Full-width digits and points (from a Japanese keyboard: 「１」「０．５」) as ASCII, so a number typed either way is read. */
export const halfWidthNumber = (value: string) => value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[．。]/g, ".").replace(/[／]/g, "/").trim();

export function doseStep(drug: { unit: string; scored?: boolean }): number {
  return drug.unit === "錠" ? drug.scored === undefined ? 0.25 : drug.scored ? 0.5 : 1 : drug.unit === "カプセル" ? 1 : 0.001;
}
/** The usual 1回量 to choose from (the combo box): steps of the drug's smallest division, up to 4 tablets/capsules. */
export function doseOptions(drug: { unit: string; scored?: boolean }): string[] {
  if (drug.unit === "g") return ["0.125", "0.25", "0.5", "1", "2", "3"];
  if (drug.unit === "mL") return ["1", "2", "5", "10", "15", "20"];
  if (["包", "瓶", "個"].includes(drug.unit)) return ["1", "2", "3", "4"];
  const step = doseStep(drug);
  if (step < 0.25) return [];
  const out: string[] = [];
  for (let v = step; v <= 4 + 1e-9; v += step) out.push(String(Math.round(v * 100) / 100));
  return out.filter((v, i, all) => Number(v) <= 2 || Number.isInteger(Number(v)) || i === all.length - 1).slice(0, 10);
}

export function validDose(value: string, drug: { unit: string; scored?: boolean }): boolean {
  const n = Number(halfWidthNumber(value)), step = doseStep(drug);
  return Number.isFinite(n) && n > 0 && Math.abs(n / step - Math.round(n / step)) < 1e-7;
}
export function rxChoiceIndex(index: number, key: string, count: number): number {
  if (/^[1-9]$/.test(key)) return Math.min(count - 1, Number(key) - 1);
  return (index + (key === "ArrowRight" || key === "ArrowDown" ? 1 : key === "ArrowLeft" || key === "ArrowUp" ? -1 : 0) + count) % count;
}

export function rxEntryLines(active: RxStep, values: { times: string; usage: string; days: string }): { step: RxStep; text: string }[] {
  return (["times", "usage", "days"] as const).filter((step) => STEPS.indexOf(step) < STEPS.indexOf(active) && !!values[step]).map((step) => ({ step, text: values[step] }));
}

/** 日数欄は服用する日の数。間隔を変えても数量の基準は変えない。 */
export const RX_DAY_COUNT_LABEL = "投与日数";
