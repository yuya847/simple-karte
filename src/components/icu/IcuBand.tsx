"use client";

import type { ReactNode } from "react";
import { abs } from "@/lib/flowsheet";
import { abgRows, doseText, rateAt, ventAt } from "@/lib/icu";
import { when, type IcuPaneProps } from "./parts";

const t=(a:{day:number;time:string})=>abs(a.day,a.time);
/** The drug's name before its strength and maker (as the time table shows it). */
const shortName=(name:string)=>name.split(/注射液|静注|注|[「（(\s0-9０-９]/)[0]||name;
const Label=({children}:{children:ReactNode})=><span className="mr-1 text-ink-soft">{children}</span>;
const Unit=({children}:{children:ReactNode})=><span className="ml-0.5 text-[10px] text-ink-soft">{children}</span>;

/**
 * 要点の帯（全タブの上）: 入室の日数、いまの呼吸器、最新の P/F、持続投与ごとの量と mL/h、CRRT、指示簿の医師の文。
 * 値は記録とコードの計算のまま。無いものは出さない。
 */
export function IcuBand({patient,records,today,now,targets}:Pick<IcuPaneProps,"patient"|"records"|"today"|"now">&{targets?:string}) {
  const stays=records.stays.filter(s=>s.patientId===patient.id&&t(s.in)<=now).sort((a,b)=>t(a.in)-t(b.in));
  // Counted from the first stay, as the ICU・HCU board counts it; only while the patient is in a unit.
  const days=stays.some(s=>!s.out||t(s.out)>now)?Math.floor(now/1440)-stays[0].in.day+1:null;
  const vent=ventAt(records.vents,patient.id,now);
  const pf=abgRows(patient,records.vents).filter(r=>r.pf!==null&&t(r)<=now).at(-1);
  const infusions=records.infusions.filter(i=>i.patientId===patient.id&&rateAt(i,now)!==null);
  const crrt=records.crrt.filter(c=>c.patientId===patient.id&&t(c.at)<=now&&(!c.end||t(c.end)>now)).sort((a,b)=>t(a.at)-t(b.at)).at(-1);
  const goal=targets?.trim()??"";
  const items:{key:string;node:ReactNode}[]=[];
  if(days!==null)items.push({key:"days",node:<><Label>入室</Label>{days}日目</>});
  if(vent&&vent.mode!=="なし")items.push({key:"vent",node:<><Label>呼吸器</Label>{vent.mode}{vent.mode==="HFNC"&&vent.flow!==undefined&&<> {vent.flow}<Unit>L/分</Unit></>} <Label>FiO2</Label>{vent.fio2}{vent.mode!=="HFNC"&&vent.peep!==undefined&&<> <Label>PEEP</Label>{vent.peep}</>}</>});
  if(pf)items.push({key:"pf",node:<><Label>P/F</Label>{pf.pf}<span className="ml-1 text-ink-soft">{when(pf,today)}</span></>});
  for(const i of infusions){
    const dose=doseText(i,now).split("（")[0],rate=rateAt(i,now)!;
    items.push({key:i.id,node:<span title={i.name}>{shortName(i.name)} {dose!=="—"&&dose}{(dose==="—"||i.doseUnit!=="mL/h")&&<>（{rate.toFixed(1)}<Unit>mL/h</Unit>）</>}</span>});
  }
  if(crrt)items.push({key:"crrt",node:<><Label>CRRT</Label>{crrt.mode} <Label>QB</Label>{crrt.qb} <Label>除水</Label>{crrt.removalMlPerH}<Unit>mL/h</Unit></>});
  if(!items.length&&!goal)return null;
  return <div className="space-y-0.5 rounded border border-rule bg-paper px-3 py-1.5 text-xs" data-testid="icu-band">
    {items.length>0&&<p className="nums flex flex-wrap gap-x-4 gap-y-0.5">{items.map(x=><span key={x.key} className="whitespace-nowrap">{x.node}</span>)}</p>}
    {goal&&<p className="whitespace-pre-line"><Label>指示簿</Label>{goal}</p>}
  </div>;
}
