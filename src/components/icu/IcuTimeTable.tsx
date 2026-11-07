"use client";

import { useState } from "react";
import type { ReactNode, FormEvent } from "react";
import { addDays, formatShort } from "@/lib/dates";
import { abs } from "@/lib/flowsheet";
import { ventAt, rateAt, doseText, hourlyBalance, mapWithMeasured, MAP_HINT, BALANCE_HINT } from "@/lib/icu";
import type { HourlyRecord } from "@/lib/icu";
import { DayNav } from "../DayNav";
import { Field, button, input, n, s, show, stamp, type IcuPaneProps } from "./parts";

const hourlyFields=[['map','MAP mmHg'],['cvp','CVP mmHg'],['rass','RASS'],['cpot','CPOT'],['urineMl','尿量 mL'],['drainMl','ドレーン mL'],['gastricMl','胃管 mL'],['stoolMl','便 mL'],['bloodLossMl','出血 mL'],['enteralMl','経腸 mL'],['otherInMl','その他 IN mL'],['glucose','血糖 mg/dL']] as const;

/** 時間表: 0〜23時の表（バイタル・観察・呼吸器・持続投与・出納）と、セルから開く1時間の記録。 */
export function IcuTimeTable(p:IcuPaneProps&{day:number;setDay(day:number):void}) {
  const {patient,records,me,today,now,nurse,day,setDay,commit,permit,setError,newId}=p;
  const [editHour,setEditHour]=useState<number|null>(null);
  const [formula,setFormula]=useState("");
  const infusions=records.infusions.filter(i=>i.patientId===patient.id);
  const balances=hourlyBalance(patient,records,day,now);
  const hours=Array.from({length:24},(_,h)=>h);
  const hourAt=(h:number)=>abs(day,`${String(h).padStart(2,"0")}:59`);
  // The record of the column "H時": the last one in the hour that ends at H:00 (as hourlyBalance counts it).
  const hourRecs=(h:number)=>{const end=abs(day,`${String(h).padStart(2,"0")}:00`);return records.hourly.filter(r=>r.patientId===patient.id&&abs(r.at.day,r.at.time)>end-60&&abs(r.at.day,r.at.time)<=end).sort((a,b)=>abs(a.at.day,a.at.time)-abs(b.at.day,b.at.time));};
  const hrec=(h:number)=>hourRecs(h).at(-1);
  const vital=(h:number)=>patient.vitals.filter(v=>v.day===day&&Number(v.time.slice(0,2))===h).sort((a,b)=>a.time.localeCompare(b.time)).at(-1);
  function saveHourly(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();if(!permit(nurse,"vitals")||editHour===null)return;
    const f=new FormData(e.currentTarget),old=hrec(editHour);
    const row:HourlyRecord={...old,id:old?.id??newId(),patientId:patient.id,at:{day,time:`${String(editHour).padStart(2,"0")}:00`},by:me.name};
    for(const [k] of hourlyFields) {const value=n(f,k); if(value!==undefined&&(!Number.isFinite(value)||(k!=="rass"&&value<0)||(k==="rass"&&(value< -5||value>4))||(k==="cpot"&&value>8))){setError("入力値を確かめてください");return;} row[k]=value;}
    row.arterialLine=f.get("arterialLine")==="on";row.camIcu=(s(f,"camIcu")||undefined) as HourlyRecord["camIcu"];
    const right=n(f,"pupilRight"),left=n(f,"pupilLeft");
    row.pupils=right!==undefined&&left!==undefined?{right,left,reactRight:s(f,"reactRight") as "+",reactLeft:s(f,"reactLeft") as "+"}:undefined;
    row.note=s(f,"note");
    commit({...records,hourly:[...records.hourly.filter(r=>r.id!==row.id),row]},"時間記録",`${stamp(row.at)} 尿量 ${row.urineMl??"—"}mL`);setEditHour(null);
  }
  const tableRow=(label:string,cell:(h:number)=>ReactNode)=><tr key={label}><th className="sticky left-0 z-10 bg-sheet border border-rule text-left px-2 min-w-32">{label}</th>{hours.map(h=><td key={h} className="border border-rule text-center min-w-11 h-8"><button type="button" className="w-full h-full px-1 hover:bg-ai-soft" aria-label={`${h}時 ${label}`} onClick={()=>{if(permit(nurse,"vitals")){setEditHour(h);setError("");}}}>{cell(h)??"—"}</button></td>)}</tr>;
  return <>
      <DayNav day={day} min={Math.min(-30,patient.admittedOn)} max={0} onChange={d=>{setDay(d);setEditHour(null);}} fmtDay={d=>today?formatShort(addDays(today,d)):`${d}日`}/>
      <div className="overflow-x-auto max-w-full"><table className="border-collapse text-[11px] nums"><thead><tr><th className="sticky left-0 bg-sheet">時刻</th>{hours.map(h=><th key={h} className="min-w-11">{h}</th>)}</tr></thead><tbody>
        {tableRow("HR",h=>vital(h)?.hr)}
        {tableRow("血圧 / MAP",h=>{const v=vital(h),m=mapWithMeasured(hrec(h),v?.sbp,v?.dbp);return v?.sbp!==undefined||m!==null?<>{v?.sbp??"—"}/{v?.dbp??"—"}<br/>MAP {m??"—"}</>:null;})}
        {([['spo2','SpO2'],['rr','RR'],['bt','BT']] as const).map(([k,l])=>tableRow(l,h=>vital(h)?.[k]))}
        {([['cvp','CVP'],['rass','RASS'],['cpot','CPOT'],['camIcu','CAM-ICU']] as const).map(([k,l])=>tableRow(l,h=>hrec(h)?.[k]))}
        {tableRow("瞳孔",h=>{const x=hrec(h)?.pupils;return x?`${x.right}${x.reactRight}/${x.left}${x.reactLeft}`:null;})}
        {tableRow("GCS",h=>{const g=vital(h)?.gcs;return g?`E${g.e??"—"}V${g.v??"—"}M${g.m??"—"}`:null;})}
        {tableRow("呼吸器 / FiO2 / PEEP",h=>{const v=ventAt(records.vents,patient.id,hourAt(h));return v?<>{v.mode}<br/>{v.fio2} / {v.peep??"—"}</>:null;})}
        {infusions.map(i=><tr key={i.id}><th className="sticky left-0 bg-sheet border border-rule text-left px-2">{i.name}</th>{hours.map(h=>{const text=doseText(i,hourAt(h));return <td key={h} className="border border-rule min-w-11 text-center"><button type="button" title={text} className="px-1" onClick={()=>setFormula(text)}>{text.split("（")[0]}{text!=="—"&&<span className="block">{rateAt(i,hourAt(h))?.toFixed(1)}mL/h</span>}</button></td>;})}</tr>)}
        {([['urineMl','尿量'],['drainMl','ドレーン'],['gastricMl','胃管'],['otherOutMl','その他 OUT'],['infusionMl','IN 持続投与'],['enteralMl','IN 経腸'],['otherInMl','IN その他'],['netMl','時間差'],['cumulativeMl','0時から累積'],['sinceAdmissionMl','入室から累積']] as const).map(([k,l])=>tableRow(l,h=>{
          const fields:Partial<Record<typeof k,(keyof HourlyRecord)[]>>={urineMl:['urineMl'],drainMl:['drainMl'],gastricMl:['gastricMl'],otherOutMl:['stoolMl','bloodLossMl'],enteralMl:['enteralMl'],otherInMl:['otherInMl']};
          const keys=fields[k];
          if(keys&&!hourRecs(h).some(r=>keys.some(key=>r[key]!==undefined)))return null;
          return balances[h].recorded||k==="cumulativeMl"||k==="sinceAdmissionMl"?show(balances[h][k]):null;
        }))}
      </tbody></table></div>
      {formula&&<div><button className={button} onClick={()=>setFormula("")}>式を閉じる</button><p className="hint">{formula}</p></div>}
      <p hidden className="hint">{MAP_HINT} {BALANCE_HINT} γ = μg/kg/分。FiO2 は採血時以前の最後の設定。設定なし・mode「なし」は不明。</p>
      {editHour!==null&&<form key={`${day}-${editHour}`} onSubmit={saveHourly} className="border border-rule rounded p-3 space-y-2"><b>{editHour}時の記録</b><div className="grid grid-cols-2 gap-2">{hourlyFields.map(([k,l])=><Field key={k} label={l}><input className={input} name={k} type="number" step="any" min={k==="rass"?-5:0} max={k==="rass"?4:k==="cpot"?8:undefined} defaultValue={hrec(editHour)?.[k]}/></Field>)}
        <Field label="CAM-ICU"><select name="camIcu" className={input} defaultValue={hrec(editHour)?.camIcu??""}>{["","陰性","陽性","評価不能"].map(x=><option key={x}>{x}</option>)}</select></Field>
        <label><input name="arterialLine" type="checkbox" defaultChecked={hrec(editHour)?.arterialLine}/>動脈ライン</label>
        {([['pupilRight','右瞳孔 mm'],['pupilLeft','左瞳孔 mm']] as const).map(([k,l],i)=><Field key={k} label={l}><input name={k} className={input} type="number" min="0" step="0.1" defaultValue={i?hrec(editHour)?.pupils?.left:hrec(editHour)?.pupils?.right}/></Field>)}
        {['reactRight','reactLeft'].map((k,i)=><Field key={k} label={`${i?'左':'右'}対光反射`}><select name={k} className={input} defaultValue={i?hrec(editHour)?.pupils?.reactLeft:hrec(editHour)?.pupils?.reactRight}>{['+','-','遅'].map(x=><option key={x}>{x}</option>)}</select></Field>)}
      </div><Field label="記録"><input className={input} name="note" defaultValue={hrec(editHour)?.note}/></Field><button className={button}>保存</button> <button type="button" className={button} onClick={()=>setEditHour(null)}>閉じる</button></form>}
  </>;
}
