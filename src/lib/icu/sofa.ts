import type { Patient } from "../types";
import { abs } from "../flowsheet";
import { SOFA_SOURCE } from "../record-sofa";
import { fio2At, ventAt } from "./abg";
import { concentrationMgPerMl, gammaFromMlPerH, rateAt } from "./gamma";
import { mapWithMeasured } from "./vitals";
import type { IcuRecords, SofaInput } from "./types";
export { SOFA_SOURCE };
export const SOFA_ORIGINAL = {label:"Vincent JL ほか. Intensive Care Med 1996;22:707-710",url:"https://doi.org/10.1007/BF01709751"};
type Score = 0|1|2|3|4;
export interface SofaFacts {
  inputs: { cns?: SofaInput; respiratory?: SofaInput };
  respiratory: {pf:number; support:boolean; basis:string}[];
  platelets: number[]; bilirubin: number[]; maps: number[];
  drugs: {name:string; gamma:number}[];
  /** assumed: V was put at 1 for the tube, or taken while sedated. */
  gcs: {value:number; basis:string; assumed?:boolean}[];
  creatinine: number[]; urineMl: number; urineHours: number;
}
const supported = new Set(["A/C-VC","A/C-PC","SIMV","PSV","CPAP","NPPV"]);
const finite = (n: number|undefined): n is number => n !== undefined && Number.isFinite(n) && n >= 0;
export function sofaFacts(patient: Patient, records: IcuRecords, day: number, nowAbs = Infinity): SofaFacts {
  const inputs: SofaFacts["inputs"] = {};
  // 同日の再入力は記録時刻が最後のものを使う。元の記録は残す。
  for (const input of (records.sofaInputs ?? []).filter(i=>i.patientId===patient.id && i.day===day).sort((a,b)=>abs(a.at.day,a.at.time)-abs(b.at.day,b.at.time))) inputs[input.item]=input;
  const labs = patient.labs.filter(l=>l.day===day);
  const lab = (key:string) => labs.map(l=>l.values[key]).filter(finite);
  const hourly=records.hourly.filter(r=>r.patientId===patient.id && r.at.day===day && abs(r.at.day,r.at.time)<=nowAbs);
  const vitals=patient.vitals.filter(v=>v.day===day && abs(v.day,v.time)<=nowAbs);
  const infs=records.infusions.filter(i=>i.patientId===patient.id);
  const drugs: SofaFacts["drugs"]=[];
  for(const i of infs) {
    if(!/ドパミン|ドブタミン|アドレナリン/.test(i.name)) continue;
    const c=concentrationMgPerMl(i);
    if(c===null) continue;
    const times=[day*1440,abs(i.start.day,i.start.time),...i.changes.map(c=>abs(c.at.day,c.at.time))].filter(t=>t>=day*1440 && t<(day+1)*1440);
    for(const t of times) { const r=rateAt(i,t); const g=r===null?null:gammaFromMlPerH(r,c,i.weightKg); if(g!==null && g>0) drugs.push({name:i.name,gamma:g}); }
  }
  const maps=[...hourly.map(h=>h.map).filter(finite),...vitals.map(v=>{
    const h=hourly.find(h=>h.at.time===v.time);
    return mapWithMeasured(h,v.sbp,v.dbp);
  }).filter((x): x is number=>x!==null && finite(x))];
  const gcs=inputs.cns ? (inputs.cns.gcs ? [{value:inputs.cns.gcs.e+inputs.cns.gcs.v+inputs.cns.gcs.m,basis:`医師入力 GCS ${inputs.cns.gcs.e+inputs.cns.gcs.v+inputs.cns.gcs.m}（E${inputs.cns.gcs.e}V${inputs.cns.gcs.v}M${inputs.cns.gcs.m}）：${inputs.cns.reason}　${inputs.cns.by} ${inputs.cns.at.time}`}] : []) : vitals.flatMap(v=>{
    if(!v.gcs?.e || !v.gcs.m) return [];
    const t=abs(v.day,v.time),vent=ventAt(records.vents,patient.id,t);
    const intubated=vent && (vent.airway==="経口挿管" || vent.airway==="気管切開");
    const verbal=v.gcs.v ?? (intubated?1:undefined);
    if(verbal===undefined) return [];
    const sedated=infs.some(i=>/プロポフォール|ミダゾラム|デクスメデトミジン/.test(i.name) && (rateAt(i,t)??0)>0);
    return [{value:v.gcs.e+verbal+v.gcs.m,basis:`${v.time} E${v.gcs.e}V${verbal}M${v.gcs.m}${v.gcs.v===undefined&&intubated?"；V は挿管のため 1 と置いた":""}${sedated?"；鎮静中":""}`,assumed:(v.gcs.v===undefined&&!!intubated)||sedated}];
  });
  const urine=hourly.filter(h=>finite(h.urineMl));
  return {inputs,respiratory:labs.flatMap(l=>{
    const f=inputs.respiratory ? inputs.respiratory.fio2 ?? null : fio2At(records.vents,patient.id,abs(l.day,l.time)),v=ventAt(records.vents,patient.id,abs(l.day,l.time));
    if(!finite(l.values.PaO2) || f===null || !Number.isFinite(f) || f<.21 || f>1) return [];
    return [{pf:l.values.PaO2/f,support:!!v&&supported.has(v.mode),basis:`${l.time} PaO2 ${l.values.PaO2} ÷ FiO2 ${f}${inputs.respiratory?`；FiO2 は医師入力（${inputs.respiratory.reason}）`:""}${v?`；${v.mode}`:""}${v?.mode==="HFNC"?"（HFNC は呼吸補助に数えない）":""}`}];
  }),platelets:lab("Plt"),bilirubin:lab("T-Bil"),maps,drugs,gcs,creatinine:lab("Cre"),urineMl:urine.reduce((s,h)=>s+h.urineMl!,0),urineHours:new Set(urine.map(h=>Number(h.at.time.slice(0,2)))).size};
}
/* SOFA threshold table (Vincent 1996; above and SOFA_SOURCE).
             0        1         2          3                4
P/F          ≥400     <400      <300       <200 + support   <100 + support
Plt ×10³/μL  ≥150     <150      <100       <50              <20 (万/μL ×10)
Bil mg/dL    <1.2     <2        <6         <12              ≥12
MAP/drugs    ≥70      <70       DA≤5/DB    DA>5/A,NA≤0.1    DA>15/A,NA>0.1 γ
GCS          15       13–14     10–12      6–9              <6
Cre mg/dL    <1.2     <2        <3.5       <5 or U<500      ≥5 or U<200
U = complete 24 hourly urine volumes only; HFNC excluded from respiratory support.
*/
/**
 * An item is 推定 (assumed) when its worst value rests on a value put in (V=1 for the tube, a sedated GCS) or
 * when the urine of fewer than 24 hours so far could still raise the renal score.
 */
export function sofaScore(f: SofaFacts) {
  const items: {key:string;label:string;score:Score|null;basis:string;assumed:boolean}[]=[];
  const add=(key:string,label:string,c:{score:Score;basis:string;assumed?:boolean}[],extra="")=>{
    const worst=c.sort((a,b)=>b.score-a.score)[0];
    items.push({key,label,score:worst?.score??null,basis:[worst?.basis??"記録なし",extra].filter(Boolean).join("；"),assumed:!!worst?.assumed});
  };
  add("respiratory","呼吸",f.respiratory.map(r=>({score:r.support&&r.pf<100?4:r.support&&r.pf<200?3:r.pf<300?2:r.pf<400?1:0,basis:`P/F ${Math.round(r.pf)}（${r.basis}）`})));
  add("coagulation","凝固",f.platelets.map(p=>({score:p<2?4:p<5?3:p<10?2:p<15?1:0,basis:`Plt ${p}万/μL ×10 = ${p*10}×10³/μL`})));
  add("liver","肝",f.bilirubin.map(b=>({score:b>=12?4:b>=6?3:b>=2?2:b>=1.2?1:0,basis:`T-Bil ${b}mg/dL`})));
  const cardio: {score:Score;basis:string}[]=f.maps.map(m=>({score:m<70?1:0,basis:`MAP ${m}mmHg`}));
  for(const d of f.drugs) {
    const g=d.gamma;
    const score:Score=/ドブタミン/.test(d.name)?2:/ドパミン/.test(d.name)?g>15?4:g>5?3:2:g>0.1+1e-12?4:3;
    cardio.push({score,basis:`${d.name} ${Number(g.toPrecision(8))}γ（mL/h × mg/mL ×1000 ÷ kg ÷60）`});
  }
  add("cardiovascular","循環",cardio);
  add("cns","中枢神経",f.gcs.map(g=>({score:g.value<6?4:g.value<10?3:g.value<13?2:g.value<15?1:0,basis:`GCS ${g.value}（${g.basis}）`,assumed:g.assumed})));
  const renal:{score:Score;basis:string}[]=f.creatinine.map(c=>({score:c>=5?4:c>=3.5?3:c>=2?2:c>=1.2?1:0,basis:`Cre ${c}mg/dL`}));
  // Complete urine output only supplies a score when its threshold applies.
  if(f.urineHours===24 && f.urineMl<500) renal.push({score:f.urineMl<200?4:3,basis:`尿量 ${f.urineMl}mL/日（24時間）`});
  add("renal","腎",renal,f.urineHours===24?`尿量 ${f.urineMl}mL/日（24時間）`:`尿量 ${f.urineHours} 時間分のみ`);
  const kidney=items.at(-1)!, couldReach=f.urineMl<200?4:f.urineMl<500?3:0;
  if(f.urineHours!==24 && kidney.score!==null && couldReach>kidney.score) kidney.assumed=true;
  const missing=items.filter(i=>i.score===null).map(i=>i.label);
  return {items,total:missing.length?null:items.reduce((s,i)=>s+i.score!,0),missing,assumed:items.filter(i=>i.assumed).map(i=>i.label)};
}
