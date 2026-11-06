import { describe, expect, it } from "vitest";
import { nutritionPlanDraft, nutritionPressure, nutritionPlanProblems, saveNutritionPlan } from "./nutrition-plan";
import { PATIENTS } from "./patients";
import { DOC_KINDS, DOC_DEFS, docMissing } from "./documents";
import { nutritionVersions, type NutritionFields } from "./admit-eval";
const p=PATIENTS[0];const me={name:"管理栄養士",role:"管理栄養士"};
const fields:NutritionFields={goal:"摂取量を記録",energyKcal:1600,proteinG:60,route:"経口",counseling:"本人",reassessOn:7};
describe("栄養管理計画書",()=>{
 it("褥瘡の看護台帳がない場合は陰性にせず、治癒の記録も残す",()=>{
   expect(nutritionPressure([],p.id)).toEqual({});
   expect(nutritionPressure([{id:"u",patientId:p.id,site:"仙骨部",foundOn:-1,origin:"持ち込み",by:"看護師",assessments:[],healed:{day:0,time:"10:00",by:"看護師"}}],p.id).pressure).toContain("治癒の記録あり");
 });
 it("患者・直近の過去のAlb・既存の計画・職種を初期値にする",()=>{
  const labs=[{day:-2,time:"08:00",values:{Alb:3.0}},{day:0,time:"08:00",values:{Alb:3.5}},{day:1,time:"08:00",values:{Alb:4}}];
  const draft=nutritionPlanDraft(p,labs,undefined,fields,me);
  expect(draft).toMatchObject({height:String(p.heightCm),albumin:"3.5 g/dL（今日・08:00）",goal:fields.goal,energyKcal:"1600",proteinG:"60",route:"経口",counseling:"本人",reassessOn:"7",dietitian:me.name,doctor:"",nurse:""});
  expect(Number(draft.bmi)).toBeGreaterThan(0);
 });
 it("未記録の検査・判断は補わず、看護記録と食事オーダがあれば引用する",()=>{
  const patient={...p,history:[{kind:"note" as const,role:"看護師" as const,day:0,time:"09:00",author:"看護師",text:"嚥下時にむせあり\n褥瘡なし"}]};
  const v=nutritionPlanDraft(patient,[],undefined,undefined,me);expect(v.albumin).toBe("");expect(v.swallow).toBe("");expect(v.pressure).toBe("褥瘡なし");expect(v.route).toBe("");
 });
 it("保存した書類は既存評価の同じ履歴に一度だけ版を追加する",()=>{
  const values={...nutritionPlanDraft(p,[],undefined,fields,me),explainedTo:"本人に説明",food:"常食"};
  expect(nutritionPlanProblems(values)).toEqual([]);expect(docMissing("栄養管理計画書",values)).toEqual([]);
  const first=saveNutritionPlan(undefined,p.id,values,me.name,"10:00");expect(first.nutrition?.goal).toBe(fields.goal);
  const next=saveNutritionPlan(first,p.id,{...values,energyKcal:"1800"},me.name,"11:00");const versions=nutritionVersions(next.nutrition!);expect(versions).toHaveLength(2);expect(versions.map(v=>v.energyKcal)).toEqual([1600,1800]);expect(first.nutrition?.energyKcal).toBe(1600);
 });
 it("書類一覧と様式に含め、不正な必要量・再評価を保存させない",()=>{
  expect(DOC_KINDS).toContain("栄養管理計画書");expect(DOC_DEFS.栄養管理計画書.fields.some(f=>f.key==="waterMl")).toBe(true);
  expect(()=>saveNutritionPlan(undefined,p.id,{energyKcal:"NaN",proteinG:"-1",reassessOn:""},me.name,"10:00")).toThrow();
 });
});
