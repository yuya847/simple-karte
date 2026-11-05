import { describe, expect, it } from "vitest";
import { adjustInsulin, defaultSliding, insulinAdjustmentEntries, slidingProblems, slidingUnits } from "./insulin";
import { INTERACTIONS } from "./interactions";
import { DRUGS } from "./master";
import { PATIENTS } from "./patients";
import { currentEntries } from "./record";
import { doseTimes } from "./flowsheet";
import { buildWorksheet, orderChanges, sessionChangeKeys } from "./worksheet";
import { takeRows } from "./order-take";
import { menuRecord, occurrencesOn } from "./order-execute";
import { glucosePoints } from "./flow-meds";
import { cancelAdministration } from "./mar";
import type { InjectionOrder, OrderEntry } from "./types";
const fixed: InjectionOrder = {type:"injection",items:[{drugCode:"DEMO-INS-ASPART",amount:8,unit:"単位"}],route:"皮下注",schedule:{kind:"per_day",count:1},doseTimes:["07:30"],start:{day:-2,time:"07:30"},days:7};
const entry:OrderEntry = {kind:"order",id:"old",day:-2,time:"09:00",author:"医師",status:"有効",order:fixed};
const p = {...PATIENTS[0],history:[entry]};
describe("インスリンのスケールと調整",()=>{
 it("架空の5品目は単位・皮下注で薬価を持たない",()=>{
  const all=DRUGS.filter(d=>d.category === "インスリン"); expect(all).toHaveLength(5);
  expect(INTERACTIONS.some(pair=>[...pair.a,...pair.b].some(code=>all.some(d=>d.code === code)))).toBe(false);
  for(const d of all){expect(d.units).toEqual(["単位"]);expect(d.routes).toEqual(["皮下注"]);expect(d.package).toContain("架空");expect(d).not.toHaveProperty("price");}
 });
 it("血糖範囲の境界、0単位、上限なしをコードで求める",()=>{
  const rows=defaultSliding().rows;
  expect([0,199,200,249,250,299,300,349,350,999].map(v=>slidingUnits(rows,v))).toEqual([0,0,2,2,4,4,6,6,8,8]);
  for(const v of [-1,NaN,Infinity,200.5]) expect(slidingUnits(rows,v)).toBeNull();
 });
 it("範囲の重複・抜け・負の単位・不正な時刻を拒否",()=>{
  const s=defaultSliding(); s.rows[1].from=199; expect(slidingUnits(s.rows,200)).toBeNull();
  s.rows[1].from=201;expect(slidingProblems(s).length).toBeGreaterThan(0);
  s.rows=defaultSliding().rows;s.rows[0].units=-1;expect(slidingUnits(s.rows,1)).toBeNull();
  expect(slidingProblems({...defaultSliding(),times:["25:00"]})).not.toEqual([]);
 });
 it("固定量を明日から変更し、今日までの予定・残日数・入力を保持",()=>{
  const snapshot=structuredClone(fixed);const {stop,next}=adjustInsulin(fixed,{units:10},0);
  expect(stop.end).toEqual({day:0,time:"24:00"});expect(next.start).toEqual({day:1,time:"07:30"});expect(next.items[0].amount).toBe(10);expect(next.days).toBe(4);expect(fixed).toEqual(snapshot);
  expect(()=>adjustInsulin(fixed,{units:NaN},0)).toThrow();expect(adjustInsulin({...fixed,days:3},{units:10},0).next.days).toBe(1);
  expect(adjustInsulin({...fixed,days:undefined,end:{day:0,time:"23:00"}},{units:10},0).next).toMatchObject({start:{day:1},days:1,end:undefined});
  expect(()=>adjustInsulin({...fixed,days:1},{units:10},0)).toThrow();
 });
 it("スケールの変更は別の表として残し、時刻も引き継ぐ",()=>{
  const o={...fixed,sliding:defaultSliding()}; const sliding=defaultSliding();sliding.rows[1].units=3;
  const {next}=adjustInsulin(o,{sliding},0);sliding.rows[1].units=99;
  expect(next.sliding!.rows[1].units).toBe(3);expect(o.sliding.rows[1].units).toBe(2);expect(next.doseTimes).toEqual(defaultSliding().times);
 });
 it("同じ薬の変更は指示受けに変更として出て、元の指示の今日の回を失わない",()=>{
  const next=insulinAdjustmentEntries(entry,{units:9},0,"new","医師","10:00");
  const changes={added:[next],stopped:[]}; const entries=currentEntries(p,changes).filter((e):e is OrderEntry=>e.kind==="order");
  expect(doseTimes(entries[0],600,0,1440)).toEqual([450]);expect(doseTimes(entries[0],600,1440,2880)).toEqual([]);expect(doseTimes(entries[1],600,1440,2880)).toEqual([1890]);
  const people=[{patient:p,room:p.room,entries}];const rows=takeRows(orderChanges(people,0,600),people,{y:2026,m:11,d:6});expect(rows[0].kind).toBe("変更");expect(rows[0].before).toBeDefined();expect(rows[0].diff?.some(d=>d.after.includes("9単位"))).toBe(true);expect(sessionChangeKeys({[p.id]:changes}).has(rows[0].key)).toBe(true);
 });
 it("測定時刻をワークシートに展開し、血糖なしの実施を防ぎ、血糖と単位を経過表へ渡す",()=>{
  const e={...entry,id:"scale",day:0,order:{...fixed,start:{day:0,time:"00:00"},sliding:defaultSliding(),schedule:{kind:"per_day" as const,count:4}}};
  const ws=buildWorksheet([{patient:p,room:p.room,entries:[e]}],0,1440,600);expect(ws.timed.map(w=>w.at)).toEqual([450,690,1050,1260]);
  const item=occurrencesOn(p,e,0,600).timed[1];const args={status:"実施" as const,day:0,time:"11:30",by:"看護師"};expect(menuRecord(item,args)).toBeNull();
  const record=menuRecord(item,{...args,glucose:251})!;expect(record.insulin).toEqual({glucose:251,units:4});
  expect(glucosePoints([],[],[],[record])).toMatchObject([{value:251,at:690,source:"簡易血糖"}]);
  expect(glucosePoints([],[],[],[cancelAdministration(record,"看護師","11:31")])).toEqual([]);
 });
});
