"use client";

import { checkedToday, FAST_HUG, FAST_HUG_SOURCE } from "@/lib/icu";
import type { RoundCheck } from "@/lib/icu";
import { useWindowEntry } from "@/lib/window-entry";
import { TabChoice } from "../TabChoice";
import { button, type IcuPaneProps } from "./parts";

/** 回診: FAST HUG の項目ごとに、今日確認したかだけを残す。 */
export function IcuRoundPane(p:IcuPaneProps) {
  const {patient,records,role,me,nowTime,nurse,commit,permit,newId}=p;
  // 入れかけのチェック（タブを替えても残す）。
  const [roundItems,setRoundItems]=useWindowEntry<RoundCheck["items"]|null>("icu-round-items",null,`${patient.id}:${role}`);
  const round=checkedToday(records.rounds,patient.id,0);
  return <form className="space-y-3" onSubmit={e=>{e.preventDefault();if(!permit(nurse,'vitals'))return;const r:RoundCheck={id:newId(),patientId:patient.id,day:0,time:nowTime,by:me.name,items:roundItems??round?.items??{}};commit({...records,rounds:[...records.rounds,r]},'回診の確認',JSON.stringify(r.items));setRoundItems(null);}}>{FAST_HUG.map(item=><div key={item.key} className="flex flex-wrap justify-between gap-2 border-b border-rule pb-2"><span>{item.label}</span><TabChoice label={item.label} options={[{value:'確認',label:'確認'},{value:'該当なし',label:'該当なし'}]} value={(roundItems??round?.items??{})[item.key]??null} onChange={v=>{if(permit(nurse,'vitals'))setRoundItems({...round?.items,...roundItems,[item.key]:v});}}/></div>)}{round&&<p>{round.time}　{round.by}</p>}<button className={button} disabled={!nurse}>今日の確認を保存</button><p hidden className="hint">今日その項目を確認したかだけを記録します。何をするかは医師が記事に記載。<a href={FAST_HUG_SOURCE.url}>{FAST_HUG_SOURCE.label}</a></p></form>;
}
