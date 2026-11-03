// Drug quantities and 薬剤料 points.
//
// 薬剤料 (告示 F200 / G100, 令和8年度): per unit of administration (内服 1剤1日分, 屯服 1回分,
// 注射は入院では手技の区分ごとの1日分 — 記載要領 キ(オ)), a 薬価 of 15円 or less is 1点; above that,
// ceil((薬価 − 15) ÷ 10) + 1 点. 検査 (D500) and 処置 (J300) differ: 15円以下 is not billed.

import { findDrug, findOralDrug } from "../master";
import { findProcDrug } from "../procedures";
import { DRUG_CODES } from "./codes";

export function drugPoints(yen: number): number {
  // Prices carry up to 2 decimals; work in hundredths to avoid floating error.
  const cents = Math.round(yen * 100);
  if (cents <= 1500) return 1;
  return Math.ceil((cents - 1500) / 1000) + 1;
}

/** 処置の薬剤料（J300）: 15円以下は算定しない (注1). Same formula above 15円. */
export function procDrugPoints(yen: number): number {
  return Math.round(yen * 100) <= 1500 ? 0 : drugPoints(yen);
}

/** 特定保険医療材料料・酸素加算: 価格を10円で除して得た点数（1点未満四捨五入）. */
export function materialPoints(yen: number): number {
  return Math.round(Math.round(yen * 100) / 1000);
}

/**
 * 酸素の価格 (通知 J201(4)(5)): 単価 × 使用した容積(L) × 補正率1.3、1円未満四捨五入.
 * 単価 is the hospital's 購入単価 when it is below the 告示 単価.
 */
export function oxygenYen(unitYenPerL: number, liters: number): number {
  const cents = Math.round(unitYenPerL * 100);
  return Math.round((cents * liters * 13) / 1000);
}

/**
 * Quantity in the 医薬品マスター unit for one administration of an item of this hospital's master.
 * Returns null when the unit cannot be converted (the engine then reports it).
 */
export function masterQuantity(drugCode: string, amount: number, unit: string): number | null {
  const inj = findDrug(drugCode);
  if (inj) {
    if (unit === "本" || unit === "袋" || unit === "V" || unit === "A" || unit === "キット") return amount;
    if (unit === "mEq" && inj.strength?.unit === "mEq") return amount / inj.strength.amount;
    if (unit === "mL" && inj.strength?.unit === "mEq") return amount / inj.strength.amount; // 1 mEq/mL
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
  const top = findProcDrug(drugCode);
  if (top) return unit === top.unit ? amount : null;
  return null;
}

export const officialDrugCode = (drugCode: string): string | undefined => DRUG_CODES[drugCode];
