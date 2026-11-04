// Server only. Uses the same confirmed-order calculation and official masters as outpatient billing.
import { calculateOpdClaim, type OpdClaim, type OpdClaimInput } from "./opd-claim";
import { arrivalDate, emergencyBand, ER_RULE_HINT, type EmergencyContext } from "./emergency-visit";
import { shinryoItem } from "./master-items";

const CODES = {
  初診: { 時間外: "111000570", 休日: "111000670", 深夜: "111000770" },
  再診: { 時間外: "112001110", 休日: "112001210", 深夜: "112001310" },
  乳幼児初診: { 時間外: "111011970", 休日: "111012070", 深夜: "111012170" },
  乳幼児再診: { 時間外: "112014770", 休日: "112014870", 深夜: "112014970" },
} as const;
export function calculateEmergencyClaim(input: OpdClaimInput, emergency: EmergencyContext): OpdClaim {
  const date = arrivalDate(input.today, emergency.arrivedAbs);
  if (emergency.admittedAs) return { month: date.slice(0, 7), day: Number(date.slice(8)), acts: [], totalPoints: 0, issues: [{ level: "info", text: `入院先 ${emergency.admittedAs} に引き継ぎます。救急外来では会計しません。` }], excluded: [], sources: [] };
  const claim = calculateOpdClaim({ ...input, today: date });
  const band = emergencyBand(input.today, emergency.arrivedAbs);
  if (band) {
    const key = `${input.visit.age < 6 ? "乳幼児" : ""}${input.visit.kind}` as keyof typeof CODES;
    const item = shinryoItem(CODES[key][band]);
    if (!item) throw new Error("時間帯加算のマスターがありません");
    claim.acts.push({ shikibetsu: input.visit.kind === "初診" ? "11" : "12", parts: [{ lines: [{ record: "SI", code: item.code, name: item.name }], points: item.points }], count: 1, days: { [claim.day]: 1 }, basis: `A000・A001 ${band}加算。${ER_RULE_HINT}` });
    claim.totalPoints += item.points;
  }
  claim.excluded = claim.excluded.map((x) => x.startsWith("時間外・休日・深夜") ? "乳幼児の基本加算（時間外・休日・深夜の乳幼児加算のみ対応）" : x);
  claim.issues.push({ level: "choose", text: "救急医療管理加算１・２の候補：緊急入院を要する重症患者の入院時の状態を人が確認し、入院先の算定で選びます。外来では算定しません。" });
  return claim;
}
