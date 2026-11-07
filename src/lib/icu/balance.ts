import { abs } from "../flowsheet";
import type { Patient } from "../types";
import type { IcuRecords, Infusion } from "./types";
import { rateAt } from "./gamma";
export const BALANCE_HINT = "ICU 記録の 1 時間ごとの量と持続投与の速さから。病棟の水分出納の画面とは別に数えています。持続投与は速さ×経過時間（時間途中の変更・開始・終了で分割）。未記録の量は累積には加えません。";
export function infusionVolume(inf: Infusion, lo: number, hi: number): number {
  const points = [...new Set([lo,hi,abs(inf.start.day,inf.start.time),...(inf.end ? [abs(inf.end.day,inf.end.time)] : []),...inf.changes.map(c => abs(c.at.day,c.at.time))].filter(t => t >= lo && t <= hi))].sort((a,b)=>a-b);
  return points.slice(0,-1).reduce((s,t,i) => s+(rateAt(inf,t) ?? 0)*(points[i+1]-t)/60,0);
}
export const urineMlPerKgPerH = (urineMl: number, kg: number): number | null => Number.isFinite(urineMl) && urineMl >= 0 && Number.isFinite(kg) && kg > 0 ? urineMl/kg : null;
export function hourlyBalance(patient: Patient, records: IcuRecords, day: number) {
  const first = records.stays.filter(s=>s.patientId===patient.id).map(s=>abs(s.in.day,s.in.time)).sort((a,b)=>a-b)[0];
  const infs = records.infusions.filter(i=>i.patientId===patient.id);
  const amounts = (lo: number, hi: number) => {
    const hs = records.hourly.filter(r=>r.patientId===patient.id && abs(r.at.day,r.at.time)>=lo && abs(r.at.day,r.at.time)<hi);
    const infusionMl = infs.reduce((n,i)=>n+infusionVolume(i,lo,hi),0);
    const enteralMl = hs.reduce((n,r)=>n+(r.enteralMl??0),0), otherInMl=hs.reduce((n,r)=>n+(r.otherInMl??0),0);
    const urineMl=hs.reduce((n,r)=>n+(r.urineMl??0),0), drainMl=hs.reduce((n,r)=>n+(r.drainMl??0),0), gastricMl=hs.reduce((n,r)=>n+(r.gastricMl??0),0);
    const otherOutMl=hs.reduce((n,r)=>n+(r.stoolMl??0)+(r.bloodLossMl??0),0);
    const inMl=infusionMl+enteralMl+otherInMl, outMl=urineMl+drainMl+gastricMl+otherOutMl;
    return {infusionMl,enteralMl,otherInMl,urineMl,drainMl,gastricMl,otherOutMl,inMl,outMl,netMl:inMl-outMl,recorded:hs.length>0 || infusionMl>0};
  };
  let cumulativeMl=0;
  return Array.from({length:24},(_,hour)=>{
    const lo=day*1440+hour*60, hi=lo+60, a=amounts(lo,hi);
    cumulativeMl+=a.netMl;
    return {hour,...a,cumulativeMl,sinceAdmissionMl:first===undefined||hi<=first?null:amounts(first,hi).netMl};
  });
}
