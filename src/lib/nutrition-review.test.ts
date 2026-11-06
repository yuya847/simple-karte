import { describe, expect, it } from "vitest";
import { nutritionCheck, mealMenu, dietChanges, EMPTY_KITCHEN, DISHES } from "./kitchen";
import { kitchenBans } from "./kitchen-bans";
import { nutritionWork } from "./nutrition-work";
import { nutritionPlanDraft, saveNutritionPlan } from "./nutrition-plan";
import { dysphagiaDishes } from "./kitchen-dysphagia";
import { PATIENTS } from "./patients";
import { groupsFor } from "@/components/ToolRail";
import { readDisplay } from "./display-state";
import { scenarioNutritionTeams } from "./scenarios/nutrition";
import { SCENARIOS } from "./scenarios";
import type { DietOrder } from "./diet";
import type { NutritionRecord } from "./admit-eval";
const p = PATIENTS[0];
const me = {name:"管理栄養士 高橋",role:"管理栄養士"};
const order: DietOrder = {id:"d",patientId:p.id,kind:"嚥下調整食",dysphagia:"2-1",thickness:"中間のとろみ",from:{day:-1,meal:"朝"},at:{day:-1,time:"09:00"},by:"医師"};
const n: NutritionRecord = {goal:"体重を保つ",energyKcal:1400,proteinG:55,route:"経口",counseling:"本人",reassessOn:1,by:me.name,at:{day:-3,time:"10:00"},sga:"B",assessment:"摂取量低下",food:"ペースト食",glim:"低栄養：体重減少と摂取量減少"};
describe("管理栄養士の点検の回帰",()=>{
 it("嚥下は食事指示、SGA・評価・GLIM・必要量は栄養記録から引き継ぐ",()=>{
  const patient={...p,history:[{kind:"note" as const,role:"医師" as const,day:0,time:"11:00",author:"医師",text:"嚥下評価後に経口"}]};
  const v=nutritionPlanDraft(patient,[],order,n,me);
  expect(v).toMatchObject({swallow:"嚥下調整食 2-1・水分は中間のとろみ",assessment:"SGA B：摂取量低下",glim:n.glim,energyKcal:"1400",proteinG:"55",food:"ペースト食"});
  expect(v.swallow).not.toContain("嚥下評価後");
  const saved=saveNutritionPlan({patientId:p.id,nutrition:n},p.id,v,me.name,"12:00");
  expect(saved.nutrition).toMatchObject({sga:"B",assessment:"摂取量低下",glim:n.glim});
  expect(nutritionPlanDraft(p,[],order,saved.nutrition,me).assessment).toBe(v.assessment);
  expect(nutritionPlanDraft(p,[],order,{...n,glim:undefined},me).glim).toBe("");
 });
 it("嚥下食の不足を既定量・栄養計画と比べ、個別の指示量を優先する",()=>{
  const check=nutritionCheck(order,p,0);
  expect(check.rows.find(r=>r.label==="エネルギー")).toMatchObject({ref:"指示 1400kcal",state:"under"});
  expect(nutritionCheck(order,p,0,{nutrition:{energyKcal:2000,proteinG:90}}).rows[0].ref).toBe("計画 2000kcal");
  expect(nutritionCheck({...order,energyKcal:1200},p,0,{nutrition:n}).rows[0].ref).toBe("指示 1200kcal");
  expect(nutritionCheck({...order,kind:"常食"},p,0).rows.some(r=>r.from==="dri")).toBe(false);
  expect(nutritionCheck({...order,kind:"常食"},p,0,{dri:true}).rows.filter(r=>r.from==="dri")).toHaveLength(2);
 });
 it("コードごとに主食と調理形態を変え、納豆・漬物を外し液体にコードを貼らない",()=>{
  expect(mealMenu(order,0,"朝")?.staple.kind).toBe("ペースト粥");
  for(const code of ["0j","0t","1j","2-1","2-2","3","4"] as const) {
   const dishes=dysphagiaDishes(DISHES,code,"中間のとろみ");
   expect(dishes.some(d=>/納豆|浅漬け|コード/.test(d.name))).toBe(false);
   if (["2-1","2-2","3","4"].includes(code)) expect(dishes.find(d=>d.id==="milk-thick")?.name).toContain("中間のとろみ");
   if (["0j","0t","1j"].includes(code)) expect(mealMenu({...order,dysphagia:code},0,"昼")?.dishes).toHaveLength(1);
  }
 });
 it("変更の絶食は絶食と表示し、未指定の単位を出さない",()=>{
  const changes=dietChanges([{...order,at:{day:0,time:"10:35"},from:{day:0,meal:"昼"},kind:"絶食"}]);
  expect(changes[0].text).toMatch(/^絶食：/);
  expect(changes[0].text).not.toMatch(/未指定|kcal|蛋白/);
 });
 it("指示の禁止食品も食札に渡し、給食で登録した禁止の削除位置を保つ",()=>{
  const desk={...EMPTY_KITCHEN,bans:{[p.id]:[{food:"卵",why:"本人",by:me.name,at:{day:-1,time:"10:00"}}]}};
  expect(kitchenBans(desk,{...order,prohibited:"納豆、乳"}).map(b=>b.food)).toEqual(["卵","納豆","乳"]);
 });
 it("今日の仕事は未評価・再評価・NST・未回答の指導を同じ患者から集める",()=>{
  const people=[{patient:p,room:"501",entries:[]}];
  expect(nutritionWork(people,{}, {requests:[],rounds:[]},[])[0].kind).toBe("入院時スクリーニング");
  const teams={requests:[{id:"r",patientId:p.id,team:"nst" as const,reason:"摂取不良",urgency:"通常" as const,by:"医師",at:{day:-1,time:"10:00"}}],rounds:[]};
  expect(nutritionWork(people,{[p.id]:{patientId:p.id,nutrition:n}},teams,[]).map(r=>r.kind)).toEqual(["NST 回診","栄養の再評価"]);
 });
 it("栄養士の最初の道具と開始画面を一定にする",()=>{
  const groups=groupsFor("管理栄養士");
  expect(groups[0].main.map(t=>t.key)).toEqual(["nutrition","guide-record","diet"]);
  expect(new Set(groups.flatMap(g=>[...g.main,...g.more]).map(t=>t.key)).size).toBe(groups.flatMap(g=>[...g.main,...g.more]).length);
  expect(readDisplay(JSON.stringify({area:"teams"}),"管理栄養士",new Set([p.id])).area).toBe("kitchen");
 });
 it("100人の試験データは全コード・食品アレルギー・禁止食品・異なる変更時刻を持つ",()=>{
  expect(new Set(SCENARIOS.diets.filter(d=>d.kind==="嚥下調整食").map(d=>d.dysphagia))).toEqual(new Set(["0j","0t","1j","2-1","2-2","3","4"]));
  expect(SCENARIOS.patients.filter(p=>p.allergies.length).length).toBeGreaterThanOrEqual(3);
  expect(SCENARIOS.diets.filter(d=>d.prohibited).length).toBeGreaterThan(3);
  expect(new Set(SCENARIOS.diets.filter(d=>d.at.day===0).map(d=>d.at.time)).size).toBeGreaterThan(3);
  const teams=scenarioNutritionTeams(SCENARIOS.patients);
  const people=SCENARIOS.patients.filter(p=>!p.dischargedAt && p.admittedOn<0).map(patient=>({patient,room:patient.room,entries:patient.history.filter(e=>e.kind==="order")}));
  const work=nutritionWork(people,SCENARIOS.evals,teams,[]);
  expect(work.filter(w=>w.kind==="NST 回診")).toHaveLength(3);
  expect(work.some(w=>w.kind==="NST 回診" && w.detail.startsWith("14:00"))).toBe(true);
  expect(work.some(w=>w.kind==="栄養食事指導の依頼")).toBe(true);
  const respiratory=SCENARIOS.patients[12];
  const later=respiratory.history.filter(e=>e.kind==="note" && e.day>=respiratory.admittedOn+4).map(e=>JSON.stringify(e)).join("\n");
  expect(later).not.toContain("嚥下評価後に経口摂取");
 });
});
