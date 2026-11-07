"use client";

import { hourlyGcs } from "@/lib/icu/hourly-gcs";
import { useState } from "react";
import type { ReactNode, FormEvent } from "react";
import { X } from "lucide-react";
import { addDays, formatShort } from "@/lib/dates";
import { abs } from "@/lib/flowsheet";
import { ventAt, rateAt, doseText, hourlyBalance, mapWithMeasured, MAP_HINT, BALANCE_HINT } from "@/lib/icu";
import type { HourlyRecord, Infusion } from "@/lib/icu";
import { DayNav } from "../DayNav";
import { Field, button, input, n, s, stamp, type IcuPaneProps } from "./parts";

const hourlyFields=[['map','MAP mmHg'],['cvp','CVP mmHg'],['rass','RASS'],['cpot','CPOT'],['urineMl','尿量 mL'],['drainMl','ドレーン mL'],['gastricMl','胃管 mL'],['stoolMl','便 mL'],['bloodLossMl','出血 mL'],['enteralMl','経腸 mL'],['otherInMl','その他 IN mL'],['glucose','血糖 mg/dL']] as const;
const hh=(h:number)=>String(h).padStart(2,"0");
/** mL as a whole number (null stays empty). */
const ml=(v:number|null|undefined)=>{if(v===undefined||v===null)return null;const t=v.toFixed(0);return t==="-0"?"0":t;};
/** The drug's name before its strength and maker (the whole name is the row's title). */
const shortName=(name:string)=>name.split(/注射液|静注|注|[「（(\s0-9０-９]/)[0]||name;
const has=(v:ReactNode)=>v!==null&&v!==undefined&&v!==false&&v!=="";

/** One row of the table: its cells (null = no value in that hour); `always` rows show even on an empty day. */
interface Row { key:string; name:string; label?:ReactNode; title?:string; always?:boolean; cell(h:number):ReactNode; infusion?:Infusion; small?:boolean }

/**
 * 時間表: 0〜23時の表（バイタル・観察・呼吸器・持続投与・出納）と、セルから開く1時間の記録。
 * 1440px の画面で 24 列が横に入る幅（見出し 92px、1 列 44px 前後）。今より後の列は薄く、値を出さない。
 * 6 文字ある値（血圧・GCS・瞳孔・CAM-ICU・呼吸器のモード）の行だけ 10px。
 */
export function IcuTimeTable(p:IcuPaneProps&{day:number;setDay(day:number):void}) {
  const {patient,records,me,today,now,nurse,day,setDay,commit,permit,setError,newId}=p;
  const [editHour,setEditHour]=useState<number|null>(null);
  const [formula,setFormula]=useState<{id:string;h:number}|null>(null);
  const infusions=records.infusions.filter(i=>i.patientId===patient.id);
  const balances=hourlyBalance(patient,records,day,now);
  const hours=Array.from({length:24},(_,h)=>h);
  const hourAt=(h:number)=>abs(day,`${hh(h)}:59`);
  const future=(h:number)=>abs(day,`${hh(h)}:00`)>now;
  const nowHour=day===0?Math.floor(now/60):null;
  // The record of the column "H時": the last one in the hour that ends at H:00 (as hourlyBalance counts it).
  const hourRecs=(h:number)=>{const end=abs(day,`${hh(h)}:00`);return records.hourly.filter(r=>r.patientId===patient.id&&abs(r.at.day,r.at.time)>end-60&&abs(r.at.day,r.at.time)<=end).sort((a,b)=>abs(a.at.day,a.at.time)-abs(b.at.day,b.at.time));};
  const hrec=(h:number)=>hourRecs(h).at(-1);
  const vital=(h:number)=>patient.vitals.filter(v=>v.day===day&&Number(v.time.slice(0,2))===h).sort((a,b)=>a.time.localeCompare(b.time)).at(-1);
  function saveHourly(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();if(!permit(nurse,"vitals")||editHour===null)return;
    const f=new FormData(e.currentTarget),old=hrec(editHour);
    const row:HourlyRecord={...old,id:old?.id??newId(),patientId:patient.id,at:{day,time:`${hh(editHour)}:00`},by:me.name};
    for(const [k] of hourlyFields) {const value=n(f,k); if(value!==undefined&&(!Number.isFinite(value)||(k!=="rass"&&value<0)||(k==="rass"&&(value< -5||value>4))||(k==="cpot"&&value>8))){setError("入力値を確かめてください");return;} row[k]=value;}
    row.arterialLine=f.get("arterialLine")==="on";row.camIcu=(s(f,"camIcu")||undefined) as HourlyRecord["camIcu"];
    const right=n(f,"pupilRight"),left=n(f,"pupilLeft");
    row.pupils=right!==undefined&&left!==undefined?{right,left,reactRight:s(f,"reactRight") as "+",reactLeft:s(f,"reactLeft") as "+"}:undefined;
    try { row.gcs = hourlyGcs(s(f,"gcsE"), s(f,"gcsV"), s(f,"gcsM")); } catch (error) { setError((error as Error).message); return; }
    row.note=s(f,"note");
    commit({...records,hourly:[...records.hourly.filter(r=>r.id!==row.id),row]},"時間記録",`${stamp(row.at)} 尿量 ${row.urineMl??"—"}mL`);setEditHour(null);
  }
  const fields:Record<string,(keyof HourlyRecord)[]>={urineMl:['urineMl'],drainMl:['drainMl'],gastricMl:['gastricMl'],otherOutMl:['stoolMl','bloodLossMl'],enteralMl:['enteralMl'],otherInMl:['otherInMl']};
  const rows:Row[]=[
    {key:"hr",name:"HR",always:true,cell:h=>vital(h)?.hr},
    {key:"bp",name:"BP/MAP",always:true,small:true,cell:h=>{const v=vital(h),m=mapWithMeasured(hrec(h),v?.sbp,v?.dbp);return v?.sbp!==undefined||m!==null?<>{v?.sbp??"—"}/<wbr/>{v?.dbp??"—"}<br/>({m===null?"—":m.toFixed(0)})</>:null;}},
    {key:"spo2",name:"SpO2",always:true,cell:h=>vital(h)?.spo2},
    {key:"rr",name:"RR",always:true,cell:h=>vital(h)?.rr},
    {key:"bt",name:"BT",always:true,cell:h=>vital(h)?.bt?.toFixed(1)},
    ...([['cvp','CVP'],['rass','RASS'],['cpot','CPOT'],['camIcu','CAM-ICU']] as const).map(([k,l]):Row=>({key:k,name:l,small:k==="camIcu",cell:h=>hrec(h)?.[k]})),
    {key:"pupils",name:"瞳孔",small:true,cell:h=>{const x=hrec(h)?.pupils;return x?<>{x.right}{x.reactRight}/<wbr/>{x.left}{x.reactLeft}</>:null;}},
    {key:"gcs",name:"GCS",always:true,small:true,cell:h=>{const g=hrec(h)?.gcs??vital(h)?.gcs;return g?<>E{g.e??"—"}V{g.v??"—"}<wbr/>M{g.m??"—"}</>:null;}},
    {key:"vent",name:"呼吸器",small:true,label:<>呼吸器<span className="block font-normal text-ink-soft">FiO2/PEEP</span></>,cell:h=>{const v=ventAt(records.vents,patient.id,hourAt(h));return v?<><span className="whitespace-nowrap">{v.mode}</span><br/>{v.fio2}/{v.peep??"—"}</>:null;}},
    ...infusions.map((i):Row=>({key:i.id,name:i.name,title:i.name,infusion:i,label:<span className="text-[10px]">{shortName(i.name)}<span className="block font-normal text-ink-soft">{i.doseUnit}・mL/h</span></span>,cell:h=>{const t=doseText(i,hourAt(h));return t==="—"?null:t;}})),
    ...([['urineMl','尿量',true],['drainMl','ドレーン'],['gastricMl','胃管'],['otherOutMl','その他 OUT'],['infusionMl','IN 持続投与'],['enteralMl','IN 経腸'],['otherInMl','IN その他'],['netMl','IN−OUT',true],['cumulativeMl','0時から累積',true],['sinceAdmissionMl','入室から累積',true]] as const).map(([k,l,always]):Row=>({key:k,name:l,always:!!always,cell:h=>{
      const keys=fields[k];
      if(keys&&!hourRecs(h).some(r=>keys.some(key=>r[key]!==undefined)))return null;
      return balances[h].recorded||k==="cumulativeMl"||k==="sinceAdmissionMl"?ml(balances[h][k]):null;
    }})),
  ];
  // A row with no value in any hour of the day (so far) is left out, except the ones always shown.
  const shown=rows.filter(r=>r.always||hours.some(h=>!future(h)&&has(r.cell(h))));
  const colClass=(h:number)=>`${h===nowHour?"border-l-2 border-l-ai":""} ${future(h)?"bg-paper text-ink-faint":""}`;
  const infusionCell=(i:Infusion,h:number)=>{
    const text=doseText(i,hourAt(h));
    if(text==="—")return "—";
    const head=text.split("（")[0],dose=head.endsWith(i.doseUnit)?head.slice(0,-i.doseUnit.length):head,open=formula?.id===i.id&&formula.h===h;
    return <>
      <button type="button" title={text} aria-expanded={open} className="h-full w-full px-0.5 leading-tight hover:bg-ai-soft" onClick={()=>setFormula(open?null:{id:i.id,h})}>{dose}<span className="block text-ink-soft">{rateAt(i,hourAt(h))?.toFixed(1)}</span></button>
      {open&&<div className={`absolute top-full z-20 mt-0.5 w-max max-w-80 rounded-md border border-rule bg-sheet px-2 py-1.5 text-left leading-snug text-ink shadow-md ${h>=12?"right-0":"left-0"}`}><button type="button" aria-label="式を閉じる" className="float-right ml-2 text-ink-faint hover:text-ink" onClick={()=>setFormula(null)}><X size={12}/></button>{text}</div>}
    </>;
  };
  return <>
      <DayNav day={day} min={Math.min(-30,patient.admittedOn)} max={0} onChange={d=>{setDay(d);setEditHour(null);setFormula(null);}} fmtDay={d=>today?formatShort(addDays(today,d)):`${d}日`}/>
      <div className="overflow-x-auto max-w-full"><table className="w-full min-w-[1052px] table-fixed border-collapse text-[11px] nums">
        <colgroup><col className="w-[92px]"/>{hours.map(h=><col key={h}/>)}</colgroup>
        <thead><tr><th className="sticky left-0 z-10 bg-sheet px-1 text-left font-normal text-ink-soft">時刻</th>{hours.map(h=><th key={h} className={`py-0.5 font-normal ${colClass(h)}`}>{h}</th>)}</tr></thead>
        <tbody>{shown.map(r=><tr key={r.key}>
          <th title={r.title} className="sticky left-0 z-10 bg-sheet border border-rule px-1 text-left leading-tight">{r.label??r.name}</th>
          {hours.map(h=><td key={h} className={`relative h-7 border border-rule p-0 text-center ${r.small?"text-[10px] tracking-tight":""} ${colClass(h)}`}>{future(h)?null:r.infusion?infusionCell(r.infusion,h):<button type="button" className={`h-full w-full leading-tight hover:bg-ai-soft ${r.small?"px-px":"px-0.5"}`} aria-label={`${h}時 ${r.name}`} onClick={()=>{if(permit(nurse,"vitals")){setEditHour(h);setError("");}}}>{(()=>{const v=r.cell(h);return has(v)?v:"—";})()}</button>}</td>)}
        </tr>)}</tbody>
      </table></div>
      <p hidden className="hint">{MAP_HINT} {BALANCE_HINT} γ = μg/kg/分。FiO2 は採血時以前の最後の設定。設定なし・mode「なし」は不明。</p>
      {editHour!==null&&<form key={`${day}-${editHour}`} onSubmit={saveHourly} className="border border-rule rounded p-3 space-y-2"><b>{editHour}時の記録</b><div className="grid grid-cols-2 gap-2">{hourlyFields.map(([k,l])=><Field key={k} label={l}><input className={input} name={k} type="number" step="any" min={k==="rass"?-5:0} max={k==="rass"?4:k==="cpot"?8:undefined} defaultValue={hrec(editHour)?.[k]}/></Field>)}
        {(["e","v","m"] as const).map(k=><Field key={k} label={`GCS ${k.toUpperCase()}`}><select className={input} name={`gcs${k.toUpperCase()}`} defaultValue={hrec(editHour)?.gcs?.[k]??vital(editHour)?.gcs?.[k]??""}><option value="" />{Array.from({length:k==="e"?4:k==="v"?5:6},(_,i)=><option key={i+1}>{i+1}</option>)}{k==="v"&&<option>T</option>}</select></Field>)}
        <Field label="CAM-ICU"><select name="camIcu" className={input} defaultValue={hrec(editHour)?.camIcu??""}>{["","陰性","陽性","評価不能"].map(x=><option key={x}>{x}</option>)}</select></Field>
        <label><input name="arterialLine" type="checkbox" defaultChecked={hrec(editHour)?.arterialLine}/>動脈ライン</label>
        {([['pupilRight','右瞳孔 mm'],['pupilLeft','左瞳孔 mm']] as const).map(([k,l],i)=><Field key={k} label={l}><input name={k} className={input} type="number" min="0" step="0.1" defaultValue={i?hrec(editHour)?.pupils?.left:hrec(editHour)?.pupils?.right}/></Field>)}
        {['reactRight','reactLeft'].map((k,i)=><Field key={k} label={`${i?'左':'右'}対光反射`}><select name={k} className={input} defaultValue={i?hrec(editHour)?.pupils?.reactLeft:hrec(editHour)?.pupils?.reactRight}>{['+','-','遅'].map(x=><option key={x}>{x}</option>)}</select></Field>)}
      </div><Field label="記録"><input className={input} name="note" defaultValue={hrec(editHour)?.note}/></Field><button className={button}>保存</button> <button type="button" className={button} onClick={()=>setEditHour(null)}>閉じる</button></form>}
  </>;
}
