import type { TeamDesk } from "../teams";
import type { Patient } from "../types";
import type { DietOrder, DysphagiaCode } from "../diet";

/** Authored fictional nutrition cases, independent of the shared scenario wiring. */
export function scenarioNutrition(p: Patient, diets: DietOrder[], index: number) {
  const codes: DysphagiaCode[] = ["0j","0t","1j","2-1","2-2","3","4"];
  for (const d of diets) {
    const minutes = 505 + (index * 37) % 225;
    d.at.time = `${String(Math.floor(minutes / 60)).padStart(2,"0")}:${String(minutes % 60).padStart(2,"0")}`;
    if (d.kind !== "嚥下調整食") continue;
    d.dysphagia = index === 12 ? "2-1" : codes[Math.floor(index / 4) % codes.length];
    d.thickness = index % 2 ? "薄いとろみ" : "中間のとろみ";
    d.energyKcal = 1400; d.proteinG = 55;
    if (index % 3 === 0) d.prohibited = "納豆";
  }
  if ([7,23,46].includes(index)) p.allergies = [index === 23 ? "卵" : "乳"];
  if ([7,23,46,57].includes(index)) {
    const latest=diets.at(-1);
    if (latest && latest.kind !== "絶食") latest.prohibited="納豆";
  }
  if ([7,23,37,53,67,77,87].includes(index) && p.admittedOn < 0) {
    const base = diets.at(-1);
    if (base) diets.push({...base,id:`${p.id}-today-diet`,from:{day:0,meal:index % 3 ? "昼" : "夕"},at:{day:0,time:`${8 + index % 3}:${index % 2 ? "25" : "45"}`.padStart(5,"0")},
      ...([23,53].includes(index) ? {kind:"絶食",npoReason:"検査前の絶食",energyKcal:undefined,proteinG:undefined} : {prohibited:"納豆",comment:"本人の申告を受けて変更"})});
  }
  if ([13,25,37].includes(index)) p.history.push({kind:"order",id:`${p.id}-nutrition-guide`,day:0,time:"09:20",author:p.attending,status:"有効",order:{type:"procedure",code:"PROC-GUIDE",guide:{kind:"栄養食事指導",note:"食事内容と退院後の摂取方法を相談"},schedule:{kind:"once"},start:{day:0}}});
  // The respiratory case resumes oral meals on day 5. Later notes describe the completed assessment.
  if (index === 12) p.history = p.history.map(e => e.kind === "note" && e.day >= p.admittedOn + 4 ? {...e,
    text:e.text?.replaceAll("嚥下評価後に経口摂取","嚥下評価を終え、嚥下調整食で経口摂取を継続"),
    ...(e.soap ? {soap:Object.fromEntries(Object.entries(e.soap).map(([k,v])=>[k,v?.replaceAll("嚥下評価後に経口摂取","嚥下評価を終え、嚥下調整食で経口摂取を継続")]))} : {})} : e);
  p.history.sort((a,b) => a.day-b.day || a.time.localeCompare(b.time));
}

export function scenarioNutritionTeams(patients: Patient[]): TeamDesk {
  return {requests:[12,37,65].flatMap((index,i) => {
    const p=patients[index];
    return p && !p.dischargedAt ? [{id:`${p.id}-nst`,team:"nst" as const,patientId:p.id,reason:"摂取量低下と食事形態の確認",urgency:"通常" as const,by:p.attending,at:{day:-1,time:"11:30"},accepted:{day:-1,time:"14:00",by:"管理栄養士 高橋"},nextRound:{day:i === 2 ? 1 : 0,time:i === 0 ? "14:00" : "14:30"}}] : [];
  }),rounds:[]};
}
