import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SCENARIOS } from "../scenarios";
import { ordersOf } from "../record";
import { buildWorksheet } from "../worksheet";
import { currentInfusion } from "./current-infusion";
import { infusionOrderEntry } from "./infusion-orders";
import { collectFacts } from "../discharge";
import { summaryFacts } from "../summary";
import { stayDayText } from "./stays";
import { insulinTarget } from "./insulin-target";
import { vitalMeasurementTimes, standingMeasurementPlan } from "../standing-measurements";
import { emptyStanding } from "../standing";
import { InsulinWindow } from "@/components/InsulinWindow";
import type { RefWindowProps } from "@/components/RefWindows";
import type { StandingLine } from "../standing-lines";
const today={y:2026,m:11,d:7};
const patient=(id:string)=>SCENARIOS.patients.find(p=>p.id===id)!;
it("持続の実測速度を使い、未来の変更は使わない。ワークシートは指示値も残す",()=>{
 const p=patient("99000108"), inf=SCENARIOS.icu.infusions.find(i=>i.patientId===p.id)!;
 const entry=infusionOrderEntry(inf,"医師");
 const icu={...SCENARIOS.icu,infusions:[{...inf,changes:[...inf.changes,{at:{day:0,time:"10:00"},rateMlPerH:5.2,by:"看護師"},{at:{day:1,time:"10:00"},rateMlPerH:8,by:"看護師"}]}]};
 expect(currentInfusion(entry.order as import('../types').InjectionOrder,icu,p.id,720)?.text).toBe("持続 5.2単位/時（5.2mL/時）");
 const sheet=buildWorksheet([{patient:p,room:p.room,entries:[entry],icu}],0,1440,720);
 expect(sheet.running.find(r=>r.orderId===entry.id)?.detail).toContain("5.2mL/時（指示 2）");
 const html=renderToStaticMarkup(<InsulinWindow {...{patient:p,entries:[entry],icu,today,nowTime:"12:00"} as RefWindowProps}/>);
 expect(html).toContain("持続 5.2単位/時"); expect(html).not.toContain("固定指示"); expect(html).not.toContain("▼帯より低い"); expect(html).toContain("ICU 記録");
});
it("ヘパリンの量を包装の筒と混同せず、明日の移動は予定",()=>{
 const p=patient("99000107"), inf=SCENARIOS.icu.infusions.find(i=>i.patientId===p.id)!;
 const entry=infusionOrderEntry(inf,"医師");
 expect(entry.order.type==='injection'&&entry.order.items[0]).toMatchObject({amount:5000,unit:"単位"});
 const facts=collectFacts(p,ordersOf(p.history),[],today,0,SCENARIOS.icu,720);
 expect(facts.injections.join()).not.toContain("5000筒");
 expect(facts.procedures.filter(s=>s.includes("11/8")).join()).toContain("予定");
 expect(facts.procedures.filter(s=>s.includes("11/8")).join()).not.toContain("継続中");
});
it("転棟サマリはラインの日数と指示簿の原文を含む",()=>{
 const p=patient("99000110");
 const s=summaryFacts(p,ordersOf(p.history),today,{diagnoses:[],icu:SCENARIOS.icu,now:720,standing:{...emptyStanding('医師',{day:0,time:'09:00'}),other:'医師指示の文'}});
 expect(s.find(s=>s.heading==='処置')?.lines.join()).toContain('尿道カテーテル');
 expect(s.find(s=>s.heading==='処置')?.lines.join()).toContain('9日目');
 expect(s.at(-2)?.lines.join()).toContain('医師指示の文');
 expect(stayDayText(SCENARIOS.icu,p.id,720)).toBe('HCU 3日目（ICU から 9日目）');
});
it("医師が確定した有効な目標だけを表示し、記入者と時刻を保持",()=>{
 const l:StandingLine={id:'target',cat:'その他',text:'血糖目標 100〜180 mg/dL',by:'医師 架空',at:{day:0,time:'10:00'},start:{day:0,time:'10:00'}};
 expect(insulinTarget([],720)).toBeNull();expect(insulinTarget([l],540)).toBeNull();
 expect(insulinTarget([l],720)).toMatchObject({low:100,high:180,by:l.by,at:l.at});
 expect(insulinTarget([{...l,stop:{day:0,time:'11:00',by:l.by}}],720)).toBeNull();
});
it("1・2・4時間ごとと1日3回を予定へ展開",()=>{
 expect(vitalMeasurementTimes('1時間ごと')).toHaveLength(24);
 expect(vitalMeasurementTimes('2時間ごと')).toHaveLength(12);
 expect(vitalMeasurementTimes('4時間ごと')).toHaveLength(6);
 expect(vitalMeasurementTimes('1日3回')).toEqual(['06:00','14:00','22:00']);
 expect(standingMeasurementPlan([],{...emptyStanding('医師',{day:-1,time:'10:00'}),vitals:'1時間ごと'},0)).toHaveLength(24);
});

it("移動・食事と実施入力が同じ転棟の実施キーを使う",async()=>{
 const {moveAdministration}=await import('../move-administration');
 const p=patient('99000110'), entry=ordersOf(p.history).find(e=>e.order.type==='procedure'&&e.order.code==='PROC-MOVE')!;
 const calendar=moveAdministration(entry,p.id,'12:00','看護師');
 expect(calendar.checked).toEqual({patient:false,label:null});
 const execution=moveAdministration(entry,p.id,'12:00','看護師',{...calendar,key:'different',at:3});
 expect(execution).toEqual(calendar);
 const records={[calendar.key]:calendar,[execution.key]:execution};expect(Object.keys(records)).toHaveLength(1);
});
it("バイタル分類の医師の文からも毎時の予定を作る",()=>{
 const l:StandingLine={id:'vital',cat:'バイタル',text:'バイタル 1時間ごと',by:'医師',at:{day:0,time:'09:00'},start:{day:0,time:'09:00'}};
 expect(standingMeasurementPlan([l],undefined,0)).toEqual(Array.from({length:15},(_,i)=>`${String(i+9).padStart(2,'0')}:00`));
});
it("毎時のGCSでE・V・Mと挿管中のTを保存でき、範囲外を拒む",async()=>{
 const {hourlyGcs}=await import('./hourly-gcs');
 expect(hourlyGcs('4','T','6')).toEqual({e:4,v:'T',m:6});
 expect(hourlyGcs('3','4','5')).toEqual({e:3,v:4,m:5});
 expect(hourlyGcs('','','')).toBeUndefined();
 expect(()=>hourlyGcs('5','T','6')).toThrow();
});
it("ニカルジピンの記録4.5を指示5と併記し、サマリにも現在速度を使う",()=>{
 const p=patient('99000109'),inf=SCENARIOS.icu.infusions.find(i=>i.patientId===p.id)!;
 const entry=infusionOrderEntry(inf,'医師');
 const icu={...SCENARIOS.icu,infusions:[{...inf,changes:[...inf.changes,{at:{day:0,time:'10:00'},rateMlPerH:4.5,by:'看護師'}]}]};
 expect(buildWorksheet([{patient:p,room:p.room,entries:[entry],icu}],0,1440,720).running.find(r=>r.orderId===entry.id)?.detail).toContain('4.5mL/時（指示 5）');
 expect(collectFacts(p,[entry],[],today,0,icu,720).injections.join()).toContain('持続 4.5mL/時');
 const lines=summaryFacts(p,[entry],today,{diagnoses:[],icu,now:720}).find(s=>s.heading==='注射')!.lines.join();
 expect(lines).toContain('持続 4.5mL/時');expect(lines).not.toContain('5.0mL/時');
});
