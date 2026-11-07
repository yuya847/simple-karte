import { icuIoLines } from "./io-lines";
import { abs } from "../flowsheet";
import type { Patient } from "../types";
import type { IcuRecords, Infusion } from "./types";
import { rateAt } from "./gamma";
export const BALANCE_HINT = "ICU 記録の 1 時間ごとの量と持続投与の速さから。病棟の水分出納と同じ行を 1 時間ごとに数えています。持続投与は速さ×経過時間（時間途中の変更・開始・終了で分割）。未記録の量は累積には加えません。";
export function infusionVolume(inf: Infusion, lo: number, hi: number): number {
  const points = [...new Set([lo,hi,abs(inf.start.day,inf.start.time),...(inf.end ? [abs(inf.end.day,inf.end.time)] : []),...inf.changes.map(c => abs(c.at.day,c.at.time))].filter(t => t >= lo && t <= hi))].sort((a,b)=>a-b);
  return points.slice(0,-1).reduce((s,t,i) => s+(rateAt(inf,t) ?? 0)*(points[i+1]-t)/60,0);
}
export const urineMlPerKgPerH = (urineMl: number, kg: number): number | null => Number.isFinite(urineMl) && urineMl >= 0 && Number.isFinite(kg) && kg > 0 ? urineMl/kg : null;
export function hourlyBalance(patient: Patient, records: IcuRecords, day: number, nowAbs = Infinity) {
  const first = records.stays.filter(s=>s.patientId===patient.id).map(s=>abs(s.in.day,s.in.time)).sort((a,b)=>a-b)[0];
  const amounts = (lo: number, hi: number) => {
    const lines = icuIoLines(records, patient.id, lo, hi);
    const sum = (side: "IN" | "OUT", kind?: string, what?: string) => lines.filter(l => l.side === side && (!kind || l.kind === kind) && (!what || l.what === what)).reduce((n,l) => n+l.ml,0);
    const infusionMl=sum("IN","点滴"), enteralMl=sum("IN","経管"), otherInMl=sum("IN","その他");
    const urineMl=sum("OUT","尿"), drainMl=sum("OUT","ドレーン"), gastricMl=sum("OUT",undefined,"胃管"), crrtMl=sum("OUT",undefined,"CRRT 除水");
    const inMl=sum("IN"), outMl=sum("OUT"), otherOutMl=outMl-urineMl-drainMl-gastricMl;
    return {infusionMl,enteralMl,otherInMl,urineMl,drainMl,gastricMl,otherOutMl,crrtMl,inMl,outMl,netMl:inMl-outMl,recorded:lines.length>0};
  };
  let cumulativeMl=0;
  return Array.from({length:24},(_,hour)=>{
    // The column "H時" is the hour that ends at H:00: the time table and the seed write an hour's amounts at H:00
    // (urine at 11:00 = 10:00–11:00), and icuIoLines counts a record in the hour it ends. So a day is
    // (前日 23:00, 23:00], the same records as the day's urine total on the flowsheet.
    const end=day*1440+hour*60, lo=end-60, hi=Math.min(end,nowAbs), future=lo>=nowAbs, a=amounts(lo,hi);
    cumulativeMl+=a.netMl;
    // Both totals end at the same column boundary. Only a just-arrived current column starts at zero.
    const sinceHi = first !== undefined && first > hi && first <= nowAbs && end <= nowAbs && nowAbs < end + 60 ? first : hi;
    return {hour,...a,cumulativeMl:future?null:cumulativeMl,sinceAdmissionMl:future||first===undefined||sinceHi<first?null:amounts(first,sinceHi).netMl};
  });
}
