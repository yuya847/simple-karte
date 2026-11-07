import { expect, it } from "vitest";
import { pendingChartDrafts } from "../confirmed-drafts";
import { merge3 } from "../merge-workspace";
import { ioLines, ioTotal } from "../io-balance";
import { patientForCurrentDisplay, currentOxygen } from "./current-oxygen";
import { currentInfusion } from "./current-infusion";
import { labColumns, labRows, cellOf } from "../lab-table";
import { icuHandoffFacts } from "./handoff";
import { boardRows } from "./board";
import { createDischargeDraft } from "../discharge";
import { latest, submit } from "../nursing-summary";
import { moveConflict } from "./move-conflict";
import { icuPatient as p, icuFixture } from "./test-fixture";
import type { InjectionOrder, OrderEntry, ProcedureOrder } from "../types";
const today = { y: 2026, m: 11, d: 7 };
const move: ProcedureOrder = { type:"procedure", code:"PROC-MOVE", start:{day:1,time:"10:00"}, schedule:{kind:"once"}, move:{kind:"転棟",to:{room:"502",bed:""},reason:"架空"} };
it("確定済みの下書きは旧スナップショットと合流しても再表示しない", () => {
 const drafts = merge3([], [{id:"map-draft"}], [{id:"map-draft"}]) as {id:string}[];
 expect(pendingChartDrafts(drafts,["map-draft"])).toEqual([]);
 expect(pendingChartDrafts([{id:"new"}],["map-draft"])).toEqual([{id:"new"}]);
});
it("経過表に渡す共通の出納行は時間尿と持続投与を含む", () => {
 const icu=icuFixture(); const lines=ioLines({patientId:p.id,entries:[],typed:[],records:{},sessionStart:1020,nowAbs:1020,from:0,icu});
 const t=ioTotal(lines,{lo:0,hi:1020});
 expect(t.in).toBeCloseTo(4.9*17); expect(t.out).toBe(30*17);
});
it("モニターの最新バイタルは現在のFiO2、過去の記録は保持", () => {
 const icu=icuFixture();icu.vents.push({...icu.vents[0],id:"new",at:{day:0,time:"10:00"},fio2:.35});
 const patient={...p,currentOxygen:currentOxygen(icu,p.id,1020),vitals:[{...p.vitals[0],o2:"FiO2 0.4"}]};
 expect(patientForCurrentDisplay(patient).vitals.at(-1)?.o2).toContain("0.35");expect(patient.vitals[0].o2).toBe("FiO2 0.4");
});
it("持続投与の速さは小数1桁とγで表示", () => {
 const icu=icuFixture();icu.infusions[0].changes=[{at:{day:0,time:"00:00"},rateMlPerH:3.2640000000000002,by:"架空"}];
 const o={continuous:{infusionId:icu.infusions[0].id}} as InjectionOrder;
 expect(currentInfusion(o,icu,p.id,1020)?.text).toBe("持続 3.3mL/時・0.08γ");
});
it("検査表は患者の血液ガスの同じ値を読む", () => {
 const values={pH:7.35,PaO2:80,PaCO2:42,HCO3:23};const cols=labColumns([{day:0,time:"10:00",values}],[],"旧→新",null);
 const rows=labRows(cols,p.sex,false);expect(rows.map(r=>r.code)).toEqual(expect.arrayContaining(Object.keys(values)));
 for(const r of rows)expect(cellOf(cols[0],r,p.sex)).toMatchObject({value:values[r.code as keyof typeof values]});
});
it("申し送りは24時間の両端、一覧は今日の範囲と現在の病棟日数", () => {
 const icu=icuFixture();icu.stays[0].out={day:-1,time:"00:00"};icu.stays.push({id:"hcu",patientId:p.id,unit:"HCU",in:{day:-1,time:"00:00"},from:"ICU",reason:"架空"});
 expect(icuHandoffFacts(p,icu,1020).join("\n")).toContain("昨日 17:00〜今日 17:00");
 const row=boardRows("HCU",[{...p,ward:"HCU"}],[{room:"HCU1",bed:"",patientId:p.id}],icu,0,1020)[0];
 expect(row.days).toBe("HCU 2日目（ICU から 3日目）");expect(row.balance24h?.range).toBe("今日 0〜17時");
});
it("退院サマリの初期値は未選択、速度変更とライン日数を原記録から入れる", () => {
 const icu=icuFixture();icu.infusions[0].changes.push({at:{day:0,time:"10:00"},rateMlPerH:3.264,by:"架空"});
 const d=createDischargeDraft(p,[],[],today,undefined,icu,1020);
 expect(d.outcome).toBe("");expect(d.route).toBe("");expect(d.sections.course).toContain("3.3mL/時・0.08γ");expect(d.sections.course).toContain("CVC");expect(d.sections.course).toContain("3日目");
});
it("提出した看護本文は保存し直しても同じ版から読める", () => {
 const s=submit("s",p.id,"中間",{words:"架空の申し送り",sections:[{heading:"出納",lines:["記録"]}],by:"架空",at:{day:0,time:"17:00"}});
 expect(latest(JSON.parse(JSON.stringify(s)))).toMatchObject({words:"架空の申し送り",sections:[{heading:"出納",lines:["記録"]}]});
});
it("転出先502の在床を警告し、予定時刻までの退院だけを反映", () => {
 const occupant={...p,id:"other",name:"架空 太郎",room:"502"};const beds=[{room:"502",bed:"",patientId:occupant.id}];
 expect(moveConflict(p.id,move,beds,[p,occupant],{})).toBe("502 は架空 太郎さんが在床");
 const leave:OrderEntry={kind:"order",id:"l",day:0,time:"09:00",author:"架空",status:"有効",order:{type:"procedure",code:"PROC-LEAVE",start:{day:1,time:"09:00"},schedule:{kind:"once"},leave:{kind:"退院",from:{day:1,time:"09:00"},destination:"架空",note:""}}};
 expect(moveConflict(p.id,move,beds,[p,occupant],{other:[leave]})).toBeUndefined();
 if (leave.order.type === "procedure" && leave.order.leave) leave.order.leave.from.time = "11:00";
 expect(moveConflict(p.id,move,beds,[p,occupant],{other:[leave]})).toContain("在床");
});
it("単独端末の再読込でも転棟の確定済み下書きは復活せず、別種の指示を保持", async () => {
 const {transferCharts,restoreTransferCharts}=await import("../use-transfer-summary-persistence");
 const {newProcedureDraft}=await import("../drafts");
 const d=newProcedureDraft("PROC-MOVE","draft");
 const blank=()=>({added:[] as OrderEntry[],drafts:[] as import("../drafts").Draft[],confirmedDraftIds:[] as string[]});
 const entry:OrderEntry={kind:"order",id:"move",day:0,time:"09:00",author:"架空",status:"有効",order:move};
 const saved=transferCharts({[p.id]:{...blank(),added:[entry],confirmedDraftIds:[d.id]},[`${p.id}|医師`]:{...blank(),drafts:[d]}});
 const restored=restoreTransferCharts({},JSON.parse(JSON.stringify(saved)),blank);
 expect(restored[`${p.id}|医師`].drafts).toEqual([]);expect(restored[p.id].added).toEqual([entry]);
});
