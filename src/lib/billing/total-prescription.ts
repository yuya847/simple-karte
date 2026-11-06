import { materialPoints, masterQuantity, officialDrugCode, drugPoints } from "./drug";
import { iyakuItem, tokkiItem } from "./master-items";
import type { ClaimPart } from "./model";
import type { PrescriptionUse } from "../prescription-kind";

/** 総量は日数や使用回数を乗じない。材料の名称・価格は特定器材マスターから読む。 */
export function totalPrescriptionPart(code: string, amount: number, unit: string, use: PrescriptionUse): ClaimPart | null {
  if (!(amount > 0) || !Number.isFinite(amount)) return null;
  if (use.kind === "材料") {
    const m = tokkiItem(code);
    if (!m || !Number.isInteger(amount)) return null;
    return { lines: [{ record: "TO", code, name: m.name, quantity: amount, unit: m.unitName || unit, unitCode: m.unitCode, yen: m.price * amount }], points: materialPoints(m.price * amount) };
  }
  const official = officialDrugCode(code), quantity = masterQuantity(code, amount, unit);
  const m = official ? iyakuItem(official) : undefined;
  if (!m || quantity === null) return null;
  const yen = m.price * quantity;
  return { lines: [{ record: "IY", code: official!, name: m.name, quantity, unit: m.unit, yen }], points: drugPoints(yen) };
}
