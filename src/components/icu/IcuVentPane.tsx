"use client";

import type { FormEvent, ReactNode, SyntheticEvent } from "react";
import { abs } from "@/lib/flowsheet";
import { abgRows, ventAt, mgPerDlToMmolPerL, LACTATE_HINT } from "@/lib/icu";
import type { VentSetting } from "@/lib/icu";
import { useWindowEntry } from "@/lib/window-entry";
import { Field, button, input, n, s, when, type IcuPaneProps } from "./parts";

const modes:VentSetting["mode"][]=["A/C-VC","A/C-PC","SIMV","PSV","CPAP","NPPV","HFNC","なし"];
const airways:VentSetting["airway"][]=["経口挿管","気管切開","マスク","鼻カニュラ","なし"];
type Measured=NonNullable<VentSetting["measured"]>;
/** The form's fields (name, label as before) and how the boxes and the history show them (name, unit). */
const settingFields=[['peep','PEEP cmH2O','PEEP','cmH2O'],['ps','PS cmH2O','PS','cmH2O'],['vt','VT mL','VT','mL'],['pc','PC cmH2O','PC','cmH2O'],['rr','RR /分','RR','/分'],['flow','HFNC L/分','流量','L/分'],['tubeCm','チューブ cm','チューブ','cm']] as const;
const measuredFields=[['ppeak','Ppeak cmH2O','Ppeak','cmH2O'],['pplat','Pplat cmH2O','Pplat','cmH2O'],['vte','VTe mL','VTe','mL'],['rrTotal','総RR /分','総 RR','/分'],['etco2','EtCO2 mmHg','EtCO2','mmHg'],['mv','MV L/分','MV','L/分']] as const;
const abgHead=[['採血',''],['pH',''],['PaO2','mmHg'],['PaCO2','mmHg'],['HCO3','mmol/L'],['Lac','mg/dL'],['FiO2',''],['P/F','']] as const;
const t=(a:{day:number;time:string})=>abs(a.day,a.time);
const hasMeasured=(v:VentSetting)=>!!v.measured&&Object.values(v.measured).some(x=>x!==undefined);
const str=(v:number|string|undefined)=>v===undefined?"":String(v);

const Unit=({children}:{children:ReactNode})=><span className="ml-0.5 text-[10px] text-ink-soft">{children}</span>;
function Item({label,unit,children}:{label:string;unit?:string;children:ReactNode}) {
  return <div className="flex items-baseline gap-2"><dt className="w-16 shrink-0 text-xs text-ink-soft">{label}</dt><dd className="nums">{children}{unit&&<Unit>{unit}</Unit>}</dd></div>;
}
function Box({title,row,today,children}:{title:string;row:VentSetting|null;today:IcuPaneProps["today"];children:ReactNode}) {
  return <section className="space-y-2 rounded border border-rule bg-sheet p-3">
    <h3 className="flex items-baseline justify-between gap-2"><b>{title}</b>{row&&<span className="nums text-xs text-ink-soft">{when(row.at,today)}　{row.by}</span>}</h3>
    {children}
  </section>;
}
/** 「Ppeak 22 cmH2O・VTe 420 mL」 for the history. */
const measuredText=(m:Measured)=>measuredFields.filter(([k])=>m[k]!==undefined).map(([k,,label,unit],i)=><span key={k} className="whitespace-nowrap">{i>0&&"・"}{label} {m[k]}<Unit>{unit}</Unit></span>);

/** 呼吸器・血液ガス: 医師の設定と測った実測を別の箱に、設定と実測の履歴の表、血液ガスと P/F の表。 */
export function IcuVentPane(p:IcuPaneProps) {
  const {patient,records,me,today,at,now,doc,measured,commit,permit,setError,newId}=p;
  const vent=ventAt(records.vents,patient.id,now);
  const rows=records.vents.filter(v=>v.patientId===patient.id).sort((a,b)=>t(b.at)-t(a.at));
  const past=rows.filter(v=>t(v.at)<=now);
  const setting=past.find(v=>!v.measured)??null;
  const lastMeasured=past.find(hasMeasured)??null;
  // What is being typed stays when the tab changes (per patient, in the workspace).
  const [open,setOpen]=useWindowEntry<{setting?:boolean;measured?:boolean;history?:boolean}>("icu-vent-open",{});
  const [settingDraft,setSettingDraft]=useWindowEntry<Record<string,string>>("icu-vent-setting",{});
  const [measuredDraft,setMeasuredDraft]=useWindowEntry<Record<string,string>>("icu-vent-measured",{});
  const settingValue=(k:string,fallback:number|string|undefined)=>settingDraft[k]??str(fallback);
  const toggle=(k:"setting"|"measured"|"history")=>(e:SyntheticEvent<HTMLDetailsElement>)=>{const v=e.currentTarget.open;if(!!open[k]!==v)setOpen(o=>({...o,[k]:v}));};
  function saveVent(e:FormEvent<HTMLFormElement>,actual=false) {
    e.preventDefault();if(!permit(actual?measured:doc,actual?"vitals":"order"))return;
    if(actual&&!vent)return;
    const f=new FormData(e.currentTarget);
    const row:VentSetting=actual?{...vent!,id:newId(),at,by:me.name,measured:{}}:{id:newId(),patientId:patient.id,at,by:me.name,mode:s(f,"mode") as VentSetting["mode"],airway:s(f,"airway") as VentSetting["airway"],fio2:n(f,"fio2")!};
    if(actual) {for(const [k] of measuredFields)row.measured![k]=n(f,k);if(!hasMeasured(row)){setError("実測の値を入れてください");return;}}
    else {for(const [k] of settingFields)row[k]=n(f,k);}
    commit({...records,vents:[...records.vents,row]},actual?"呼吸器の実測":"呼吸器の設定",`${row.mode} FiO2 ${row.fio2}`);
    if(actual){setMeasuredDraft({});setOpen(o=>({...o,measured:false}));}else{setSettingDraft({});setOpen(o=>({...o,setting:false}));}
  }
  return <div className="space-y-3">
    <div className="grid gap-3 md:grid-cols-2">
      <Box title="設定" row={setting} today={today}>
        {setting?<dl className="grid grid-cols-2 gap-x-4 gap-y-1">
          <Item label="mode">{setting.mode}</Item><Item label="気道">{setting.airway}</Item><Item label="FiO2">{setting.fio2}</Item>
          {settingFields.filter(([k])=>setting[k]!==undefined).map(([k,,label,unit])=><Item key={k} label={label} unit={unit}>{setting[k]}</Item>)}
        </dl>:<p>—</p>}
        {doc&&<details open={!!open.setting} onToggle={toggle("setting")}><summary className="cursor-pointer text-xs text-ai">新しい設定</summary>
          <form onSubmit={e=>saveVent(e)} className="mt-2 space-y-2"><div className="grid grid-cols-2 gap-2">
            <Field label="mode"><select name="mode" className={input} value={settingValue("mode",vent?.mode??"A/C-PC")} onChange={e=>setSettingDraft(d=>({...d,mode:e.target.value}))}>{modes.map(m=><option key={m}>{m}</option>)}</select></Field>
            <Field label="airway"><select name="airway" className={input} value={settingValue("airway",vent?.airway??"経口挿管")} onChange={e=>setSettingDraft(d=>({...d,airway:e.target.value}))}>{airways.map(m=><option key={m}>{m}</option>)}</select></Field>
            <Field label="FiO2"><input name="fio2" className={input} type="number" min="0.21" max="1" step="0.01" required value={settingValue("fio2",vent?.fio2)} onChange={e=>setSettingDraft(d=>({...d,fio2:e.target.value}))}/></Field>
            {settingFields.map(([k,l])=><Field key={k} label={l}><input name={k} className={input} type="number" min="0" step="any" value={settingValue(k,vent?.[k])} onChange={e=>setSettingDraft(d=>({...d,[k]:e.target.value}))}/></Field>)}
          </div><button className={button}>設定を保存</button></form>
        </details>}
      </Box>
      <Box title="実測" row={lastMeasured} today={today}>
        {lastMeasured?<dl className="grid grid-cols-2 gap-x-4 gap-y-1">
          {measuredFields.filter(([k])=>lastMeasured.measured![k]!==undefined).map(([k,,label,unit])=><Item key={k} label={label} unit={unit}>{lastMeasured.measured![k]}</Item>)}
        </dl>:<p>—</p>}
        {measured&&vent&&<details open={!!open.measured} onToggle={toggle("measured")}><summary className="cursor-pointer text-xs text-ai">実測を記録</summary>
          <form onSubmit={e=>saveVent(e,true)} className="mt-2 space-y-2"><div className="grid grid-cols-2 gap-2">
            {measuredFields.map(([k,l])=><Field key={k} label={l}><input className={input} name={k} type="number" step="any" min="0" value={measuredDraft[k]??""} onChange={e=>setMeasuredDraft(d=>({...d,[k]:e.target.value}))}/></Field>)}
          </div><button className={button}>実測を保存</button></form>
        </details>}
      </Box>
    </div>
    {rows.length>0&&<details open={!!open.history} onToggle={toggle("history")}><summary className="cursor-pointer">設定・実測の履歴</summary>
      <div className="overflow-x-auto"><table className="nums mt-1 text-xs">
        <thead><tr className="text-left text-ink-soft">{[['時刻',''],['mode',''],['FiO2',''],['PEEP','cmH2O'],['VT/PC/PS',''],['RR','/分'],['実測',''],['記録者','']].map(([h,u])=><th key={h} className="whitespace-nowrap px-2 py-1 font-normal">{h}{u&&<Unit>{u}</Unit>}</th>)}</tr></thead>
        <tbody>{rows.map(v=>{const m=!!v.measured;return <tr key={v.id} className="border-t border-rule align-top">
          <td className="whitespace-nowrap px-2 py-1">{when(v.at,today)}</td>
          {m?<td colSpan={5}/>:<>
            <td className="whitespace-nowrap px-2 py-1">{v.mode}{v.flow!==undefined&&<> {v.flow}<Unit>L/分</Unit></>}</td>
            <td className="px-2 py-1 text-right">{v.fio2}</td>
            <td className="px-2 py-1 text-right">{v.peep}</td>
            <td className="whitespace-nowrap px-2 py-1">{([['vt','VT','mL'],['pc','PC','cmH2O'],['ps','PS','cmH2O']] as const).filter(([k])=>v[k]!==undefined).map(([k,l,u],i)=><span key={k}>{i>0&&"・"}{l} {v[k]}<Unit>{u}</Unit></span>)}</td>
            <td className="px-2 py-1 text-right">{v.rr}</td>
          </>}
          <td className="px-2 py-1">{m&&measuredText(v.measured!)}</td>
          <td className="whitespace-nowrap px-2 py-1">{v.by}</td>
        </tr>;})}</tbody>
      </table></div>
    </details>}
    <p hidden className="hint">架空の病院の取り決め：設定は医師、実測は医師・看護師・臨床工学技士。P/F = PaO2 ÷ FiO2（整数）。採血時の設定が不明なら算出しません。「なし」から室内気 0.21 を推定しません。</p>
    <section className="space-y-1"><b>血液ガス</b>
      <div className="overflow-x-auto"><table className="nums text-xs">
        <thead><tr className="text-ink-soft">{abgHead.map(([h,u],i)=><th key={h} className={`whitespace-nowrap px-2 py-1 font-normal ${i===0?"text-left":"text-right"}`}>{h}{u&&<Unit>{u}</Unit>}</th>)}</tr></thead>
        <tbody>{abgRows(patient,records.vents).map((r,i)=><tr key={i} className="border-t border-rule">
          <td className="whitespace-nowrap px-2 py-1">{when(r,today)}</td>
          {(['pH','PaO2','PaCO2','HCO3'] as const).map(k=><td key={k} className="px-2 py-1 text-right">{r.values[k]??"—"}</td>)}
          <td className="whitespace-nowrap px-2 py-1 text-right">{r.values.Lac??"—"}{r.values.Lac!==undefined&&<span className="ml-1 text-[10px] text-ink-soft">{mgPerDlToMmolPerL(r.values.Lac)} mmol/L</span>}</td>
          <td className="px-2 py-1 text-right">{r.fio2??"—"}</td><td className="px-2 py-1 text-right">{r.pf??"—"}</td>
        </tr>)}</tbody>
      </table></div>
      <p hidden className="hint">{LACTATE_HINT}</p>
    </section>
  </div>;
}
