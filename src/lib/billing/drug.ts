// Drug quantities and 薬剤料 points.
//
// 薬剤料 (告示 F200 / G100 / D500, 令和8年度): per unit of administration (内服 1剤1日分, 屯服 1回分,
// 注射は入院では手技の区分ごとの1日分 — 記載要領 キ(オ)), a 薬価 of 15円 or less is 1点; above that,
// ceil((薬価 − 15) ÷ 10) + 1 点.

import { findDrug, findOralDrug } from "../master";
import { DRUG_CODES } from "./codes";

export function drugPoints(yen: number): number {
  // Prices carry up to 2 decimals; work in hundredths to avoid floating error.
  const cents = Math.round(yen * 100);
  if (cents <= 1500) return 1;
  return Math.ceil((cents - 1500) / 1000) + 1;
}

/**
 * Quantity in the 医薬品マスター unit for one administration of an item of this hospital's master.
 * Returns null when the unit cannot be converted (the engine then reports it).
 */
export function masterQuantity(drugCode: string, amount: number, unit: string): number | null {
  const inj = findDrug(drugCode);
  if (inj) {
    if (unit === "本" || unit === "袋" || unit === "V" || unit === "A") return amount;
    if (unit === "mL") {
      if (inj.volumeMl) return amount / inj.volumeMl; // fluids: bags
      return null;
    }
    if ((unit === "g" || unit === "mg") && inj.strength) {
      const grams = unit === "g" ? amount : amount / 1000;
      const per = inj.strength.unit === "g" ? inj.strength.amount : inj.strength.amount / 1000;
      return grams / per;
    }
    return null;
  }
  const oral = findOralDrug(drugCode);
  if (oral) return unit === oral.unit ? amount : null;
  return null;
}

export const officialDrugCode = (drugCode: string): string | undefined => DRUG_CODES[drugCode];
