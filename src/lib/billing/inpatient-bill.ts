import type { DpcMonthView } from "./dpc-claim";
import type { Insurance } from "./insurance";
import { calculateBill } from "./kaikei";
import type { ClaimResult } from "./model";

/** DPC の包括・出来高の分離は dpcMonth（告示第96号 別表1〜3）に一本化する。
 * 食事は点数に加えず、既存の月別・保険別の標準負担額を引き継ぐ。UKE は変更しない。 */
export function inpatientBill(claim: ClaimResult, insurance: Insurance, dpc: DpcMonthView) {
  const useDpc = !!(dpc.outcome?.ok && dpc.outcome.d.hokatsu && dpc.pkg && dpc.dpcTotal !== null);
  const [by, bm, bd] = insurance.birthDate.split("-").map(Number);
  const turns75ThisMonth = Number(claim.month.slice(0, 4)) - by === 75 && Number(claim.month.slice(5)) === bm && bd !== 1;
  const bill = calculateBill({ ...claim, totalPoints: useDpc ? dpc.dpcTotal! : claim.totalPoints }, insurance, { turns75ThisMonth });
  if (useDpc) bill.sections = [
    { name: "DPC 包括", points: dpc.pkg!.total },
    { name: "出来高に残る分", points: dpc.outsideTotal },
  ];
  const reason = useDpc ? null : dpc.outcome === null
    ? "ICD-10 の付いた病名がないため、出来高で計算しています。"
    : !dpc.outcome.ok ? dpc.outcome.reason
    : "包括の対象外のため、出来高で計算しています。";
  return { bill, useDpc, reason, receiptDiffers: bill.totalPoints !== claim.totalPoints };
}
