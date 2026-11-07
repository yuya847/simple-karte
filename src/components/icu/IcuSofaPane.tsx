"use client";

import { abs } from "@/lib/flowsheet";
import { sofaFacts, sofaScore, SOFA_SOURCE, SOFA_ORIGINAL } from "@/lib/icu";
import type { SofaInput } from "@/lib/icu";
import { when, type IcuPaneProps } from "./parts";

const rows=[["respiratory","呼吸"],["coagulation","凝固"],["liver","肝"],["cardiovascular","循環"],["cns","中枢神経"],["renal","腎"]] as const;
/** lib の根拠のうち、置いた値・条件の句（文は変えず色だけ変える）。 */
const NOTE=/(V は挿管のため 1 と置いた|鎮静中|HFNC は呼吸補助に数えない|尿量 \d+ 時間分のみ)/;
const marked=(line:string)=>line.split(NOTE).map((t,k)=>k%2?<span key={k} className="text-yamabuki">{t}</span>:t);

/** SOFA: 今日・入室日・昨日の項目ごとの点と根拠（点はコードで計算）。 */
export function IcuSofaPane(p:IcuPaneProps) {
  const {patient,records,today}=p;
  const first=records.stays.filter(s=>s.patientId===patient.id).sort((a,b)=>abs(a.in.day,a.in.time)-abs(b.in.day,b.in.time))[0];
  const cols=[{label:'今日',day:0},{label:'入室日',day:first?.in.day},{label:'昨日',day:-1}].map(c=>{
    const facts=c.day===undefined?null:sofaFacts(patient,records,c.day);
    return {...c,facts,result:facts&&sofaScore(facts)};
  });
  // 医師入力の札の横には、根拠の文にまだ出ていない「人・時刻・理由」だけを足す。
  const byWhom=(input:SofaInput,basis:string)=>[input.by,input.at.day===0?input.at.time:when(input.at,today),input.reason].filter(x=>!basis.includes(x)).join("　");
  return <>
    <table className="w-full table-fixed border-collapse text-xs">
      <colgroup><col className="w-20"/><col/><col/><col/></colgroup>
      <thead><tr><th/>{cols.map(c=><th key={c.label} className="px-2 py-1 text-left font-normal text-ink-soft">{c.label}</th>)}</tr></thead>
      <tbody>
        {rows.map(([key,label])=><tr key={key}>
          <th className="border border-rule p-2 text-left align-top">{label}</th>
          {cols.map(c=>{
            const item=c.result?.items.find(i=>i.key===key);
            const input=key==="cns"||key==="respiratory"?c.facts?.inputs[key]:undefined;
            return <td key={c.label} className="border border-rule p-2 align-top">
              <b className="text-xl leading-none nums">{item?.score??'—'}</b>
              {input&&item&&<p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-soft"><span className="rounded border border-fuji px-1 text-[10px] leading-4 text-fuji">医師入力</span>{byWhom(input,item.basis)}</p>}
              <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-ink-soft">{(item?.basis??'入室記録なし').split('；').map((line,k)=><li key={k}>{marked(line)}</li>)}</ul>
            </td>;
          })}
        </tr>)}
        <tr>
          <th className="p-2 text-left">合計</th>
          {cols.map(c=><td key={c.label} className="p-2 align-top"><b className="text-xl leading-none nums">{c.result?.total??'—'}</b>{!!c.result?.missing.length&&<p className="mt-1 text-[11px]">不足：{c.result.missing.join('・')}</p>}</td>)}
        </tr>
      </tbody>
    </table>
    <p hidden className="hint">各日の最悪値。HFNC は呼吸補助に数えません。尿量条件は24時間分がある場合だけ使用。<a href={SOFA_ORIGINAL.url}>{SOFA_ORIGINAL.label}</a>／<a href={SOFA_SOURCE.url}>{SOFA_SOURCE.label}</a></p>
  </>;
}
