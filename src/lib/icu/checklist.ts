import type { RoundCheck } from "./types";
export const FAST_HUG_SOURCE = {label:"Vincent JL. Crit Care Med 2005;33:1225-1229",url:"https://doi.org/10.1097/01.CCM.0000165962.16682.46"};
export const FAST_HUG = [
  {key:"feeding",label:"栄養（Feeding）"}, {key:"analgesia",label:"鎮痛（Analgesia）"}, {key:"sedation",label:"鎮静（Sedation）"},
  {key:"thrombosis",label:"血栓予防（Thromboembolic prophylaxis）"}, {key:"head",label:"頭部挙上（Head-of-bed elevation）"},
  {key:"ulcer",label:"ストレス潰瘍予防（stress Ulcer prevention）"}, {key:"glucose",label:"血糖（Glucose control）"},
] as const;
// Only records whether the item was reviewed today. No treatment recommendation.
export function checkedToday(rounds: RoundCheck[], patientId: string, day: number): RoundCheck | null {
  return rounds.filter(r => r.patientId === patientId && r.day === day).sort((a,b) => a.time.localeCompare(b.time)).at(-1) ?? null;
}
