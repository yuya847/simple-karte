// Server only: base points and time increments come from the medical act master.
import { loadMaster } from './masters/server';
import { anesthesiaBillingCodes, anesthesiaSummary } from './anesthesia';
import type { Surgery } from './surgery';
export function anesthesiaMasterCandidates(s: Surgery) {
  const master=loadMaster('s');
  const col=(n:number)=>master.cols!.indexOf(n);
  const duration=s.anesthesiaCase ? anesthesiaSummary(s.anesthesiaCase).anesthesiaMinutes : null;
  return anesthesiaBillingCodes(s).flatMap(code=>{
    const row=master.rows.find(row=>row[col(3)]===code);
    if(!row) return [];
    const basePoints=Number(row[col(12)]);
    const threshold=Number(row[col(31)]), interval=Number(row[col(33)]), increment=Number(row[col(34)]);
    const extraCount=interval>0 && duration!==null ? Math.max(0,Math.ceil((duration-threshold)/interval)) : 0;
    const extraPoints=extraCount*increment;
    return [{code,name:row[col(5)],basePoints,extraCount,extraPoints,points:basePoints+extraPoints}];
  });
}
