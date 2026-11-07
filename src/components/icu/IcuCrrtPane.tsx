"use client";

import type { FormEvent, ReactNode, SyntheticEvent } from "react";
import { abs } from "@/lib/flowsheet";
import type { CrrtSetting } from "@/lib/icu";
import { useWindowEntry } from "@/lib/window-entry";
import { Field, button, input, n, s, stamp, when, type IcuPaneProps } from "./parts";

const crrtModes:CrrtSetting["mode"][]=["CHDF","CHD","CHF"];
const anticoagDrugs:CrrtSetting["anticoag"]["drug"][]=["ナファモスタット","ヘパリン","なし"];
const anticoagUnits:CrrtSetting["anticoag"]["unit"][]=["mg/h","単位/h"];
/** The form's number fields: name, label, and the setting's value. */
const numberFields=[['qb','QB mL/分',(c:CrrtSetting)=>c.qb],['qd','QD mL/h',(c:CrrtSetting)=>c.qd],['qf','QF mL/h',(c:CrrtSetting)=>c.qf],['removal','除水 mL/h',(c:CrrtSetting)=>c.removalMlPerH]] as const;
const t=(a:{day:number;time:string})=>abs(a.day,a.time);
const str=(v:number|string|undefined)=>v===undefined?"":String(v);

const Unit=({children}:{children:ReactNode})=><span className="ml-0.5 text-[10px] text-ink-soft">{children}</span>;
function Item({label,unit,children}:{label:string;unit?:string;children:ReactNode}) {
  return <div className="flex items-baseline gap-2"><dt className="w-16 shrink-0 text-xs text-ink-soft">{label}</dt><dd className="nums">{children}{unit&&<Unit>{unit}</Unit>}</dd></div>;
}
const anticoagText=(a:CrrtSetting["anticoag"])=>a.drug==="なし"?"なし":<>{a.drug} {a.ratePerH}<Unit>{a.unit}</Unit></>;

/** CRRT: いまの条件、条件の履歴、医師の新しい条件と終了。除水量の計算は lib（io-lines）が条件ごとの期間で行う。 */
export function IcuCrrtPane(p:IcuPaneProps) {
  const {patient,records,me,today,nowTime,at,now,doc,commit,permit,setError,newId}=p;
  const list=records.crrt.filter(c=>c.patientId===patient.id).sort((a,b)=>t(b.at)-t(a.at));
  const active=list.find(c=>t(c.at)<=now&&(!c.end||t(c.end)>now))??null;
  const base=active??list[0];
  // What is being typed stays when the tab changes (per patient, in the workspace).
  const [open,setOpen]=useWindowEntry<{form?:boolean;end?:boolean}>("icu-crrt-open",{});
  const [draft,setDraft]=useWindowEntry<Record<string,string>>("icu-crrt-new",{});
  const [endDraft,setEndDraft]=useWindowEntry<{day?:string;time?:string}>("icu-crrt-end",{});
  const value=(k:string,fallback:number|string|undefined)=>draft[k]??str(fallback);
  const edit=(k:string)=>(e:{target:{value:string}})=>setDraft(d=>({...d,[k]:e.target.value}));
  const toggle=(k:"form"|"end")=>(e:SyntheticEvent<HTMLDetailsElement>)=>{const v=e.currentTarget.open;if(!!open[k]!==v)setOpen(o=>({...o,[k]:v}));};
  function save(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();if(!permit(doc,"order"))return;
    const f=new FormData(e.currentTarget);
    const [qb,qd,qf,removal,rate]=["qb","qd","qf","removal","rate"].map(k=>n(f,k));
    if([qb,qd,qf,removal,rate].some(x=>x===undefined||!Number.isFinite(x)||x<0)||!s(f,"access").trim()){setError("入力値を確かめてください");return;}
    const row:CrrtSetting={id:newId(),patientId:patient.id,at,by:me.name,mode:s(f,"mode") as CrrtSetting["mode"],qb:qb!,qd:qd!,qf:qf!,removalMlPerH:removal!,anticoag:{drug:s(f,"drug") as CrrtSetting["anticoag"]["drug"],ratePerH:rate!,unit:s(f,"unit") as CrrtSetting["anticoag"]["unit"]},access:s(f,"access").trim()};
    // The condition running now ends when the new one starts, so the removal is not counted twice.
    const crrt=records.crrt.map(c=>c.patientId===patient.id&&t(c.at)<=t(at)&&(!c.end||t(c.end)>t(at))?{...c,end:at}:c);
    commit({...records,crrt:[...crrt,row]},"CRRT の条件",`${row.mode} QB ${row.qb} 除水 ${row.removalMlPerH}mL/h`);
    setDraft({});setOpen(o=>({...o,form:false}));
  }
  function end(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();if(!permit(doc,"order")||!active)return;
    const f=new FormData(e.currentTarget),stop={day:n(f,"day")!,time:s(f,"time")};
    if(!Number.isFinite(stop.day)||!stop.time||t(stop)<t(active.at)){setError("開始以後の日時を入れてください");return;}
    commit({...records,crrt:records.crrt.map(c=>c.id===active.id?{...c,end:stop}:c)},"CRRT の終了",`${active.mode} ${stamp(stop)} ${me.name}`);
    setEndDraft({});setOpen(o=>({...o,end:false}));
  }
  return <div className="space-y-3">
    <section className="space-y-2 rounded border border-rule bg-sheet p-3">
      <h3><b>いまの条件</b></h3>
      {active?<dl className="grid max-w-2xl gap-x-4 gap-y-1 sm:grid-cols-2">
        <Item label="mode">{active.mode}</Item><Item label="QB" unit="mL/分">{active.qb}</Item>
        <Item label="QD" unit="mL/h">{active.qd}</Item><Item label="QF" unit="mL/h">{active.qf}</Item>
        <Item label="除水" unit="mL/h">{active.removalMlPerH}</Item><Item label="抗凝固">{anticoagText(active.anticoag)}</Item>
        <Item label="アクセス">{active.access}</Item><Item label="開始">{when(active.at,today)}　{active.by}</Item>
      </dl>:<p>—</p>}
      {doc&&<div className="flex flex-wrap items-start gap-x-6 gap-y-2">
        <details open={!!open.form} onToggle={toggle("form")} className="min-w-0 flex-1"><summary className="cursor-pointer text-xs text-ai">新しい条件</summary>
          <form onSubmit={save} className="mt-2 space-y-2"><div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            <Field label="mode"><select name="mode" className={input} value={value("mode",base?.mode??"CHDF")} onChange={edit("mode")}>{crrtModes.map(m=><option key={m}>{m}</option>)}</select></Field>
            {numberFields.map(([k,l,get])=><Field key={k} label={l}><input name={k} className={input} type="number" min="0" step="any" required value={value(k,base&&get(base))} onChange={edit(k)}/></Field>)}
            <Field label="抗凝固薬"><select name="drug" className={input} value={value("drug",base?.anticoag.drug??"ナファモスタット")} onChange={edit("drug")}>{anticoagDrugs.map(m=><option key={m}>{m}</option>)}</select></Field>
            <Field label="抗凝固 速さ"><input name="rate" className={input} type="number" min="0" step="any" required value={value("rate",base?.anticoag.ratePerH??0)} onChange={edit("rate")}/></Field>
            <Field label="単位"><select name="unit" className={input} value={value("unit",base?.anticoag.unit??"mg/h")} onChange={edit("unit")}>{anticoagUnits.map(m=><option key={m}>{m}</option>)}</select></Field>
            <Field label="アクセス"><input name="access" className={input} required value={value("access",base?.access)} onChange={edit("access")}/></Field>
          </div><button className={button}>条件を保存</button></form>
        </details>
        {active&&<details open={!!open.end} onToggle={toggle("end")}><summary className="cursor-pointer text-xs text-ai">終了</summary>
          <form onSubmit={end} className="mt-2 flex flex-wrap items-end gap-2">
            <Field label="終了日（今日=0）"><input name="day" className={input} type="number" max="0" required value={endDraft.day??"0"} onChange={e=>setEndDraft(d=>({...d,day:e.target.value}))}/></Field>
            <Field label="終了時刻"><input name="time" className={input} type="time" required value={endDraft.time??nowTime} onChange={e=>setEndDraft(d=>({...d,time:e.target.value}))}/></Field>
            <button className={button}>終了を保存</button>
          </form>
        </details>}
      </div>}
    </section>
    {list.length>0&&<section className="space-y-1"><b>条件の履歴</b>
      <div className="overflow-x-auto"><table className="nums text-xs">
        <thead><tr className="text-left text-ink-soft">{[['期間',''],['mode',''],['QB','mL/分'],['QD','mL/h'],['QF','mL/h'],['除水','mL/h'],['抗凝固',''],['アクセス',''],['記録者','']].map(([h,u])=><th key={h} className="whitespace-nowrap px-2 py-1 font-normal">{h}{u&&<Unit>{u}</Unit>}</th>)}</tr></thead>
        <tbody>{list.map(c=><tr key={c.id} className="border-t border-rule">
          <td className="whitespace-nowrap px-2 py-1">{when(c.at,today)} 〜 {c.end?when(c.end,today):""}</td>
          <td className="px-2 py-1">{c.mode}</td>
          <td className="px-2 py-1 text-right">{c.qb}</td><td className="px-2 py-1 text-right">{c.qd}</td><td className="px-2 py-1 text-right">{c.qf}</td><td className="px-2 py-1 text-right">{c.removalMlPerH}</td>
          <td className="whitespace-nowrap px-2 py-1">{anticoagText(c.anticoag)}</td><td className="px-2 py-1">{c.access}</td><td className="whitespace-nowrap px-2 py-1">{c.by}</td>
        </tr>)}</tbody>
      </table></div>
    </section>}
  </div>;
}
