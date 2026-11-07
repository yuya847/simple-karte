"use client";

import { useState } from "react";
import type { ReactNode, FormEvent } from "react";
import type { Patient } from "@/lib/types";
import type { Action, Role, Staff } from "@/lib/roles";
import type { AuditEvent } from "@/lib/audit";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { abs } from "@/lib/flowsheet";
import { abgRows, ventAt, rateAt, concentrationMgPerMl, doseText, mlPerHFromDose, hourlyBalance, mapWithMeasured, sofaFacts, sofaScore, lineDays, checkedToday, FAST_HUG, FAST_HUG_SOURCE, SOFA_SOURCE, SOFA_ORIGINAL, MAP_HINT, BALANCE_HINT, LINE_DAYS_HINT } from "@/lib/icu";
import type { IcuRecords, Infusion, VentSetting, HourlyRecord, LineDevice, RoundCheck } from "@/lib/icu";
import { TabChoice } from "./TabChoice";
import { DayNav } from "./DayNav";

const tabs=["時間表","呼吸器・血液ガス","持続投与","ライン・チューブ","SOFA","回診"] as const;
type Tab=typeof tabs[number];
export interface IcuPanelProps {
  patient: Patient; records: IcuRecords; onChange(next:IcuRecords):void; role:Role; me:Staff;
  today:CalendarDate|null; nowTime:string; deny(action:Action):string|null;
  auditLog(event:Omit<AuditEvent,"seq"|"at"|"date">):void; newId():string;
  initialTab?:Tab;
}
const input="rounded border border-rule bg-sheet px-2 py-1 w-full min-w-0";
const button="rounded border border-rule px-3 py-1 hover:bg-paper disabled:opacity-40";
const modes:VentSetting["mode"][]=["A/C-VC","A/C-PC","SIMV","PSV","CPAP","NPPV","HFNC","なし"];
const airways:VentSetting["airway"][]=["経口挿管","気管切開","マスク","鼻カニュラ","なし"];
const units:Infusion["doseUnit"][]=["γ","mg/h","μg/h","mL/h","単位/h","mg/kg/h"];
const kinds:LineDevice["kind"][]=["CVC","動脈ライン","PICC","末梢静脈","透析用カテーテル","肺動脈カテーテル","気管チューブ","気管切開チューブ","尿道カテーテル","胃管","胸腔ドレーン","腹腔ドレーン","脳室ドレーン","IABP","ECMO","その他"];
const hourlyFields=[['map','MAP mmHg'],['cvp','CVP mmHg'],['rass','RASS'],['cpot','CPOT'],['urineMl','尿量 mL'],['drainMl','ドレーン mL'],['gastricMl','胃管 mL'],['stoolMl','便 mL'],['bloodLossMl','出血 mL'],['enteralMl','経腸 mL'],['otherInMl','その他 IN mL'],['glucose','血糖 mg/dL']] as const;
function Field({label,children}:{label:string;children:ReactNode}) {return <label className="grid gap-1 text-xs">{label}{children}</label>;}
const n=(f:FormData,k:string)=>String(f.get(k)??"").trim()===""?undefined:Number(f.get(k));
const s=(f:FormData,k:string)=>String(f.get(k)??"");
const stamp=(a:{day:number;time:string})=>`${a.day===0?"今日":`${a.day}日`} ${a.time}`;
const show=(v:number|null|undefined)=>v===undefined||v===null?"—":Number(v.toFixed(1));

export function IcuPanel(p:IcuPanelProps) {
  const {patient,records,onChange,role,me,today,nowTime,deny,auditLog,newId}=p;
  const [tab,setTab]=useState<Tab>(p.initialTab??"時間表");
  const [day,setDay]=useState(0);
  const [editHour,setEditHour]=useState<number|null>(null);
  const [formula,setFormula]=useState("");
  const [error,setError]=useState("");
  const [newInf,setNewInf]=useState(false);
  const [changing,setChanging]=useState<string|null>(null);
  const [ending,setEnding]=useState<string|null>(null);
  const [removing,setRemoving]=useState<string|null>(null);
  const [draft,setDraft]=useState({name:"",amount:5,volume:50,kg:patient.weightKg,unit:"γ" as Infusion["doseUnit"],target:0.1});
  const [target,setTarget]=useState(0);
  const [roundItems,setRoundItems]=useState<RoundCheck["items"]|null>(null);
  const at={day:0,time:nowTime},now=abs(0,nowTime);
  const doc=(role==="医師"||role==="デバッグ")&&!deny("order");
  const nurse=(role==="医師"||role==="看護師"||role==="デバッグ")&&!deny("vitals");
  const pump=(role==="医師"||role==="看護師"||role==="デバッグ")&&!deny("mar");
  const measured=nurse||role==="臨床工学技士";
  const commit=(next:IcuRecords,action:string,detail?:string)=>{onChange(next);auditLog({role,actor:me.name,patient:patient.name,action:`ICU 記録（${action}）`,detail});setError("");};
  const permit=(ok:boolean,action:Action)=>{if(ok)return true;setError(deny(action)??"この職種では記録できません");return false;};
  const infusions=records.infusions.filter(i=>i.patientId===patient.id);
  const lines=records.lines.filter(l=>l.patientId===patient.id);
  const vent=ventAt(records.vents,patient.id,now);
  const balances=hourlyBalance(patient,records,day,now);
  const hs=records.hourly.filter(h=>h.patientId===patient.id&&h.at.day===day);
  const hours=Array.from({length:24},(_,h)=>h);
  const hourAt=(h:number)=>abs(day,`${String(h).padStart(2,"0")}:59`);
  const hrec=(h:number)=>hs.filter(r=>Number(r.at.time.slice(0,2))===h).sort((a,b)=>a.at.time.localeCompare(b.at.time)).at(-1);
  const vital=(h:number)=>patient.vitals.filter(v=>v.day===day&&Number(v.time.slice(0,2))===h).sort((a,b)=>a.time.localeCompare(b.time)).at(-1);
  const round=checkedToday(records.rounds,patient.id,0);
  const preview=mlPerHFromDose(draft.target,draft.amount/draft.volume,draft.kg,draft.unit);
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
  function saveVent(e:FormEvent<HTMLFormElement>,actual=false) {
    e.preventDefault();if(!permit(actual?measured:doc,actual?"vitals":"order"))return;
    if(actual&&!vent)return;
    const f=new FormData(e.currentTarget);
    const row:VentSetting=actual?{...vent!,id:newId(),at,by:me.name,measured:{}}:{id:newId(),patientId:patient.id,at,by:me.name,mode:s(f,"mode") as VentSetting["mode"],airway:s(f,"airway") as VentSetting["airway"],fio2:n(f,"fio2")!};
    if(actual) {for(const k of ["ppeak","pplat","vte","rrTotal","etco2","mv"] as const)row.measured![k]=n(f,k);}
    else {for(const k of ["peep","ps","vt","pc","rr","flow","tubeCm"] as const)row[k]=n(f,k);}
    commit({...records,vents:[...records.vents,row]},actual?"呼吸器の実測":"呼吸器の設定",`${row.mode} FiO2 ${row.fio2}`);
  }
  const tableRow=(label:string,cell:(h:number)=>ReactNode)=><tr key={label}><th className="sticky left-0 z-10 bg-sheet border border-rule text-left px-2 min-w-32">{label}</th>{hours.map(h=><td key={h} className="border border-rule text-center min-w-11 h-8"><button type="button" className="w-full h-full px-1 hover:bg-ai-soft" aria-label={`${h}時 ${label}`} onClick={()=>{if(permit(nurse,"vitals")){setEditHour(h);setError("");}}}>{cell(h)??"—"}</button></td>)}</tr>;
  return <div className="space-y-3 p-3 text-sm" data-help="IcuPanel">
    <TabChoice label="ICU 記録のタブ" options={tabs.map(t=>({value:t,label:t}))} value={tab} onChange={setTab}/>
    {error&&<p role="alert" className="text-shu">{error}</p>}
    {tab==="時間表"&&<>
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
          if(keys&&!hs.some(r=>Number(r.at.time.slice(0,2))===h&&keys.some(key=>r[key]!==undefined)))return null;
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
    </>}
    {tab==="呼吸器・血液ガス"&&<>
      <b>いまの設定</b>{vent?<div className="grid grid-cols-2 gap-1">{Object.entries({mode:vent.mode,airway:vent.airway,FiO2:vent.fio2,PEEP:vent.peep,PS:vent.ps,VT:vent.vt,PC:vent.pc,RR:vent.rr,flow:vent.flow,tubeCm:vent.tubeCm,...vent.measured}).filter(([,v])=>v!==undefined).map(([k,v])=><p key={k}>{k}　{v}</p>)}</div>:<p>—</p>}
      <details><summary>設定の履歴</summary>{records.vents.filter(v=>v.patientId===patient.id).sort((a,b)=>abs(b.at.day,b.at.time)-abs(a.at.day,a.at.time)).map(v=><p key={v.id}>{stamp(v.at)}　{v.mode}　FiO2 {v.fio2}　PEEP {v.peep??"—"}　{v.by}{v.measured&&` 実測 ${JSON.stringify(v.measured)}`}</p>)}</details>
      {doc&&<form onSubmit={e=>saveVent(e)} className="border border-rule p-2 space-y-2"><b>新しい設定</b><div className="grid grid-cols-2 gap-2"><Field label="mode"><select name="mode" className={input} defaultValue={vent?.mode??"A/C-PC"}>{modes.map(m=><option key={m}>{m}</option>)}</select></Field><Field label="airway"><select name="airway" className={input} defaultValue={vent?.airway??"経口挿管"}>{airways.map(m=><option key={m}>{m}</option>)}</select></Field><Field label="FiO2"><input name="fio2" className={input} type="number" min="0.21" max="1" step="0.01" required defaultValue={vent?.fio2}/></Field>{([['peep','PEEP cmH2O'],['ps','PS cmH2O'],['vt','VT mL'],['pc','PC cmH2O'],['rr','RR /分'],['flow','HFNC L/分'],['tubeCm','チューブ cm']] as const).map(([k,l])=><Field key={k} label={l}><input name={k} className={input} type="number" min="0" step="any" defaultValue={vent?.[k]}/></Field>)}</div><button className={button}>設定を保存</button></form>}
      {measured&&vent&&<form onSubmit={e=>saveVent(e,true)} className="border border-rule p-2 space-y-2"><b>実測</b><div className="grid grid-cols-2 gap-2">{[['ppeak','Ppeak cmH2O'],['pplat','Pplat cmH2O'],['vte','VTe mL'],['rrTotal','総RR /分'],['etco2','EtCO2 mmHg'],['mv','MV L/分']].map(([k,l])=><Field key={k} label={l}><input className={input} name={k} type="number" step="any" min="0"/></Field>)}</div><button className={button}>実測を保存</button></form>}
      <p hidden className="hint">架空の病院の取り決め：設定は医師、実測は医師・看護師・臨床工学技士。P/F = PaO2 ÷ FiO2（整数）。採血時の設定が不明なら算出しません。「なし」から室内気 0.21 を推定しません。</p>
      <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr>{['採血','pH','PaO2','PaCO2','HCO3','Lac','FiO2','P/F'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{abgRows(patient,records.vents).map((r,i)=><tr key={i}><td>{stamp(r)}</td>{['pH','PaO2','PaCO2','HCO3','Lac'].map(k=><td key={k}>{r.values[k]??"—"}</td>)}<td>{r.fio2??"—"}</td><td>{r.pf??"—"}</td></tr>)}</tbody></table></div>
    </>}
    {tab==="持続投与"&&<>
      {infusions.map(i=>{const active=rateAt(i,now)!==null;return <div key={i.id} className="border border-rule rounded p-2 space-y-2"><b>{i.name}</b>　{i.amountMg}{i.doseUnit==='単位/h'?'単位':'mg'}/{i.volumeMl}mL<p>{doseText(i,now)}</p>{i.end&&<p>終了 {stamp(i.end)} {i.by}</p>}
        {active&&pump&&<button className={button} onClick={()=>{setChanging(i.id);setTarget(doc?0:rateAt(i,now)??0);}}>{doc?"速さを変える":"ポンプの速さを記録"}</button>} {active&&doc&&<button className={button} onClick={()=>setEnding(i.id)}>終了</button>}
        {changing===i.id&&<form onSubmit={e=>{e.preventDefault();if(!permit(doc||pump,doc?'order':'mar'))return;const f=new FormData(e.currentTarget),rate=doc?mlPerHFromDose(target,concentrationMgPerMl(i)??0,i.weightKg,i.doseUnit):target;if(rate===null||!Number.isFinite(rate)||rate<0){setError('入力値を確かめてください');return;}const next={...i,changes:[...i.changes,{at,rateMlPerH:rate,by:me.name,reason:s(f,'reason')}]};commit({...records,infusions:records.infusions.map(x=>x.id===i.id?next:x)},'持続投与の速さ',doseText(next,now));setChanging(null);}} className="space-y-2"><Field label={doc?i.doseUnit:'mL/h'}><input className={input} type="number" step="any" min="0" required value={target} onChange={e=>setTarget(Number(e.target.value))}/></Field><output>{doc?`${show(mlPerHFromDose(target,concentrationMgPerMl(i)??0,i.weightKg,i.doseUnit))}mL/h`:doseText({...i,changes:[...i.changes,{at,rateMlPerH:target,by:me.name}]},now)}</output><Field label="理由"><input className={input} name="reason" required={doc}/></Field><button className={button}>速さを保存</button></form>}
        {ending===i.id&&<form onSubmit={e=>{e.preventDefault();if(!permit(doc,'order'))return;const f=new FormData(e.currentTarget),end={day:n(f,'day')!,time:s(f,'time')};if(abs(end.day,end.time)<abs(i.start.day,i.start.time)){setError('開始以後の日時を入れてください');return;}commit({...records,infusions:records.infusions.map(x=>x.id===i.id?{...x,end}:x)},'持続投与の終了',`${i.name} ${stamp(end)} ${me.name}`);setEnding(null);}}><Field label="終了日（今日=0）"><input className={input} type="number" name="day" max="0" required defaultValue="0"/></Field><Field label="終了時刻"><input className={input} type="time" name="time" required defaultValue={nowTime}/></Field><button className={button}>終了を保存</button></form>}
        <details><summary>速さの履歴</summary>{i.changes.map((c,j)=><p key={j}>{stamp(c.at)}　{c.rateMlPerH}mL/h　{c.by}　{c.reason}</p>)}</details>
      </div>;})}
      {doc&&<button className={button} onClick={()=>setNewInf(!newInf)}>新しい持続投与</button>}
      {doc&&newInf&&<form className="space-y-2 border border-rule p-3" onSubmit={e=>{e.preventDefault();if(!permit(doc,'order'))return;if(!draft.name.trim()||preview===null||draft.amount<=0||draft.volume<=0||draft.kg<=0){setError('薬・溶液・体重・値を確かめてください');return;}const i:Infusion={id:newId(),patientId:patient.id,drugCode:'',name:draft.name.trim(),amountMg:draft.amount,volumeMl:draft.volume,doseUnit:draft.unit,weightKg:draft.kg,start:at,by:me.name,changes:[{at,rateMlPerH:preview,by:me.name}]};commit({...records,infusions:[...records.infusions,i]},'持続投与の開始',`${i.name} ${doseText(i,now)}`);setNewInf(false);}}>
        <Field label="薬の名前"><input className={input} required value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></Field><div className="grid grid-cols-2 gap-2">{([['amount',draft.unit==='単位/h'?'薬剤量 単位':'薬剤量 mg'],['volume','総量 mL'],['kg','体重 kg'],['target','目標の値']] as const).map(([k,l])=><Field key={k} label={l}><input className={input} type="number" min={k==='target'?0:0.000001} step="any" required value={draft[k]} onChange={e=>setDraft({...draft,[k]:Number(e.target.value)})}/></Field>)}<Field label="指示の単位"><select className={input} value={draft.unit} onChange={e=>setDraft({...draft,unit:e.target.value as Infusion['doseUnit']})}>{units.map(u=><option key={u}>{u}</option>)}</select></Field></div><output className="block">{preview===null?'—':`${preview.toFixed(1)}mL/h`}</output><p hidden className="hint">濃度 = 薬剤量 ÷ 総量。γ からの逆算 = γ × kg ×60 ÷（mg/mL ×1000）。mg/h・単位/h は濃度で割り、μg/h は濃度×1000で割り、mg/kg/h は体重を掛けて濃度で割ります。内部は丸めず計算し、表示だけ丸めます。</p><button className={button}>確定</button></form>}
    </>}
    {tab==="ライン・チューブ"&&<>
      {lines.map(l=><div key={l.id} className="border-b border-rule py-2"><b>{l.kind}</b>　{l.site}　{stamp(l.insertedAt)}　<span className={(l.removedAt?.day??0)-l.insertedAt.day+1>=7?'font-bold':''}>{lineDays(l,0)}</span>　{l.spec}　{l.by}
        {!l.removedAt&&nurse&&<button className={button} onClick={()=>setRemoving(l.id)}>抜去</button>}
        {removing===l.id&&<form onSubmit={e=>{e.preventDefault();if(!permit(nurse,'vitals'))return;const f=new FormData(e.currentTarget),removedAt={day:n(f,'day')!,time:s(f,'time')};if(abs(removedAt.day,removedAt.time)<abs(l.insertedAt.day,l.insertedAt.time)){setError('挿入以後の日時を入れてください');return;}commit({...records,lines:records.lines.map(x=>x.id===l.id?{...x,removedAt}:x)},'ラインの抜去',`${l.kind} ${stamp(removedAt)} ${me.name}`);setRemoving(null);}}><Field label="抜去日（今日=0）"><input name="day" className={input} type="number" max="0" required defaultValue="0"/></Field><Field label="抜去時刻"><input name="time" className={input} type="time" required defaultValue={nowTime}/></Field><button className={button}>抜去を保存</button></form>}
      </div>)}
      {nurse&&<details><summary>ラインを記録</summary><form className="space-y-2" onSubmit={e=>{e.preventDefault();if(!permit(nurse,'vitals'))return;const f=new FormData(e.currentTarget);const l:LineDevice={id:newId(),patientId:patient.id,kind:s(f,'kind') as LineDevice['kind'],site:s(f,'site'),insertedAt:{day:n(f,'day')!,time:s(f,'time')},by:me.name,spec:s(f,'spec')};commit({...records,lines:[...records.lines,l]},'ラインの挿入',`${l.kind} ${l.site} ${stamp(l.insertedAt)}`);e.currentTarget.reset();}}><Field label="種類"><select className={input} name="kind">{kinds.map(k=><option key={k}>{k}</option>)}</select></Field><Field label="部位"><input className={input} name="site" required/></Field><Field label="挿入日（今日=0）"><input name="day" className={input} type="number" max="0" required defaultValue="0"/></Field><Field label="挿入時刻"><input name="time" className={input} type="time" required defaultValue={nowTime}/></Field><Field label="太さ・長さ・固定"><input name="spec" className={input}/></Field><button className={button}>挿入を保存</button></form></details>}
      <p hidden className="hint">{LINE_DAYS_HINT}</p>
    </>}
    {tab==="SOFA"&&(()=>{const first=records.stays.filter(s=>s.patientId===patient.id).sort((a,b)=>abs(a.in.day,a.in.time)-abs(b.in.day,b.in.time))[0];const cols=[{label:'今日',day:0},{label:'入室日',day:first?.in.day},{label:'昨日',day:-1}].map(c=>({...c,result:c.day===undefined?null:sofaScore(sofaFacts(patient,records,c.day))}));return <><table className="w-full table-fixed text-xs"><thead><tr><th>項目</th>{cols.map(c=><th key={c.label}>{c.label}</th>)}</tr></thead><tbody>{['呼吸','凝固','肝','循環','中枢神経','腎'].map((label,j)=><tr key={label}><th className="border border-rule p-2">{label}</th>{cols.map(c=><td className="border border-rule p-2 align-top" key={c.label}><b>{c.result?.items[j].score??'—'}</b><p>{c.result?.items[j].basis??'入室記録なし'}</p></td>)}</tr>)}<tr><th>合計</th>{cols.map(c=><td key={c.label} className="p-2"><b>{c.result?.total??'—'}</b>{!!c.result?.missing.length&&<p>不足：{c.result.missing.join('・')}</p>}</td>)}</tr></tbody></table><p hidden className="hint">各日の最悪値。HFNC は呼吸補助に数えません。尿量条件は24時間分がある場合だけ使用。<a href={SOFA_ORIGINAL.url}>{SOFA_ORIGINAL.label}</a>／<a href={SOFA_SOURCE.url}>{SOFA_SOURCE.label}</a></p></>;})()}
    {tab==="回診"&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();if(!permit(nurse,'vitals'))return;const r:RoundCheck={id:newId(),patientId:patient.id,day:0,time:nowTime,by:me.name,items:roundItems??round?.items??{}};commit({...records,rounds:[...records.rounds,r]},'回診の確認',JSON.stringify(r.items));setRoundItems(null);}}>{FAST_HUG.map(item=><div key={item.key} className="flex flex-wrap justify-between gap-2 border-b border-rule pb-2"><span>{item.label}</span><TabChoice label={item.label} options={[{value:'確認',label:'確認'},{value:'該当なし',label:'該当なし'}]} value={(roundItems??round?.items??{})[item.key]??null} onChange={v=>{if(permit(nurse,'vitals'))setRoundItems({...round?.items,...roundItems,[item.key]:v});}}/></div>)}{round&&<p>{round.time}　{round.by}</p>}<button className={button} disabled={!nurse}>今日の確認を保存</button><p hidden className="hint">今日その項目を確認したかだけを記録します。何をするかは医師が記事に記載。<a href={FAST_HUG_SOURCE.url}>{FAST_HUG_SOURCE.label}</a></p></form>}
  </div>;
}
