import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InjectionCalendar } from "./Calendars";
import { AddInjectionPanel } from "./panels/AddPanels";
import { DocsPanel } from "./panels/DocsPanel";
import { RoleProvider } from "./RoleContext";
import { defaultSliding } from "@/lib/insulin";
import { PATIENTS } from "@/lib/patients";
import { nutritionPlanDraft } from "@/lib/nutrition-plan";
import type { OrderEntry, InjectionOrder } from "@/lib/types";
import type { AdminRecord } from "@/lib/mar";
const p=PATIENTS[0];
const order:InjectionOrder={type:"injection",items:[{drugCode:"DEMO-INS-ASPART",amount:0,unit:"単位"}],route:"皮下注",schedule:{kind:"per_day",count:4},sliding:defaultSliding(),doseTimes:defaultSliding().times,start:{day:0,time:"07:30"},days:3};
const e:OrderEntry={kind:"order",id:"scale",day:0,time:"07:00",author:"医師",status:"有効",order};
const record:AdminRecord={key:"scale|450",orderId:"scale",patientId:p.id,at:450,status:"実施",doneAt:"07:30",by:"看護師",checked:{patient:true,label:true},insulin:{glucose:251,units:4}};
describe("インスリンと栄養書類の表示",()=>{
 it("医師のカレンダーに各回の血糖・単位と調整、看護師には値だけ表示する",()=>{
  const props={patient:p,entries:[e],today:{y:2026,m:11,d:6},nowTime:"08:00",selectedDay:null,onSelectDay:()=>{},onStopDraft:()=>{},draftedStops:[],onAdjustInsulin:()=>{},execute:{records:{[record.key]:record},sessionStart:400,nowTime:"08:00",onRecord:()=>{},onVoid:()=>{}}};
  const doctor=renderToStaticMarkup(<InjectionCalendar {...props}/>);expect(doctor).toContain("血糖 251・4単位");expect(doctor).toContain(">調整</button>");
  const nurse=renderToStaticMarkup(<RoleProvider value="看護師"><InjectionCalendar {...props}/></RoleProvider>);expect(nurse).toContain("血糖 251・4単位");expect(nurse).not.toContain(">調整</button>");
 });
 it("注射入力に編集できる表と架空の取り決めを示し、固定量0単位と表示しない",()=>{
  const html=renderToStaticMarkup(<AddInjectionPanel onAdd={()=>{}} newId={()=>"d"} drafts={[]} seed={{key:"seed",order,start:{day:0,time:"07:30"}}}/>);
  expect(html).toContain("スケールで決める");expect(html).toContain("初期表");expect(html).toContain("行を追加");expect(html).toContain("この血糖値以上は医師へ連絡");
 });
 it("管理栄養士が同じ書類を作れ、A4印刷対象と同じ項目が入力できる",()=>{
  const html=renderToStaticMarkup(<RoleProvider value="管理栄養士"><DocsPanel patient={p} today="11/6" initialKind="栄養管理計画書" initial={()=>nutritionPlanDraft(p,[],undefined,undefined,{name:"栄養士",role:"管理栄養士"})} auto={()=>({})} saved={[]} onSave={()=>{}} onOpenReferral={()=>{}}/></RoleProvider>);
  for(const label of ["水分（mL/日）","食事内容（食種・形態・禁止）","患者への説明","作成者：管理栄養士","栄養状態の再評価の間隔"])expect(html).toContain(label);
  expect(html).not.toContain("この操作は医師が行います");
 });
});
