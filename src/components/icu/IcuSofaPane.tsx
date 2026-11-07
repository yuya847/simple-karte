"use client";

import { Fragment, type FormEvent } from "react";
import { abs } from "@/lib/flowsheet";
import { sofaFacts, sofaScore, SOFA_SOURCE, SOFA_ORIGINAL } from "@/lib/icu";
import type { SofaInput } from "@/lib/icu";
import { useWindowEntry } from "@/lib/window-entry";
import { Field, button, input as field, when, type IcuPaneProps } from "./parts";

const rows=[["respiratory","呼吸"],["coagulation","凝固"],["liver","肝"],["cardiovascular","循環"],["cns","中枢神経"],["renal","腎"]] as const;
/** lib の根拠のうち、置いた値・条件の句（文は変えず色だけ変える）。 */
const NOTE=/(V は挿管のため 1 と置いた|鎮静中|HFNC は呼吸補助に数えない|尿量 \d+ 時間分のみ)/;
const marked=(line:string)=>line.split(NOTE).map((t,k)=>k%2?<span key={k} className="text-yamabuki">{t}</span>:t);

/** 入れかけの材料（タブを替えても残す）。 */
interface SofaDraft { open: SofaInput["item"]|null; cns: {e:string;v:string;m:string;reason:string}; respiratory: {fio2:string;reason:string} }
const blank:SofaDraft={open:null,cns:{e:"",v:"",m:"",reason:""},respiratory:{fio2:"",reason:""}};
const whole=(v:string,lo:number,hi:number)=>{const n=Number(v);return v.trim()!==""&&Number.isInteger(n)&&n>=lo&&n<=hi?n:null;};

/** SOFA: 今日・入室日・昨日の項目ごとの点と根拠（点はコードで計算）。 */
export function IcuSofaPane(p:IcuPaneProps) {
  const {patient,records,role,me,today,nowTime,doc,commit,permit,setError,newId}=p;
  const [stored,setDraft]=useWindowEntry<SofaDraft>("icu-sofa-input",blank,`${patient.id}:${role}`);
  const draft:SofaDraft={...blank,...stored,cns:{...blank.cns,...stored?.cns},respiratory:{...blank.respiratory,...stored?.respiratory}};
  const first=records.stays.filter(s=>s.patientId===patient.id).sort((a,b)=>abs(a.in.day,a.in.time)-abs(b.in.day,b.in.time))[0];
  const cols=[{label:'今日',day:0},{label:'入室日',day:first?.in.day},{label:'昨日',day:-1}].map(c=>{
    const facts=c.day===undefined?null:sofaFacts(patient,records,c.day);
    return {...c,facts,result:facts&&sofaScore(facts)};
  });
  // 医師入力の札の横には、根拠の文にまだ出ていない「人・時刻・理由」だけを足す。
  const byWhom=(input:SofaInput,basis:string)=>[input.by,input.at.day===0?input.at.time:when(input.at,today),input.reason].filter(x=>!basis.includes(x)).join("　");
  const save=(e:FormEvent,item:SofaInput["item"])=>{
    e.preventDefault();
    if(!permit(doc,"order"))return;
    const label=item==="cns"?"中枢神経":"呼吸";
    let value:Pick<SofaInput,"gcs"|"fio2">,text:string,reason:string;
    if(item==="cns"){
      const d=draft.cns,gcs={e:whole(d.e,1,4),v:whole(d.v,1,5),m:whole(d.m,1,6)};
      if(gcs.e===null||gcs.v===null||gcs.m===null){setError("E は1〜4、V は1〜5、M は1〜6 で入れてください");return;}
      value={gcs:{e:gcs.e,v:gcs.v,m:gcs.m}};text=`E${gcs.e}V${gcs.v}M${gcs.m}`;reason=d.reason.trim();
    }else{
      const d=draft.respiratory,fio2=Number(d.fio2);
      if(d.fio2.trim()===""||!Number.isFinite(fio2)||fio2<0.21||fio2>1){setError("FiO2 は 0.21〜1.0 で入れてください");return;}
      value={fio2};text=`FiO2 ${fio2}`;reason=d.reason.trim();
    }
    if(!reason){setError("理由を入れてください");return;}
    const input:SofaInput={id:newId(),patientId:patient.id,day:0,by:me.name,at:{day:0,time:nowTime},item,...value,reason};
    commit({...records,sofaInputs:[...(records.sofaInputs??[]),input]},"SOFA の材料",`${label} ${text} ${reason}`);
    setDraft({...draft,open:null,[item]:blank[item]});
  };
  const num=(item:"cns",k:"e"|"v"|"m",label:string,max:number)=><Field label={label}><input className={`${field} w-14`} type="number" inputMode="numeric" min={1} max={max} step={1} required value={draft.cns[k]} onChange={e=>setDraft({...draft,[item]:{...draft[item],[k]:e.target.value}})}/></Field>;
  const form=(item:SofaInput["item"])=><form className="flex flex-wrap items-end gap-2" onSubmit={e=>save(e,item)}>
    {item==="cns"?<>{num("cns","e","E",4)}{num("cns","v","V",5)}{num("cns","m","M",6)}</>
      :<Field label="FiO2"><input className={`${field} w-20`} type="number" inputMode="decimal" min={0.21} max={1} step={0.01} required value={draft.respiratory.fio2} onChange={e=>setDraft({...draft,respiratory:{...draft.respiratory,fio2:e.target.value}})}/></Field>}
    <div className="min-w-48 flex-1"><Field label="理由"><input className={field} required value={draft[item].reason} onChange={e=>setDraft({...draft,[item]:{...draft[item],reason:e.target.value}})}/></Field></div>
    <button className={button}>保存</button>
  </form>;
  return <>
    <table className="w-full table-fixed border-collapse text-xs">
      <colgroup><col className="w-20"/><col/><col/><col/></colgroup>
      <thead><tr><th/>{cols.map(c=><th key={c.label} className="px-2 py-1 text-left font-normal text-ink-soft">{c.label}</th>)}</tr></thead>
      <tbody>
        {rows.map(([key,label])=><Fragment key={key}><tr>
          <th className="border border-rule p-2 text-left align-top">{label}</th>
          {cols.map(c=>{
            const item=c.result?.items.find(i=>i.key===key);
            const input=key==="cns"||key==="respiratory"?c.facts?.inputs[key]:undefined;
            return <td key={c.label} className="border border-rule p-2 align-top">
              <b title={item?.assumed?"推定":undefined} className={`text-xl leading-none nums ${item?.assumed?"inline-block rounded border border-dashed border-yamabuki px-1 text-ink-soft":""}`}>{item?.score??'—'}</b>
              {input&&item&&<p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-soft"><span className="rounded border border-fuji px-1 text-[10px] leading-4 text-fuji">医師入力</span>{byWhom(input,item.basis)}</p>}
              <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-ink-soft">{(item?.basis??'入室記録なし').split('；').map((line,k)=><li key={k}>{marked(line)}</li>)}</ul>
              {doc&&c.label==='今日'&&(key==="cns"||key==="respiratory")&&<button type="button" aria-expanded={draft.open===key} className="mt-1.5 rounded border border-rule px-2 py-0.5 text-[11px] hover:bg-paper" onClick={()=>setDraft({...draft,open:draft.open===key?null:key})}>材料を入れる</button>}
            </td>;
          })}
        </tr>
        {doc&&(key==="cns"||key==="respiratory")&&draft.open===key&&<tr><td colSpan={cols.length+1} className="border border-rule bg-paper p-2">{form(key)}</td></tr>}
        </Fragment>)}
        <tr>
          <th className="p-2 text-left">合計</th>
          {cols.map(c=><td key={c.label} className="p-2 align-top"><b className="text-xl leading-none nums">{c.result?.total??'—'}</b>{c.result?.total!=null&&!!c.result.assumed.length&&<span title={c.result.assumed.join('・')} className="ml-1.5 rounded border border-yamabuki px-1 align-[3px] text-[11px] leading-4 text-yamabuki">推定を含む</span>}{!!c.result?.missing.length&&<p className="mt-1 text-[11px]">不足：{c.result.missing.join('・')}</p>}</td>)}
        </tr>
      </tbody>
    </table>
    <p hidden className="hint">各日の最悪値。HFNC は呼吸補助に数えません。尿量条件は24時間分がある場合だけ使用。<a href={SOFA_ORIGINAL.url}>{SOFA_ORIGINAL.label}</a>／<a href={SOFA_SOURCE.url}>{SOFA_SOURCE.label}</a></p>
  </>;
}
