"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { DRUGS } from "@/lib/master";
import { infusionDraft, infusionRateChangeDraft, infusionStopDraft } from "@/lib/icu/infusion-orders";
import type { Draft } from "@/lib/drafts";
import type { OrderEntry } from "@/lib/types";
import { abs } from "@/lib/flowsheet";
import { rateAt, concentrationMgPerMl, doseText, mlPerHFromDose } from "@/lib/icu";
import type { Infusion } from "@/lib/icu";
import { useWindowEntry } from "@/lib/window-entry";
import { Field, button, input, show, stamp, when, type IcuPaneProps } from "./parts";

const units:Infusion["doseUnit"][]=["γ","mg/h","μg/h","mL/h","単位/h","mg/kg/h"];
/** 注射オーダの状態の札の色。 */
const orderTone:Record<OrderEntry["status"],string>={有効:"border-wakatake text-wakatake",中止:"border-shu text-shu",終了:"border-rule text-ink-soft",実施済:"border-rule text-ink-soft"};

/** 入れかけの値（タブを替えても残す）。 */
interface NewDraft { open: boolean; name: string; amount: number; volume: number; kg: number; unit: Infusion["doseUnit"]; target: number }
interface ChangeDraft { id: string; target: number; reason: string }
interface EndDraft { id: string; day: string; time: string }

/**
 * 持続投与: 薬ごとのいまの量（γ などはコードで計算）、速さの変更・終了、新しい持続投与。医師の変更・開始・終了は
 * 注射のオーダ（onOrder）にもなる。
 */
export function IcuInfusionPane(p:IcuPaneProps&{entries?:OrderEntry[];onOrder?:(drafts:Draft[])=>void}) {
  const {patient,records,role,me,today,nowTime,at,now,doc,pump,commit,permit,setError,newId}=p;
  const scope=`${patient.id}:${role}`;
  const fresh=():NewDraft=>({open:false,name:"",amount:5,volume:50,kg:patient.weightKg,unit:"γ",target:0.1});
  const [draft,setDraft]=useWindowEntry<NewDraft>("icu-infusion-new",fresh,scope);
  const [changing,setChanging]=useWindowEntry<ChangeDraft|null>("icu-infusion-change",null,scope);
  const [ending,setEnding]=useWindowEntry<EndDraft|null>("icu-infusion-end",null,scope);
  const [formula,setFormula]=useState<string|null>(null);
  const entryOf=(i:Infusion)=>(p.entries??patient.history.filter((e):e is OrderEntry=>e.kind==="order")).find(e=>e.id===i.orderId);
  const infusions=records.infusions.filter(i=>i.patientId===patient.id);
  const ended=(i:Infusion)=>!!i.end&&abs(i.end.day,i.end.time)<=now;
  const preview=mlPerHFromDose(draft.target,draft.amount/draft.volume,draft.kg,draft.unit);
  const box=(i:Infusion)=>{
    const rate=rateAt(i,now),active=rate!==null,text=doseText(i,now),open=formula===i.id,entry=i.orderId?entryOf(i):undefined;
    return <div key={i.id} className="border border-rule rounded p-2 space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <b>{i.name}</b>
        <span className="text-ink-soft">溶液（{i.amountMg}{i.doseUnit==='単位/h'?'単位':'mg'}/{i.volumeMl}mL）</span>
        {rate!==null&&<span className="relative">いまの速さ <b className="nums">{rate.toFixed(1)}</b> mL/h{i.doseUnit!=="mL/h"&&text!=="—"&&<>{" ＝ "}<button type="button" aria-expanded={open} className="rounded px-0.5 font-bold nums underline decoration-dotted underline-offset-2 hover:bg-ai-soft" onClick={()=>setFormula(open?null:i.id)}>{text.split("（")[0]}</button></>}
          {open&&<span className="absolute left-0 top-full z-20 mt-0.5 block w-max max-w-96 rounded-md border border-rule bg-sheet px-2 py-1.5 text-xs leading-snug shadow-md"><button type="button" aria-label="式を閉じる" className="float-right ml-2 text-ink-faint hover:text-ink" onClick={()=>setFormula(null)}><X size={12}/></button>{text}</span>}
        </span>}
        {i.end&&<span>終了 {when(i.end,today)}</span>}
        {entry&&<span className={`rounded border px-1 text-[10px] leading-4 ${orderTone[entry.status]}`}>オーダ {entry.status}</span>}
      </div>
      {(active&&pump||active&&doc)&&<div className="flex gap-2">
        {active&&pump&&<button className={button} onClick={()=>setChanging(changing?.id===i.id?null:{id:i.id,target:doc?0:rate??0,reason:""})}>{doc?"速さを変える":"ポンプの速さを記録"}</button>}
        {active&&doc&&<button className={button} onClick={()=>setEnding(ending?.id===i.id?null:{id:i.id,day:"0",time:nowTime})}>終了</button>}
      </div>}
      {changing?.id===i.id&&<form onSubmit={e=>{e.preventDefault();if(!permit(doc||pump,doc?'order':'mar'))return;const target=changing.target,rate=doc?mlPerHFromDose(target,concentrationMgPerMl(i)??0,i.weightKg,i.doseUnit):target;if(rate===null||!Number.isFinite(rate)||rate<0){setError('入力値を確かめてください');return;}const next={...i,changes:[...i.changes,{at,rateMlPerH:rate,by:me.name,reason:changing.reason}]};commit({...records,infusions:records.infusions.map(x=>x.id===i.id?next:x)},'持続投与の速さ',doseText(next,now));if(doc){const entry=entryOf(i);p.onOrder?.([entry?infusionRateChangeDraft(entry,next,rate,at,me.name,newId()):infusionDraft(next,me.name,newId())]);}setChanging(null);}} className="space-y-2"><Field label={doc?i.doseUnit:'mL/h'}><input className={input} type="number" step="any" min="0" required value={changing.target} onChange={e=>setChanging({...changing,target:Number(e.target.value)})}/></Field><output>{doc?`${show(mlPerHFromDose(changing.target,concentrationMgPerMl(i)??0,i.weightKg,i.doseUnit))}mL/h`:doseText({...i,changes:[...i.changes,{at,rateMlPerH:changing.target,by:me.name}]},now)}</output><Field label="理由"><input className={input} name="reason" required={doc} value={changing.reason} onChange={e=>setChanging({...changing,reason:e.target.value})}/></Field><button className={button}>速さを保存</button></form>}
      {ending?.id===i.id&&<form onSubmit={e=>{e.preventDefault();if(!permit(doc,'order'))return;const end={day:Number(ending.day),time:ending.time};if(!Number.isInteger(end.day)||end.day>0||!end.time){setError('終了の日時を確かめてください');return;}if(abs(end.day,end.time)<abs(i.start.day,i.start.time)){setError('開始以後の日時を入れてください');return;}commit({...records,infusions:records.infusions.map(x=>x.id===i.id?{...x,end}:x)},'持続投与の終了',`${i.name} ${stamp(end)} ${me.name}`);const entry=entryOf(i);if(entry)p.onOrder?.([infusionStopDraft(entry,end,me.name,newId())]);setEnding(null);}}><Field label="終了日（今日=0）"><input className={input} type="number" name="day" max="0" required value={ending.day} onChange={e=>setEnding({...ending,day:e.target.value})}/></Field><Field label="終了時刻"><input className={input} type="time" name="time" required value={ending.time} onChange={e=>setEnding({...ending,time:e.target.value})}/></Field><button className={button}>終了を保存</button></form>}
      <details><summary>速さの履歴</summary>{i.changes.map((c,j)=><p key={j}>{when(c.at,today)}　{c.rateMlPerH}mL/h　{c.by}　{c.reason}</p>)}</details>
    </div>;
  };
  const past=infusions.filter(ended);
  return <>
      {infusions.filter(i=>!ended(i)).map(box)}
      {past.length>0&&<details className="rounded border border-rule p-2"><summary className="cursor-pointer text-ink-soft">終了した持続投与 {past.length} 件</summary><div className="mt-2 space-y-2">{past.map(box)}</div></details>}
      {doc&&<button className={button} onClick={()=>setDraft({...draft,open:!draft.open})}>新しい持続投与</button>}
      {doc&&draft.open&&<form className="space-y-2 border border-rule p-3" onSubmit={e=>{e.preventDefault();if(!permit(doc,'order'))return;if(!draft.name.trim()||preview===null||draft.amount<=0||draft.volume<=0||draft.kg<=0){setError('薬・溶液・体重・値を確かめてください');return;}const drug=DRUGS.find(d=>d.name===draft.name.trim())??DRUGS.find(d=>`${d.name} ${d.generic??''}`.normalize('NFKC').includes(draft.name.trim().normalize('NFKC')));if(!drug){setError('薬・溶液・体重・値を確かめてください');return;}const i:Infusion={id:newId(),patientId:patient.id,drugCode:drug.code,name:draft.name.trim(),amountMg:draft.amount,volumeMl:draft.volume,doseUnit:draft.unit,weightKg:draft.kg,start:at,by:me.name,changes:[{at,rateMlPerH:preview,by:me.name}]};commit({...records,infusions:[...records.infusions,i]},'持続投与の開始',`${i.name} ${doseText(i,now)}`);p.onOrder?.([infusionDraft(i,me.name,newId())]);setDraft(fresh());}}>
        <Field label="薬の名前"><input className={input} required value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></Field><div className="grid grid-cols-2 gap-2">{([['amount',draft.unit==='単位/h'?'薬剤量 単位':'薬剤量 mg'],['volume','総量 mL'],['kg','体重 kg'],['target','目標の値']] as const).map(([k,l])=><Field key={k} label={l}><input className={input} type="number" min={k==='target'?0:0.000001} step="any" required value={draft[k]} onChange={e=>setDraft({...draft,[k]:Number(e.target.value)})}/></Field>)}<Field label="指示の単位"><select className={input} value={draft.unit} onChange={e=>setDraft({...draft,unit:e.target.value as Infusion['doseUnit']})}>{units.map(u=><option key={u}>{u}</option>)}</select></Field></div><output className="block">{preview===null?'—':`${preview.toFixed(1)}mL/h`}</output><p hidden className="hint">濃度 = 薬剤量 ÷ 総量。γ からの逆算 = γ × kg ×60 ÷（mg/mL ×1000）。mg/h・単位/h は濃度で割り、μg/h は濃度×1000で割り、mg/kg/h は体重を掛けて濃度で割ります。内部は丸めず計算し、表示だけ丸めます。</p><button className={button}>確定</button></form>}
  </>;
}
