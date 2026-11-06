import { DRUGS } from "./master";
import type { InjectionRoute } from "./types";

export interface DiluentRow { drugCode: string; amount: string; unit: string }
export const SALINE_CODES: Record<number, string> = { 50: "622830801", 100: "INJ-NS100", 250: "643310476" };
/** 架空の病院の入力候補の表示順。投与量・溶解方法の判定ではなく、医師が選ぶ。 */
export const DILUENT_CHOICES = [
  { ingredient: "バンコマイシン", fromGrams: 1, volumes: [100, 250, 50] },
  { ingredient: "バンコマイシン", fromGrams: 0, volumes: [100, 50] },
  { ingredient: "セファゾリン", fromGrams: 0, volumes: [50, 100] },
  { ingredient: "セフトリアキソン", fromGrams: 0, volumes: [50, 100] },
  { ingredient: "メロペネム", fromGrams: 0, volumes: [50, 100] },
  { ingredient: "タゾ", fromGrams: 0, volumes: [50, 100] },
];
export function diluentChoices(rows: DiluentRow[], route: InjectionRoute | null, declined = false): number[] {
  const drug = DRUGS.find(d => d.code === rows[0]?.drugCode);
  if (declined || !drug || drug.kind !== "抗菌薬" || !drug.routes.includes("点滴静注") || (route && route !== "点滴静注") || drug.strength?.per !== "V" || drug.volumeMl || rows.some(r => DRUGS.find(d => d.code === r.drugCode)?.kind === "輸液")) return [];
  const row = rows[0];
  const amount = Number(row.amount);
  const grams = row.unit === "g" ? amount : row.unit === "mg" ? amount / 1000 : row.unit === "V" ? amount * drug.strength.amount / (drug.strength.unit === "mg" ? 1000 : 1) : 0;
  const name = [drug.name, drug.generic, ...drug.aliases].join(" ");
  return DILUENT_CHOICES.find(c => name.includes(c.ingredient) && grams >= c.fromGrams)?.volumes ?? [50, 100];
}
export function chooseDiluent<T extends { rows: DiluentRow[]; diluentDeclined?: boolean }>(rp: T, volume: number | null): T & { diluentDeclined?: boolean } {
  if (volume === null) return { ...rp, diluentDeclined: true };
  const code = SALINE_CODES[volume];
  if (!code || rp.rows.some(r => DRUGS.find(d => d.code === r.drugCode)?.kind === "輸液")) return rp;
  return { ...rp, rows: [...rp.rows, { drugCode: code, amount: String(volume), unit: "mL" }] };
}
