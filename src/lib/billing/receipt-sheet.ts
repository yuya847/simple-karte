// A reading layout of the existing UKE records, not another billing calculation.
// Field offsets follow uke.ts (記録条件仕様・医科). Names/units come from the same claim.
import type { Receipt } from "./uke";
import { diagnosisClaimable, diagnosisLabel } from "../diagnoses";
import { classify } from "./inspect";
import { HOSPITAL } from "./facility";

export function receiptSheet(receipt: Receipt, lines: string[], problems: string[] = []) {
  const records = lines.map(l => l.split(","));
  const re = records.find(r => r[0] === "RE")!;
  const ho = records.find(r => r[0] === "HO")!;
  const names = receipt.claim.acts.flatMap(a => a.parts.flatMap(p => p.lines));
  let index = 0;
  let group = "";
  const rows = records.flatMap((r, recordIndex) => {
    if (!["SI", "IY", "TO"].includes(r[0])) return [];
    const line = names[index++];
    if (r[1]) group = r[1];
    const checks = receipt.claim.issues.filter(i => classify(i) && i.codes?.includes(r[3])).map(i => i.text);
    checks.push(...problems.filter(p => p.startsWith(`${recordIndex + 1}行目`)));
    return [{ group, code: r[3], name: line?.name ?? r[3], product: line?.product, unit: line?.unit ?? "", quantity: r[4], points: r[5] === "" ? null : Number(r[5]), count: Number(r[6]), days: r.slice(r[0] === "TO" ? 17 : 13).map(v => v ? Number(v) : null), comments: line?.comments?.map(c => c.label + (c.text ? ` ${c.text}` : "")) ?? [], checks }];
  });
  const diagnoses = receipt.diagnoses.filter(d => diagnosisClaimable(d, receipt.claim.month)).sort((a,b) => a.startDate.localeCompare(b.startDate));
  return {
    month: receipt.claim.month, hospital: HOSPITAL.name, name: re[4], sex: re[5] === "1" ? "男" : "女", birthDate: re[6],
    insurer: ho[1].trim(), symbol: ho[2], number: ho[3], relation: receipt.patient.insurance.relation,
    benefit: 100 - receipt.patient.insurance.rate, special: re[11] || "—",
    kohi: receipt.patient.insurance.kohi?.map(k => `${k.name}　${k.payerNumber} ／ ${k.recipientNumber}`) ?? [],
    diagnoses: records.filter(r => r[0] === "SY").map((r,i) => ({ name: diagnoses[i] ? diagnosisLabel(diagnoses[i]) : r[5] || r[1], main: r[6] === "01", start: r[2], outcome: ({ "1": "継続", "2": "治癒", "3": "死亡", "4": "中止" } as Record<string,string>)[r[3]] ?? "—", comment: r[7] })),
    rows, totalPoints: Number(ho[5]), meals: Number(ho[7]), mealYen: Number(ho[8]), mealFutan: receipt.claim.meals.futanYen,
    medicalYen: receipt.window.medicalYen,
    checks: [...receipt.claim.issues.filter(i => classify(i)).map(i => i.text), ...problems],
  };
}
export type ReceiptSheetData = ReturnType<typeof receiptSheet>;
