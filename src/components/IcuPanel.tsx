"use client";

// ICU 記録（右の道具）: タブ、エラーの表示、記録の保存（commit）と職種の可否（permit）だけを持つ殻。
// 各タブの中身は ./icu/ にある。

import { useState } from "react";
import type { Draft } from "@/lib/drafts";
import type { OrderEntry } from "@/lib/types";
import type { Patient } from "@/lib/types";
import type { Action, Role, Staff } from "@/lib/roles";
import type { AuditEvent } from "@/lib/audit";
import type { CalendarDate } from "@/lib/dates";
import { abs } from "@/lib/flowsheet";
import type { IcuRecords } from "@/lib/icu";
import { TabChoice } from "./TabChoice";
import type { IcuPaneProps } from "./icu/parts";
import { IcuTimeTable } from "./icu/IcuTimeTable";
import { IcuVentPane } from "./icu/IcuVentPane";
import { IcuInfusionPane } from "./icu/IcuInfusionPane";
import { IcuLinesPane } from "./icu/IcuLinesPane";
import { IcuSofaPane } from "./icu/IcuSofaPane";
import { IcuRoundPane } from "./icu/IcuRoundPane";
import { IcuBand } from "./icu/IcuBand";

const tabs=["時間表","呼吸器・血液ガス","持続投与","ライン・チューブ","SOFA","回診"] as const;
type Tab=typeof tabs[number];
export interface IcuPanelProps {
  patient: Patient; records: IcuRecords; onChange(next:IcuRecords):void; role:Role; me:Staff;
  today:CalendarDate|null; nowTime:string; deny(action:Action):string|null;
  auditLog(event:Omit<AuditEvent,"seq"|"at"|"date">):void; newId():string;
  initialTab?:Tab;
  entries?: OrderEntry[]; onOrder?: (drafts: Draft[]) => void;
  /** 指示簿の医師の文（standing.other）。帯にそのまま出す。 */
  targets?: string;
}

export function IcuPanel(p:IcuPanelProps) {
  const {patient,records,onChange,role,me,today,nowTime,deny,auditLog,newId}=p;
  const [tab,setTab]=useState<Tab>(p.initialTab??"時間表");
  const [day,setDay]=useState(0);
  const [error,setError]=useState("");
  const doc=(role==="医師"||role==="デバッグ")&&!deny("order");
  const nurse=(role==="医師"||role==="看護師"||role==="デバッグ")&&!deny("vitals");
  const pump=(role==="医師"||role==="看護師"||role==="デバッグ")&&!deny("mar");
  const measured=nurse||role==="臨床工学技士";
  const commit=(next:IcuRecords,action:string,detail?:string)=>{onChange(next);auditLog({role,actor:me.name,patient:patient.name,action:`ICU 記録（${action}）`,detail});setError("");};
  const permit=(ok:boolean,action:Action)=>{if(ok)return true;setError(deny(action)??"この職種では記録できません");return false;};
  const pane:IcuPaneProps={patient,records,role,me,today,nowTime,newId,at:{day:0,time:nowTime},now:abs(0,nowTime),doc,nurse,pump,measured,commit,permit,setError};
  return <div className="space-y-3 p-3 text-sm" data-help="IcuPanel">
    <IcuBand patient={patient} records={records} today={today} now={pane.now} targets={p.targets}/>
    <TabChoice label="ICU 記録のタブ" options={tabs.map(t=>({value:t,label:t}))} value={tab} onChange={setTab}/>
    {error&&<p role="alert" className="text-shu">{error}</p>}
    {tab==="時間表"&&<IcuTimeTable {...pane} day={day} setDay={setDay}/>}
    {tab==="呼吸器・血液ガス"&&<IcuVentPane {...pane}/>}
    {tab==="持続投与"&&<IcuInfusionPane {...pane} entries={p.entries} onOrder={p.onOrder}/>}
    {tab==="ライン・チューブ"&&<IcuLinesPane {...pane}/>}
    {tab==="SOFA"&&<IcuSofaPane {...pane}/>}
    {tab==="回診"&&<IcuRoundPane {...pane}/>}
  </div>;
}
