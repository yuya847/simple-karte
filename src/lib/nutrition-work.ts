import type { AdmitEval } from "./admit-eval";
import { openRequests, type GuidanceRecord } from "./guidance";
import type { TeamDesk } from "./teams";
import type { Patient, OrderEntry } from "./types";

export function nutritionWork(people: {patient: Patient;room:string;entries:OrderEntry[]}[], evaluations: Record<string,AdmitEval>, teams: TeamDesk, guidance: GuidanceRecord[]) {
  return people.flatMap(({patient:p,room,entries}) => {
    const n = evaluations[p.id]?.nutrition;
    const jobs: {kind:string;day:number;detail:string;panel:"nutrition"|"team"|"guide-record"}[] = [];
    if (!n) jobs.push({kind:"入院時スクリーニング",day:p.admittedOn,detail:"未記録",panel:"nutrition"});
    if (n) jobs.push({kind:"栄養の再評価",day:n.reassessOn,detail:n.goal,panel:"nutrition"});
    for (const r of teams.requests.filter(r => r.team === "nst" && r.patientId === p.id && !r.closed)) {
      const future = r.nextRound;
      jobs.push({kind:"NST 回診",day:future?.day ?? 0,detail:future ? `${future.time} ${r.reason}` : `回診待ち：${r.reason}`,panel:"team"});
    }
    for (const r of openRequests(entries,"栄養食事指導",guidance.filter(g => g.patientId === p.id))) jobs.push({kind:"栄養食事指導の依頼",day:r.day,detail:r.author,panel:"guide-record"});
    return jobs.map(j => ({...j,patientId:p.id,name:p.name,room}));
  }).sort((a,b) => a.day-b.day || a.room.localeCompare(b.room,"ja"));
}
