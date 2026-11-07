"use client";

import type { FormEvent } from "react";
import { abs } from "@/lib/flowsheet";
import { abgRows, ventAt } from "@/lib/icu";
import type { VentSetting } from "@/lib/icu";
import { Field, button, input, n, s, when, type IcuPaneProps } from "./parts";

const modes:VentSetting["mode"][]=["A/C-VC","A/C-PC","SIMV","PSV","CPAP","NPPV","HFNC","なし"];
const airways:VentSetting["airway"][]=["経口挿管","気管切開","マスク","鼻カニュラ","なし"];

/** 呼吸器・血液ガス: いまの設定と履歴、医師の新しい設定、実測、血液ガスと P/F。 */
export function IcuVentPane(p:IcuPaneProps) {
  const {patient,records,me,today,at,now,doc,measured,commit,permit,newId}=p;
  const vent=ventAt(records.vents,patient.id,now);
  function saveVent(e:FormEvent<HTMLFormElement>,actual=false) {
    e.preventDefault();if(!permit(actual?measured:doc,actual?"vitals":"order"))return;
    if(actual&&!vent)return;
    const f=new FormData(e.currentTarget);
    const row:VentSetting=actual?{...vent!,id:newId(),at,by:me.name,measured:{}}:{id:newId(),patientId:patient.id,at,by:me.name,mode:s(f,"mode") as VentSetting["mode"],airway:s(f,"airway") as VentSetting["airway"],fio2:n(f,"fio2")!};
    if(actual) {for(const k of ["ppeak","pplat","vte","rrTotal","etco2","mv"] as const)row.measured![k]=n(f,k);}
    else {for(const k of ["peep","ps","vt","pc","rr","flow","tubeCm"] as const)row[k]=n(f,k);}
    commit({...records,vents:[...records.vents,row]},actual?"呼吸器の実測":"呼吸器の設定",`${row.mode} FiO2 ${row.fio2}`);
  }
  return <>
      <b>いまの設定</b>{vent?<div className="grid grid-cols-2 gap-1">{Object.entries({mode:vent.mode,airway:vent.airway,FiO2:vent.fio2,PEEP:vent.peep,PS:vent.ps,VT:vent.vt,PC:vent.pc,RR:vent.rr,flow:vent.flow,tubeCm:vent.tubeCm,...vent.measured}).filter(([,v])=>v!==undefined).map(([k,v])=><p key={k}>{k}　{v}</p>)}</div>:<p>—</p>}
      <details><summary>設定の履歴</summary>{records.vents.filter(v=>v.patientId===patient.id).sort((a,b)=>abs(b.at.day,b.at.time)-abs(a.at.day,a.at.time)).map(v=><p key={v.id}>{when(v.at,today)}　{v.mode}　FiO2 {v.fio2}　PEEP {v.peep??"—"}　{v.by}{v.measured&&` 実測 ${JSON.stringify(v.measured)}`}</p>)}</details>
      {doc&&<form onSubmit={e=>saveVent(e)} className="border border-rule p-2 space-y-2"><b>新しい設定</b><div className="grid grid-cols-2 gap-2"><Field label="mode"><select name="mode" className={input} defaultValue={vent?.mode??"A/C-PC"}>{modes.map(m=><option key={m}>{m}</option>)}</select></Field><Field label="airway"><select name="airway" className={input} defaultValue={vent?.airway??"経口挿管"}>{airways.map(m=><option key={m}>{m}</option>)}</select></Field><Field label="FiO2"><input name="fio2" className={input} type="number" min="0.21" max="1" step="0.01" required defaultValue={vent?.fio2}/></Field>{([['peep','PEEP cmH2O'],['ps','PS cmH2O'],['vt','VT mL'],['pc','PC cmH2O'],['rr','RR /分'],['flow','HFNC L/分'],['tubeCm','チューブ cm']] as const).map(([k,l])=><Field key={k} label={l}><input name={k} className={input} type="number" min="0" step="any" defaultValue={vent?.[k]}/></Field>)}</div><button className={button}>設定を保存</button></form>}
      {measured&&vent&&<form onSubmit={e=>saveVent(e,true)} className="border border-rule p-2 space-y-2"><b>実測</b><div className="grid grid-cols-2 gap-2">{[['ppeak','Ppeak cmH2O'],['pplat','Pplat cmH2O'],['vte','VTe mL'],['rrTotal','総RR /分'],['etco2','EtCO2 mmHg'],['mv','MV L/分']].map(([k,l])=><Field key={k} label={l}><input className={input} name={k} type="number" step="any" min="0"/></Field>)}</div><button className={button}>実測を保存</button></form>}
      <p hidden className="hint">架空の病院の取り決め：設定は医師、実測は医師・看護師・臨床工学技士。P/F = PaO2 ÷ FiO2（整数）。採血時の設定が不明なら算出しません。「なし」から室内気 0.21 を推定しません。</p>
      <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr>{['採血','pH','PaO2','PaCO2','HCO3','Lac','FiO2','P/F'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{abgRows(patient,records.vents).map((r,i)=><tr key={i}><td>{when(r,today)}</td>{['pH','PaO2','PaCO2','HCO3','Lac'].map(k=><td key={k}>{r.values[k]??"—"}</td>)}<td>{r.fio2??"—"}</td><td>{r.pf??"—"}</td></tr>)}</tbody></table></div>
  </>;
}
