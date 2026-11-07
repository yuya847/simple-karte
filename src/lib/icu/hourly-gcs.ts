import type { HourlyRecord } from "./types";
export function hourlyGcs(e: string, v: string, m: string): HourlyRecord["gcs"] {
  const part = (value: string, max: number) => {
    if (!value) return undefined;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > max) throw new Error("GCS の値を確かめてください");
    return n;
  };
  const result = { e: part(e,4), v: v === "T" ? "T" as const : part(v,5), m: part(m,6) };
  return e || v || m ? result : undefined;
}
