"use client";

import { useState } from "react";
import { abs } from "@/lib/flowsheet";
import { lineDays, LINE_DAYS_HINT } from "@/lib/icu";
import type { LineDevice } from "@/lib/icu";
import { Field, button, input, n, s, stamp, when, type IcuPaneProps } from "./parts";

const kinds:LineDevice["kind"][]=["CVC","動脈ライン","PICC","末梢静脈","透析用カテーテル","肺動脈カテーテル","気管チューブ","気管切開チューブ","尿道カテーテル","胃管","胸腔ドレーン","腹腔ドレーン","脳室ドレーン","IABP","ECMO","その他"];

/** ライン・チューブ: 入っているものと日数、抜去、新しい挿入の記録。 */
export function IcuLinesPane(p:IcuPaneProps) {
  const {patient,records,me,today,nowTime,nurse,commit,permit,setError,newId}=p;
  const [removing,setRemoving]=useState<string|null>(null);
  const lines=records.lines.filter(l=>l.patientId===patient.id);
  return <>
      {lines.map(l=><div key={l.id} className="border-b border-rule py-2"><b>{l.kind}</b>　{l.site}　{when(l.insertedAt,today)}　<span className={(l.removedAt?.day??0)-l.insertedAt.day+1>=7?'font-bold':''}>{lineDays(l,0)}</span>　{l.spec}　{l.by}
        {!l.removedAt&&nurse&&<button className={button} onClick={()=>setRemoving(l.id)}>抜去</button>}
        {removing===l.id&&<form onSubmit={e=>{e.preventDefault();if(!permit(nurse,'vitals'))return;const f=new FormData(e.currentTarget),removedAt={day:n(f,'day')!,time:s(f,'time')};if(abs(removedAt.day,removedAt.time)<abs(l.insertedAt.day,l.insertedAt.time)){setError('挿入以後の日時を入れてください');return;}commit({...records,lines:records.lines.map(x=>x.id===l.id?{...x,removedAt}:x)},'ラインの抜去',`${l.kind} ${stamp(removedAt)} ${me.name}`);setRemoving(null);}}><Field label="抜去日（今日=0）"><input name="day" className={input} type="number" max="0" required defaultValue="0"/></Field><Field label="抜去時刻"><input name="time" className={input} type="time" required defaultValue={nowTime}/></Field><button className={button}>抜去を保存</button></form>}
      </div>)}
      {nurse&&<details><summary>ラインを記録</summary><form className="space-y-2" onSubmit={e=>{e.preventDefault();if(!permit(nurse,'vitals'))return;const f=new FormData(e.currentTarget);const l:LineDevice={id:newId(),patientId:patient.id,kind:s(f,'kind') as LineDevice['kind'],site:s(f,'site'),insertedAt:{day:n(f,'day')!,time:s(f,'time')},by:me.name,spec:s(f,'spec')};commit({...records,lines:[...records.lines,l]},'ラインの挿入',`${l.kind} ${l.site} ${stamp(l.insertedAt)}`);e.currentTarget.reset();}}><Field label="種類"><select className={input} name="kind">{kinds.map(k=><option key={k}>{k}</option>)}</select></Field><Field label="部位"><input className={input} name="site" required/></Field><Field label="挿入日（今日=0）"><input name="day" className={input} type="number" max="0" required defaultValue="0"/></Field><Field label="挿入時刻"><input name="time" className={input} type="time" required defaultValue={nowTime}/></Field><Field label="太さ・長さ・固定"><input name="spec" className={input}/></Field><button className={button}>挿入を保存</button></form></details>}
      <p hidden className="hint">{LINE_DAYS_HINT}</p>
  </>;
}
