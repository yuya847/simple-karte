"use client";

import { useState } from "react";
import { DRUGS } from "@/lib/master";
import { infusionDraft, infusionRateChangeDraft, infusionStopDraft } from "@/lib/icu/infusion-orders";
import type { Draft } from "@/lib/drafts";
import type { OrderEntry } from "@/lib/types";
import { abs } from "@/lib/flowsheet";
import { rateAt, concentrationMgPerMl, doseText, mlPerHFromDose } from "@/lib/icu";
import type { Infusion } from "@/lib/icu";
import { Field, button, input, n, s, show, stamp, when, type IcuPaneProps } from "./parts";

const units:Infusion["doseUnit"][]=["γ","mg/h","μg/h","mL/h","単位/h","mg/kg/h"];

/**
 * 持続投与: 薬ごとのいまの量（γ などはコードで計算）、速さの変更・終了、新しい持続投与。医師の変更・開始・終了は
 * 注射のオーダ（onOrder）にもなる。
 */
export function IcuInfusionPane(p:IcuPaneProps&{entries?:OrderEntry[];onOrder?:(drafts:Draft[])=>void}) {
  const {patient,records,me,today,nowTime,at,now,doc,pump,commit,permit,setError,newId}=p;
  const [newInf,setNewInf]=useState(false);
  const [changing,setChanging]=useState<string|null>(null);
  const [ending,setEnding]=useState<string|null>(null);
  const [draft,setDraft]=useState({name:"",amount:5,volume:50,kg:patient.weightKg,unit:"γ" as Infusion["doseUnit"],target:0.1});
  const [target,setTarget]=useState(0);
  const entryOf=(i:Infusion)=>(p.entries??patient.history.filter((e):e is OrderEntry=>e.kind==="order")).find(e=>e.id===i.orderId);
  const infusions=records.infusions.filter(i=>i.patientId===patient.id);
  const preview=mlPerHFromDose(draft.target,draft.amount/draft.volume,draft.kg,draft.unit);
  return <>
      {infusions.map(i=>{const active=rateAt(i,now)!==null;return <div key={i.id} className="border border-rule rounded p-2 space-y-2"><b>{i.name}</b>　{i.amountMg}{i.doseUnit==='単位/h'?'単位':'mg'}/{i.volumeMl}mL<p>{doseText(i,now)}</p>{i.end&&<p>終了 {when(i.end,today)} {i.by}</p>}
        {active&&pump&&<button className={button} onClick={()=>{setChanging(i.id);setTarget(doc?0:rateAt(i,now)??0);}}>{doc?"速さを変える":"ポンプの速さを記録"}</button>} {active&&doc&&<button className={button} onClick={()=>setEnding(i.id)}>終了</button>}
        {changing===i.id&&<form onSubmit={e=>{e.preventDefault();if(!permit(doc||pump,doc?'order':'mar'))return;const f=new FormData(e.currentTarget),rate=doc?mlPerHFromDose(target,concentrationMgPerMl(i)??0,i.weightKg,i.doseUnit):target;if(rate===null||!Number.isFinite(rate)||rate<0){setError('入力値を確かめてください');return;}const next={...i,changes:[...i.changes,{at,rateMlPerH:rate,by:me.name,reason:s(f,'reason')}]};commit({...records,infusions:records.infusions.map(x=>x.id===i.id?next:x)},'持続投与の速さ',doseText(next,now));if(doc){const entry=entryOf(i);p.onOrder?.([entry?infusionRateChangeDraft(entry,next,rate,at,me.name,newId()):infusionDraft(next,me.name,newId())]);}setChanging(null);}} className="space-y-2"><Field label={doc?i.doseUnit:'mL/h'}><input className={input} type="number" step="any" min="0" required value={target} onChange={e=>setTarget(Number(e.target.value))}/></Field><output>{doc?`${show(mlPerHFromDose(target,concentrationMgPerMl(i)??0,i.weightKg,i.doseUnit))}mL/h`:doseText({...i,changes:[...i.changes,{at,rateMlPerH:target,by:me.name}]},now)}</output><Field label="理由"><input className={input} name="reason" required={doc}/></Field><button className={button}>速さを保存</button></form>}
        {ending===i.id&&<form onSubmit={e=>{e.preventDefault();if(!permit(doc,'order'))return;const f=new FormData(e.currentTarget),end={day:n(f,'day')!,time:s(f,'time')};if(abs(end.day,end.time)<abs(i.start.day,i.start.time)){setError('開始以後の日時を入れてください');return;}commit({...records,infusions:records.infusions.map(x=>x.id===i.id?{...x,end}:x)},'持続投与の終了',`${i.name} ${stamp(end)} ${me.name}`);const entry=entryOf(i);if(entry)p.onOrder?.([infusionStopDraft(entry,end,me.name,newId())]);setEnding(null);}}><Field label="終了日（今日=0）"><input className={input} type="number" name="day" max="0" required defaultValue="0"/></Field><Field label="終了時刻"><input className={input} type="time" name="time" required defaultValue={nowTime}/></Field><button className={button}>終了を保存</button></form>}
        <details><summary>速さの履歴</summary>{i.changes.map((c,j)=><p key={j}>{when(c.at,today)}　{c.rateMlPerH}mL/h　{c.by}　{c.reason}</p>)}</details>
      </div>;})}
      {doc&&<button className={button} onClick={()=>setNewInf(!newInf)}>新しい持続投与</button>}
      {doc&&newInf&&<form className="space-y-2 border border-rule p-3" onSubmit={e=>{e.preventDefault();if(!permit(doc,'order'))return;if(!draft.name.trim()||preview===null||draft.amount<=0||draft.volume<=0||draft.kg<=0){setError('薬・溶液・体重・値を確かめてください');return;}const drug=DRUGS.find(d=>d.name===draft.name.trim())??DRUGS.find(d=>`${d.name} ${d.generic??''}`.normalize('NFKC').includes(draft.name.trim().normalize('NFKC')));if(!drug){setError('薬・溶液・体重・値を確かめてください');return;}const i:Infusion={id:newId(),patientId:patient.id,drugCode:drug.code,name:draft.name.trim(),amountMg:draft.amount,volumeMl:draft.volume,doseUnit:draft.unit,weightKg:draft.kg,start:at,by:me.name,changes:[{at,rateMlPerH:preview,by:me.name}]};commit({...records,infusions:[...records.infusions,i]},'持続投与の開始',`${i.name} ${doseText(i,now)}`);p.onOrder?.([infusionDraft(i,me.name,newId())]);setNewInf(false);}}>
        <Field label="薬の名前"><input className={input} required value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></Field><div className="grid grid-cols-2 gap-2">{([['amount',draft.unit==='単位/h'?'薬剤量 単位':'薬剤量 mg'],['volume','総量 mL'],['kg','体重 kg'],['target','目標の値']] as const).map(([k,l])=><Field key={k} label={l}><input className={input} type="number" min={k==='target'?0:0.000001} step="any" required value={draft[k]} onChange={e=>setDraft({...draft,[k]:Number(e.target.value)})}/></Field>)}<Field label="指示の単位"><select className={input} value={draft.unit} onChange={e=>setDraft({...draft,unit:e.target.value as Infusion['doseUnit']})}>{units.map(u=><option key={u}>{u}</option>)}</select></Field></div><output className="block">{preview===null?'—':`${preview.toFixed(1)}mL/h`}</output><p hidden className="hint">濃度 = 薬剤量 ÷ 総量。γ からの逆算 = γ × kg ×60 ÷（mg/mL ×1000）。mg/h・単位/h は濃度で割り、μg/h は濃度×1000で割り、mg/kg/h は体重を掛けて濃度で割ります。内部は丸めず計算し、表示だけ丸めます。</p><button className={button}>確定</button></form>}
  </>;
}
