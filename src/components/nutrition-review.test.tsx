import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NutritionPanel } from "./NutritionPanel";
import { KitchenChanges } from "./KitchenChanges";
import { DietPanel } from "./panels/DietPanel";
import { NutritionToday } from "./NutritionToday";
import { PATIENTS } from "@/lib/patients";
import { requirements } from "@/lib/nutrition";
import { EMPTY_KITCHEN } from "@/lib/kitchen";
import { RoleProvider } from "./RoleContext";
import type { DietOrder } from "@/lib/diet";
const p=PATIENTS[0],today={y:2026,m:11,d:7};
const as=(node:React.ReactNode)=>renderToStaticMarkup(<RoleProvider value="管理栄養士">{node}</RoleProvider>);
describe("管理栄養士の画面",()=>{
 it("新しい計画の必要量は計算値で始まり、不足項目と朝昼夕のラベルが出る",()=>{
  const html=as(<NutritionPanel patient={p} diets={[]} today={today} nowTime="09:00" onSave={()=>{}} />);
  const kg=p.daily.filter(d=>d.day<=0 && d.weightKg).sort((a,b)=>b.day-a.day)[0]?.weightKg ?? p.weightKg;
  const result=requirements(p.sex,p.age,kg,p.heightCm,1.2,1,1)!;
  expect(html).toContain(`value="${result.kcal}"`);expect(html).toContain(`value="${result.protein}"`);
  expect(html).toContain("足りないもの：SGA、評価、目標、食事の内容");
  expect(html).toContain("朝／昼／夕（主食・割）");
 });
 it("再評価では計画を記録できない理由を表示する",()=>{
  const html=as(<NutritionPanel patient={p} evaluation={{patientId:p.id,nutrition:{sga:"B",assessment:"摂取量低下",food:"ペースト食",goal:"体重維持",energyKcal:1400,proteinG:55,route:"経口",counseling:"",reassessOn:7,at:{day:-1,time:"10:00"},by:"管理栄養士"}}} diets={[]} today={today} nowTime="09:00" onSave={()=>{}} />);
  expect(html).toContain("足りないもの：再評価の理由");
 });
 it("今日の変更は対象患者だけの名前・病棟・部屋を出す",()=>{
  const base:DietOrder={id:"d",patientId:p.id,kind:"常食",from:{day:0,meal:"夕"},at:{day:0,time:"11:35"},by:"医師"};
  const html=as(<KitchenChanges people={[{patient:{...p,ward:""},room:p.room}]} diets={[base,{...base,id:"outside",patientId:"90035074"}]} desk={EMPTY_KITCHEN} onDesk={()=>{}} nowTime="12:00" />);
  expect(html).toContain(p.name);expect(html).toContain(p.room);expect(html).not.toContain("90035074");expect(html).not.toContain("未指定");
 });
 it("開始日はDayInputだけにし、嚥下食のkcal・蛋白を入力できる",()=>{
  const html=as(<DietPanel patient={p} today={today} nowTime="06:00" doctor="医師" diets={[]} entries={[]} initial={{kind:"嚥下調整食",dysphagia:"2-1",from:{day:0,meal:"昼"}}} onSave={()=>{}} />);
  expect(html.match(/type="date"/g)).toHaveLength(1);expect(html).not.toContain('aria-label="日"');
  expect(html).toContain('aria-label="エネルギー kcal"');expect(html).toContain('aria-label="蛋白 g"');
 });
 it("ホームで対象患者のスクリーニングを表示する",()=>{
  const html=as(<NutritionToday people={[{patient:p,room:p.room,entries:[]}]} evaluations={{}} teams={{requests:[],rounds:[]}} guidance={[]} today={today} />);
  expect(html).toContain("今日の仕事");expect(html).toContain("入院時スクリーニング");expect(html).toContain(p.name);
 });
});

it("今日を先頭に、期限切れは閉じた一覧、予定はその後に分ける", () => {
 const html=as(<NutritionToday people={[-7,0,7].map((day,i)=>({patient:{...p,id:`p${i}`,name:`対象${i}`,admittedOn:day},room:p.room,entries:[]}))} evaluations={{}} teams={{requests:[],rounds:[]}} guidance={[]} today={today} />);
 expect(html).toContain("今日の仕事（1）");
 expect(html).toContain("期限切れ（1）");
 expect(html).toContain("これから（1）");
 expect(html.indexOf("対象1")).toBeLessThan(html.indexOf("<details>"));
 expect(html.indexOf("対象0")).toBeGreaterThan(html.indexOf("<details>"));
 expect(html).not.toContain("<details open");
});
