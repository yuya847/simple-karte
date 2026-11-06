/** Display precision belongs to the analyte, including trailing zeroes. */
const DECIMALS: Record<string, number> = { Hb: 1, Alb: 1, Plt: 1, K: 1, Ca: 1, Cre: 2, CRP: 2, HbA1c: 1, pH: 2, Na: 0, BUN: 1, WBC: 0, AST: 0, ALT: 0 };
export function labNumber(code: string, value: number): string {
  const digits = DECIMALS[code];
  return value.toLocaleString("ja-JP", { minimumFractionDigits: digits ?? 0, maximumFractionDigits: digits ?? 3 });
}
