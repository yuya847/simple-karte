import type { Patient, LabResult } from "./types";
import type { NutritionFields, AdmitEval } from "./admit-eval";
import { reviseNutrition } from "./admit-eval";
import { dietLabel, type DietOrder } from "./diet";
import { bmi } from "./nutrition";
export const NUTRITION_PLAN_SOURCE = "https://kouseikyoku.mhlw.go.jp/kantoshinetsu/kihon080305.pdf";
export function nutritionPlanDraft(patient: Patient, labs: LabResult[], diet: DietOrder | undefined, fields: (NutritionFields & {assessment?:string;sga?:string;food?:string;glim?:string}) | undefined, me: {name:string;role:string}): Record<string,string> {
 const latest = labs.filter(l=>l.day<=0 && l.values.Alb != null).sort((a,b)=>b.day-a.day || b.time.localeCompare(a.time))[0];
 const weight = patient.daily.filter(d=>d.day<=0 && d.weightKg != null).sort((a,b)=>b.day-a.day)[0]?.weightKg ?? patient.weightKg;
 const nursing = patient.history.filter(e=>e.kind === "note" && e.role === "看護師" && e.day<=0).sort((a,b)=>b.day-a.day || b.time.localeCompare(a.time));
 const finding = (word:string) => { for(const e of nursing) {if(e.kind !== "note") continue; const text=[e.text,...Object.values(e.soap ?? {}),...(e.timeline ?? []).map(t=>t.text),...(e.focus ?? []).map(f=>[f.title,f.d,f.act,f.r].filter(Boolean).join(" "))].filter(Boolean).join("\n"); const lines=text.split(/\n/).filter(l=>l.includes(word)); if(lines.length) return lines.join("\n");} return ""; };
 const intake = patient.daily.filter(d=>d.day<=0 && d.meals).sort((a,b)=>b.day-a.day)[0]?.meals;
 return {height:String(patient.heightCm),weight:String(weight),bmi:bmi(weight,patient.heightCm)?.toFixed(1) ?? "",albumin:latest ? `${latest.values.Alb} g/dL（${latest.day === 0 ? "今日" : `${-latest.day}日前`}・${latest.time}）` : "",intake:intake ? Array.isArray(intake) ? intake.map(v=>v==null?"未記録":`${v}割`).join("／") : intake : "",pressure:finding("褥瘡"),swallow:diet ? dietLabel(diet) : "",swallowDiet:diet?.kind === "嚥下調整食" ? dietLabel(diet) : "",glim:fields?.glim ?? "",sga:fields?.sga ?? "",risk:fields?.sga ? `SGA ${fields.sga}` : "",assessment:[fields?.sga && `SGA ${fields.sga}`,fields?.assessment].filter(Boolean).join("："),goal:fields?.goal ?? "",energyKcal:fields ? String(fields.energyKcal) : "",proteinG:fields ? String(fields.proteinG) : "",route:fields?.route ?? "",food:fields?.food || (diet ? dietLabel(diet) : patient.dietNow ?? ""),counseling:fields?.counseling ?? "",reassessOn:fields ? String(fields.reassessOn) : "",doctor:me.role === "医師" ? me.name : "",dietitian:me.role === "管理栄養士" ? me.name : "",nurse:me.role === "看護師" ? me.name : ""};
}
export const NUTRITION_PLAN_FIELDS = [
 ["madeAt","計画作成日",true],["ward","病棟",true],["admitted","入院日",true],["diagnosis","病名",true],["height","身長（cm）"],["weight","体重（kg）"],["bmi","BMI（体格指数）"],["albumin","血液検査（Alb）"],["intake","食事摂取状況"],["pressure","褥瘡"],["swallow","嚥下"],["risk","入院時栄養状態に関するリスク"],["assessment","栄養状態の評価と課題"],["glim","GLIM基準による評価（非対応・判定・該当項目）"],["goal","栄養管理の目標"],["energyKcal","エネルギー（kcal/日）"],["proteinG","たんぱく質（g/日）"],["waterMl","水分（mL/日）"],["route","栄養補給方法"],["food","食事内容（食種・形態・禁止）"],["swallowDiet","嚥下調整食の必要性・学会分類コード"],["precautions","留意事項"],["admissionGuidance","入院時栄養食事指導の必要性・内容・実施予定日"],["counseling","栄養食事相談（必要性・内容・実施予定日）"],["dischargeGuidance","退院時の指導の必要性・内容・実施予定日"],["otherIssues","その他栄養管理上解決すべき課題に関する事項"],["overall","退院時及び終了時の総合的評価"],["dischargeIssues","退院時・終了時の課題"],["interval","栄養状態の再評価の間隔"],["reassessOn","再評価の予定（今日から何日後）"],["doctor","作成者：医師"],["dietitian","作成者：管理栄養士"],["nurse","作成者：看護師"],["explainedTo","患者への説明（相手・日時・内容）"]
].map(([key,label,auto])=>({key:String(key),label:String(label),auto:!!auto,optional:!["goal","energyKcal","proteinG","route","reassessOn","explainedTo"].includes(String(key)), ...(key === "route" ? {choices:["経口","経腸栄養","静脈栄養"]} : {} )}));
export function nutritionPlanProblems(v:Record<string,string>):string[] {return ["energyKcal","proteinG","reassessOn"].filter(k=>!v[k]?.trim() || !Number.isFinite(Number(v[k])) || Number(v[k])<=0 || (k==="reassessOn" && !Number.isInteger(Number(v[k])))).map(k=>NUTRITION_PLAN_FIELDS.find(f=>f.key===k)!.label);}
export function saveNutritionPlan(e:AdmitEval|undefined, patientId:string,v:Record<string,string>,by:string,time:string):AdmitEval {
 if(nutritionPlanProblems(v).length || !["経口","経腸栄養","静脈栄養"].includes(v.route)) throw new Error("目標量・再評価の予定・補給方法を確認してください。");
 const fields:NutritionFields = {goal:v.goal,energyKcal:Number(v.energyKcal),proteinG:Number(v.proteinG),route:v.route as NutritionFields["route"],counseling:v.counseling ?? "",reassessOn:Number(v.reassessOn)};
 const nutrition=e?.nutrition ? reviseNutrition(e.nutrition,fields,by,{day:0,time},{kind:"訂正",reason:"栄養管理計画書を保存"}) : {...fields,by,at:{day:0,time}};
 return {...e,patientId,nutrition:{...nutrition,food:v.food,glim:v.glim,sga:v.sga ?? nutrition.sga,assessment:v.sga && v.assessment?.startsWith(`SGA ${v.sga}：`) ? v.assessment.slice(`SGA ${v.sga}：`.length) : v.assessment}};
}

/** Use the nursing ulcer register when it contains a record; no record does not mean absent. */
export function nutritionPressure(ulcers: import("./pressure-course").PressureUlcer[], patientId: string): Record<string,string> {
 const mine=ulcers.filter(u=>u.patientId === patientId && u.foundOn<=0);
 return mine.length ? {pressure:mine.map(u=>`${u.site}${u.siteNote ?? ""}：${u.healed && u.healed.day<=0 ? "治癒の記録あり" : "褥瘡の記録あり"}`).join("、")} : {};
}
