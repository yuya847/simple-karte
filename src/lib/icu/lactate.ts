export const LACTATE_MG_PER_MMOL = 9.008;
export const mgPerDlToMmolPerL = (x: number): number => Math.round(x / LACTATE_MG_PER_MMOL * 10) / 10;
export const LACTATE_HINT = "検査マスターの乳酸は mg/dL（SRL）。mmol/L は 9.008 で割った換算";
