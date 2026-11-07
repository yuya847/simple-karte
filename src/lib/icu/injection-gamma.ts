// 注射の入力で持続（mL/時）を選んだときに、横に出す γ（μg/kg/分）。表示だけ（式は gamma.ts と同じ）。
// 薬の量（mg）と溶液の総量（mL）は、入れた量と単位・マスターの規格（強さ・容量・名前の %）からコードで出す。
import { findDrug, type DrugMaster } from "../master";
import { gammaFromMlPerH } from "./gamma";

interface Item { drugCode: string; amount: number | null; unit: string }
const PACKS = ["A", "V", "袋", "キット", "筒", "本", "瓶"];
/** w/v %: 0.1% = 1 mg/mL. */
const percentOf = (d: DrugMaster) => { const m = d.name.normalize("NFKC").match(/(\d+(?:\.\d+)?)%/); return m ? Number(m[1]) : null; };
const strengthMg = (d: DrugMaster) => (d.strength?.unit === "mg" ? d.strength.amount : d.strength?.unit === "g" ? d.strength.amount * 1000 : null);

/** mg of a drug in the Rp (null when the units do not say). */
export function itemMg(it: Item, d: DrugMaster): number | null {
  if (it.amount === null || !Number.isFinite(it.amount) || it.amount <= 0) return null;
  if (it.unit === "mg") return it.amount;
  if (it.unit === "μg" || it.unit === "µg") return it.amount / 1000;
  if (it.unit === "g") return it.amount * 1000;
  const pct = percentOf(d);
  if (it.unit === "mL") return pct === null ? null : it.amount * pct * 10;
  if (PACKS.includes(it.unit)) return strengthMg(d) !== null ? it.amount * strengthMg(d)! : pct !== null && d.volumeMl ? it.amount * d.volumeMl * pct * 10 : null;
  return null;
}

/** mL of one item (null when not known). */
export function itemMl(it: Item, d: DrugMaster): number | null {
  if (it.amount === null || !Number.isFinite(it.amount) || it.amount <= 0) return null;
  if (it.unit === "mL") return it.amount;
  if (PACKS.includes(it.unit)) return d.volumeMl ? it.amount * d.volumeMl : null;
  if (it.unit === "mg" && d.volumeMl && strengthMg(d)) return (it.amount / strengthMg(d)!) * d.volumeMl;
  return null;
}

/** γ of the first (main) drug at a rate, with the sum written out; null when a value is missing. */
export function injectionGamma(items: Item[], rateMlPerH: number, weightKg: number | undefined): { gamma: number; text: string } | null {
  const main = items[0] ? findDrug(items[0].drugCode) : undefined;
  if (!main || main.kind === "輸液" || !weightKg || !(rateMlPerH > 0)) return null;
  const mg = itemMg(items[0], main);
  const vols = items.map((it) => { const d = findDrug(it.drugCode); return d ? itemMl(it, d) : null; });
  if (mg === null || vols.some((v) => v === null)) return null;
  const ml = vols.reduce<number>((n, v) => n + v!, 0);
  const g = ml > 0 ? gammaFromMlPerH(rateMlPerH, mg / ml, weightKg) : null;
  if (g === null) return null;
  const r = (n: number) => Number(n.toFixed(2));
  return { gamma: g, text: `${rateMlPerH}mL/時 × ${r(mg)}mg/${r(ml)}mL × 1000 ÷（${weightKg}kg × 60）= ${g.toFixed(2)}μg/kg/分` };
}
