"use client";
import { useState } from "react";
import { bmi, requirements, weightLoss } from "@/lib/nutrition";
import { nutritionVersions, type AdmitEval, type NutritionRecord } from "@/lib/admit-eval";
import { dietAt, dietLabel, type DietOrder } from "@/lib/diet";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import type { Patient } from "@/lib/types";
import { auditLog } from "@/lib/audit";
import { usePrintSheet } from "./DeskParts";
import { useDeny, useMe } from "./RoleContext";

const field = "rounded border border-rule bg-paper px-2 py-1";
export function NutritionPanel({ patient: p, evaluation, diets, today, nowTime, onSave }: { patient: Patient; evaluation?: AdmitEval; diets: DietOrder[]; today: CalendarDate; nowTime: string; onSave: (e: AdmitEval, text: string) => void }) {
  const me = useMe(); const deny = useDeny(); const [print, sheet] = usePrintSheet();
  const n = evaluation?.nutrition;
  const [goal, setGoal] = useState(n?.goal ?? "");
  const [assessment, setAssessment] = useState(n?.assessment ?? "");
  const [sga, setSga] = useState(n?.sga ?? "");
  const [activity, setActivity] = useState(1.2); const [stress, setStress] = useState(1);
  const [protein, setProtein] = useState(1);
  const [energy, setEnergy] = useState(n?.energyKcal ?? 0); const [proteinG, setProteinG] = useState(n?.proteinG ?? 0);
  const [route, setRoute] = useState<NutritionRecord["route"]>(n?.route ?? "経口");
  const [food, setFood] = useState(n?.food ?? ""); const [days, setDays] = useState(n?.reassessOn ?? 7);
  const [reason, setReason] = useState(""); const [saved, setSaved] = useState("");
  const weights = p.daily.filter(x => x.weightKg && x.day <= 0).sort((a,b) => b.day - a.day);
  const kg = weights[0]?.weightKg ?? p.weightKg;
  const baseline = (day: number) => weights.find(x => x.day <= day)?.weightKg;
  const show = (v: number | null | undefined) => v == null ? "記録なし" : v.toFixed(1);
  const loss = (day: number) => { const w = baseline(day); return w ? `${show(weightLoss(kg, w))}%（${w}kg）` : "記録なし"; };
  const result = requirements(p.sex, p.age, kg, p.heightCm, activity, stress, protein);
  const diet = dietAt(diets, p.id, 0, "夕");
  const latestLab = (key: string) => { const r = p.labs.filter(x => x.day <= 0 && x.values[key] != null).sort((a,b) => b.day - a.day || b.time.localeCompare(a.time))[0]; return r ? `${r.values[key]}（${formatShort(addDays(today, r.day))} ${r.time}）` : "記録なし"; };
  const intake = p.daily.filter(x => x.meals && x.day <= 0).sort((a,b) => b.day-a.day).slice(0,3).map(x => `${formatShort(addDays(today,x.day))} ${Array.isArray(x.meals) ? x.meals.map(v => v ?? "未記録").join("／") : x.meals}`).join("、") || "記録なし";
  const body = `身長 ${p.heightCm}cm・体重 ${kg}kg・BMI ${show(bmi(kg,p.heightCm))}\n体重減少率：入院時 ${loss(p.admittedOn)}／1か月前 ${loss(-30)}\nAlb ${latestLab("Alb")}／CRP ${latestLab("CRP")}\n食事摂取量（主食・割）：${intake}\nSGA ${sga || "未選択"}：${assessment}`;
  const text = `栄養管理計画\n${body}\n目標：${goal}\n必要量：${energy}kcal・蛋白${proteinG}g/日\n算定：Harris-Benedict ${result?.basal ?? "算定不可"} × 活動${activity} × ストレス${stress}、蛋白${protein}g/kg\n食事：${food}\n現在の食事指示：${dietLabel(diet)}\n経路：${route}\n再評価：${formatShort(addDays(today, days))}\n${me.name} ${formatShort(today)} ${nowTime}`;
  const valid = !!sga && !!assessment.trim() && !!goal.trim() && !!food.trim() && energy > 0 && proteinG > 0 && Number.isFinite(energy + proteinG + days) && Number.isInteger(days) && days >= 1 && (!n || !!reason.trim());
  return <div className="space-y-4 p-4 text-sm">{sheet}
    <section className="space-y-2"><h3 className="font-bold">栄養評価</h3><p className="whitespace-pre-line">{body.split("\nSGA")[0]}</p>

      <label>SGA（主観的包括的栄養評価）<select className={field} value={sga} onChange={e => setSga(e.target.value)}><option value="">選択してください</option>{["A", "B", "C"].map(v => <option key={v}>{v}</option>)}</select></label>
      <label className="block">評価<textarea className={`${field} w-full`} value={assessment} onChange={e => setAssessment(e.target.value)} /></label>
      <p className="hint">判定は人が選びます。体重減少率＝（比較時の体重−現在の体重）÷比較時の体重×100。比較日以前の最新記録を使い、記録がなければ空欄です。浮腫などの影響は評価に記載してください。</p>
    </section>
    <section className="space-y-2"><h3 className="font-bold">必要量の計算（成人）</h3>
      <label>活動係数<select className={field} value={activity} onChange={e => setActivity(Number(e.target.value))}>{[[1.2,"ベッド上"],[1.3,"病棟内"],[1.5,"歩行あり"]].map(([v,l]) => <option key={v} value={v}>{l}：{v}</option>)}</select></label>
      <label>ストレス係数<select className={field} value={stress} onChange={e => setStress(Number(e.target.value))}>{[1,1.1,1.2,1.3,1.5].map(v => <option key={v}>{v}</option>)}</select></label>
      <label>蛋白 g/kg<input className={field} type="number" min="0.1" step="0.1" value={protein} onChange={e => setProtein(Number(e.target.value))} /></label>
      <p>{result ? `基礎代謝 ${result.basal} × ${activity} × ${stress} ＝ ${result.kcal}kcal、蛋白${result.protein}g/日` : "成人の有効な測定値を確認してください。"}</p>
      <p>現在の食事：{dietLabel(diet)}／{diet?.energyKcal ?? "未指定"}kcal・蛋白{diet?.proteinG ?? "未指定"}g</p>
      <p>計算量 − 指示量：{result && diet?.energyKcal != null ? `${result.kcal-diet.energyKcal}kcal` : "比較不可"}／{result && diet?.proteinG != null ? `${(result.protein-diet.proteinG).toFixed(1)}g` : "比較不可"}</p>
      <button type="button" disabled={!result} className={field} onClick={() => { if(result) {setEnergy(result.kcal);setProteinG(result.protein);} }}>計算値を計画に入れる</button>
      <p className="hint">活動・ストレス係数と蛋白量の初期値は、教科書的な一般値を参考にした架空の病院の取り決めです。疾患別の推奨ではありません。Harris-Benedict（原式）：男 66.473＋13.7516W＋5.0033H−6.755A、女 655.0955＋9.5634W＋1.8496H−4.6756A（W kg、H cm、A 歳）。<a href="https://nutritionalassessment.mumc.nl/en/calculating-energy-expenditure" target="_blank" rel="noreferrer">出典：Maastricht University Medical Center 栄養評価</a>。実測値と病態を確認し、人が必要量を決めます。</p>
    </section>
    <section className="space-y-2"><h3 className="font-bold">栄養管理計画書</h3>
      <label className="block">目標<textarea className={`${field} w-full`} value={goal} onChange={e => setGoal(e.target.value)} /></label>
      <label>必要量 kcal/日<input className={field} type="number" value={energy} onChange={e => setEnergy(Number(e.target.value))} /></label>
      <label>蛋白 g/日<input className={field} type="number" value={proteinG} onChange={e => setProteinG(Number(e.target.value))} /></label>
      <label className="block">食事の内容<textarea className={`${field} w-full`} value={food} onChange={e => setFood(e.target.value)} /></label>
      <label>経路<select className={field} value={route} onChange={e => setRoute(e.target.value as NutritionRecord["route"])}>{["経口","経腸栄養","静脈栄養"].map(v => <option key={v}>{v}</option>)}</select></label>
      <label>再評価（何日後）<input className={field} type="number" min="1" step="1" value={days} onChange={e => setDays(Number(e.target.value))} /></label><span>{formatShort(addDays(today,days || 0))}</span>
      {n && <label className="block">再評価の理由<input className={`${field} w-full`} value={reason} onChange={e => setReason(e.target.value)} /></label>}
      <button type="button" disabled={!valid || !!deny("assess.nutrition")} className="rounded bg-ai px-3 py-1 text-white disabled:opacity-40" onClick={() => {
        const next: NutritionRecord = { goal, energyKcal: energy, proteinG, route, counseling: n?.counseling ?? "", reassessOn: days, assessment, sga, food, by: me.name, at: { day: 0, time: nowTime }, ...(n ? { earlier: nutritionVersions(n), revision: { kind: "再評価", reason } } : {}) };
        auditLog({role: me.role, actor: me.name, action: "確定（栄養管理計画）", patient: p.name, detail: text});
        onSave({ ...evaluation, patientId: p.id, nutrition: next }, text); setSaved("記録しました。再評価日は入院時の評価・やることと共通です。");
      }}>計画を記録</button>
      <button type="button" className={`${field} ml-2`} onClick={() => print(<article className="p-6"><h1>栄養管理計画書（模擬・未署名）</h1><p>{p.name}（{p.id}）</p><pre className="whitespace-pre-wrap font-sans text-sm">{text}</pre></article>)}>印刷</button><p role="status">{saved}</p>
    </section>
  </div>;
}
