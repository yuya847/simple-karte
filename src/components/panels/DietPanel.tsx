"use client";

import { displayText } from "@/lib/display-text";
import { DayInput } from "../DayInput";
import { dietNeedsProposal, dietAdjustment } from "@/lib/diet-workflow";
import { useMe } from "../RoleContext";
import { useState } from "react";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import {
DIET_KINDS,
DYSPHAGIA_CODES,
MEALS,
MEAL_DEADLINE,
MEAL_TIMES,
SIDE_FORMS,
STAPLES,
THERAPEUTICS,
THICKNESS,
TUBE_PRODUCTS,
dietAt,
dietLabel,
findTherapeutic,
holdTitle,
LEAVE_HOLD_RULE,
mealHolds,
nextOrderableMeal,
pastDeadline,
type DietOrder,
type DysphagiaCode,
type Meal,
type SideForm,
type Staple,
type Thickness,
} from "@/lib/diet";
import { abs } from "@/lib/flowsheet";
import { examAt, type ImagingOrder, type PhysioOrder } from "@/lib/exams";
import type { OrderEntry, Patient } from "@/lib/types";

const examTime = (e: OrderEntry) => examAt(e.order as ImagingOrder | PhysioOrder, abs(e.day, e.time));

interface Props {
  patient: Patient;
  today: CalendarDate;
  nowTime: string;
  doctor: string;
  diets: DietOrder[];
  entries: OrderEntry[];
  onSave: (d: DietOrder) => void;
  onAdjust?: (d: DietOrder) => void;
  initial?: Form;
  compact?: boolean;
}

type Form = Omit<DietOrder, "id" | "patientId" | "by" | "at">;

const DAY_LABEL = ["今日", "明日", "明後日"];

/** Diet order: a 3-day meal grid (what is served, meals held for tests) and a new order (chosen on the form). */
export function DietPanel({ patient, today, nowTime, doctor, diets, entries, onSave, onAdjust, initial, compact }: Props) {
  const nowAbs = abs(0, nowTime);
  const first = nextOrderableMeal(nowAbs);
  const me = useMe();
  const current = dietAt(diets, patient.id, first.day, first.meal);
  const [f, setF] = useState<Form>(initial ?? (current ? { ...current, from: first } : { from: first, kind: "常食", staple: "米飯", side: "常菜" }));
  const set = (patch: Partial<Form>) => setF((cur) => ({ ...cur, ...patch }));


  // Checks (code). errors block; notes inform.
  const errors: string[] = [];
  const notes: string[] = [];
  const t = findTherapeutic(f.therapeutic);
  if (f.kind === "治療食" && !t) errors.push("治療食の種類を選んでください。");
  if (t?.params.includes("saltG") && !f.saltG && t.code === "TD-SALT-HEART") errors.push("塩分の量（g未満）を入れてください。");
  if (t?.params.includes("energyKcal") && !f.energyKcal && t.code === "TD-ENERGY") errors.push("エネルギー（kcal）を入れてください。");
  if (f.kind === "嚥下調整食" && !f.dysphagia) errors.push("嚥下調整食のコード（学会分類2021）を選んでください。");
  if (f.kind === "経管栄養" && (!f.tube?.product || !f.tube.mlPerMeal)) errors.push("経管栄養の製品と1回量を入れてください。");
  if (f.kind === "絶食" && !f.npoReason) notes.push("絶食の理由があれば書いてください（記事と栄養科に伝わります）。");
  if (abs(f.from.day, MEAL_TIMES[f.from.meal]) <= nowAbs) errors.push(`${DAY_LABEL[f.from.day]}の${f.from.meal}食はもう出ています。次の食事から選んでください。`);
  const late = pastDeadline(f.from.day, f.from.meal, nowAbs);
  if (late) {
    const d = MEAL_DEADLINE[f.from.meal];
    notes.push(`${DAY_LABEL[f.from.day] ?? ""}の${f.from.meal}食の締切（${d.dayBefore ? "前日" : "当日"} ${d.time}、院内の取り決め）を過ぎています。確定したら栄養科に電話で伝えてください。`);
  }
  const oral = entries.filter((e) => e.status === "有効" && e.order.type === "prescription");
  if (f.kind === "絶食" && oral.length) notes.push(`内服薬が ${oral.length}件 有効です。絶食中の内服をどうするか（少量の水で内服する・止めるなど）を指示してください。`);
  if (patient.cautions.some((c) => c.includes("水分制限"))) notes.push(`カルテの注意：${patient.cautions.filter((c) => c.includes("水分制限")).join("、")}`);

  const next = { ...f, id: "", patientId: patient.id, by: me.name, at: { day: 0, time: nowTime } };
  const effective = dietAt(diets, patient.id, f.from.day, f.from.meal);
  const direct = me.role === "管理栄養士" && !!onAdjust && !dietNeedsProposal(effective, next);
  const sel = "rounded border border-rule bg-sheet px-1 py-0.5";
  return (
    <div className="space-y-4 text-[13px]">
      {!compact && <section>
        <h3 className="mb-1 text-xs font-bold text-ink-soft">3日分の食事（コードが出しています）</h3>
        <table className="nums w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-[11px] text-ink-faint">
              <th className="w-24 text-left font-normal" />
              {MEALS.map((m) => (
                <th key={m} className="px-1 text-left font-normal">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2].map((day) => (
              <tr key={day} className="border-t border-rule-soft align-top">
                <td className="py-1 pr-1 text-ink-soft">
                  {DAY_LABEL[day]} {formatShort(addDays(today, day))}
                </td>
                {MEALS.map((m) => {
                  const d = dietAt(diets, patient.id, day, m);
                  const held = mealHolds(entries, day, m, examTime);
                  const served = abs(day, MEAL_TIMES[m]) <= nowAbs;
                  return (
                    <td key={m} className={`px-1 py-1 ${served ? "text-ink-faint" : ""}`}>
                      <span className={d?.kind === "絶食" || held.length ? "font-bold text-yamabuki" : ""}>{held.length ? holdTitle(held) : dietLabel(d)}</span>
                      {held.length > 0 && <div className="text-[10px] text-yamabuki">{held.map((h) => h.label).join("、")}</div>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[10px] text-ink-faint">検査で止めるのは、院内の取り決め（腹部エコー・造影CT・内視鏡の前の1食）。{LEAVE_HOLD_RULE}。締切は朝食が前日17:00、昼食が当日10:00、夕食が当日15:00。</p>
      </section>}

      <section className="space-y-2 rounded-md border border-rule bg-paper p-3">
        <h3 className="font-bold">食事を変える</h3>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {compact ? <span>{displayText(formatShort(addDays(today, f.from.day)))} {displayText(f.from.meal)}食から</span> : <>
          <span className="text-ink-soft">いつから</span>
          <select value={f.from.day} onChange={(e) => set({ from: { ...f.from, day: Number(e.target.value) } })} className={sel} aria-label="日">
            {[0, 1, 2].map((d) => (
              <option key={d} value={d}>
                {DAY_LABEL[d]} {formatShort(addDays(today, d))}
              </option>
            ))}
          </select><DayInput label="食事の開始日付" today={today} value={f.from.day} onChange={day => set({ from: { ...f.from, day } })} />
          <select value={f.from.meal} onChange={(e) => set({ from: { ...f.from, meal: e.target.value as Meal } })} className={sel} aria-label="食事">
            {MEALS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <span className="text-ink-faint">食から</span></>}
        </div>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="食事の種類">
          {DIET_KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => set({ kind: k })} className={`rounded border px-2 py-0.5 text-xs ${f.kind === k ? "border-ai bg-ai text-white" : "border-rule bg-sheet"}`}>
              {k}
            </button>
          ))}
        </div>
        {(f.kind === "常食" || f.kind === "治療食") && (
          <div className="flex flex-wrap gap-2 text-xs">
            <label>
              主食{" "}
              <select value={f.staple ?? ""} onChange={(e) => set({ staple: (e.target.value || undefined) as Staple | undefined })} className={sel}>
                <option value="">—</option>
                {STAPLES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              副食{" "}
              <select value={f.side ?? ""} onChange={(e) => set({ side: (e.target.value || undefined) as SideForm | undefined })} className={sel}>
                <option value="">—</option>
                {SIDE_FORMS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        {f.kind === "治療食" && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select value={f.therapeutic ?? ""} onChange={(e) => set({ therapeutic: e.target.value || undefined })} className={sel} aria-label="治療食">
              <option value="">治療食を選ぶ</option>
              {THERAPEUTICS.map((x) => (
                <option key={x.code} value={x.code}>
                  {x.name}
                </option>
              ))}
            </select>
            {t?.params.includes("energyKcal") && (
              <label>
                エネルギー <input value={f.energyKcal ?? ""} onChange={(e) => set({ energyKcal: Number(e.target.value) || undefined })} className="w-16 rounded border border-rule bg-sheet px-1" /> kcal
              </label>
            )}
            {t?.params.includes("proteinG") && (
              <label>
                蛋白 <input value={f.proteinG ?? ""} onChange={(e) => set({ proteinG: Number(e.target.value) || undefined })} className="w-12 rounded border border-rule bg-sheet px-1" /> g
              </label>
            )}
            {t?.params.includes("saltG") && (
              <label>
                塩分 <input value={f.saltG ?? ""} onChange={(e) => set({ saltG: Number(e.target.value) || undefined })} className="w-12 rounded border border-rule bg-sheet px-1" /> g未満
              </label>
            )}
          </div>
        )}
        {f.kind === "嚥下調整食" && (
          <select value={f.dysphagia ?? ""} onChange={(e) => set({ dysphagia: (e.target.value || undefined) as DysphagiaCode | undefined })} className={`${sel} text-xs`} aria-label="嚥下調整食のコード">
            <option value="">コードを選ぶ（学会分類2021）</option>
            {DYSPHAGIA_CODES.map((d) => (
              <option key={d.code} value={d.code}>
                {d.label}
              </option>
            ))}
          </select>
        )}
        {f.kind !== "絶食" && f.kind !== "経管栄養" && (
          <label className="block text-xs">
            水分のとろみ{" "}
            <select value={f.thickness ?? ""} onChange={(e) => set({ thickness: (e.target.value || undefined) as Thickness | undefined })} className={sel}>
              <option value="">—</option>
              {THICKNESS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        )}
        {f.kind === "経管栄養" && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select value={f.tube?.product ?? ""} onChange={(e) => set({ tube: { product: e.target.value, mlPerMeal: f.tube?.mlPerMeal ?? 0, ratePerH: f.tube?.ratePerH } })} className={sel} aria-label="製品">
              <option value="">製品を選ぶ</option>
              {TUBE_PRODUCTS.map((x) => (
                <option key={x.code} value={x.code}>
                  {x.name}
                </option>
              ))}
            </select>
            <label>
              1回 <input value={f.tube?.mlPerMeal || ""} onChange={(e) => set({ tube: { product: f.tube?.product ?? "", mlPerMeal: Number(e.target.value) || 0, ratePerH: f.tube?.ratePerH } })} className="w-14 rounded border border-rule bg-sheet px-1" /> mL
            </label>
            <label>
              速度 <input value={f.tube?.ratePerH || ""} onChange={(e) => set({ tube: { product: f.tube?.product ?? "", mlPerMeal: f.tube?.mlPerMeal ?? 0, ratePerH: Number(e.target.value) || undefined } })} className="w-14 rounded border border-rule bg-sheet px-1" /> mL/時
            </label>
            {f.tube?.product && f.tube.mlPerMeal > 0 && <span className="text-ink-soft">1日 {Math.round(f.tube.mlPerMeal * 3 * (TUBE_PRODUCTS.find((x) => x.code === f.tube!.product)?.kcalPerMl ?? 1))} kcal（3回）</span>}
          </div>
        )}
        {f.kind === "絶食" && (
          <input value={f.npoReason ?? ""} onChange={(e) => set({ npoReason: e.target.value || undefined })} placeholder="絶食の理由（例：嚥下の評価まで）" className="w-full rounded border border-rule bg-sheet px-2 py-1 text-xs" />
        )}
        {([['prohibited', '禁止食品'], ['supplement', '補食'], ['allergyNote', '反映するアレルギー']] as const).map(([key, label]) => <label key={key} className="block text-xs">{label}<input aria-label={label} value={f[key] ?? ""} onChange={e => set({ [key]: e.target.value || undefined })} className="ml-2 rounded border border-rule bg-sheet px-2 py-1" /></label>)}
        <button type="button" className="text-xs text-ai underline" onClick={() => set({ allergyNote: patient.allergies.join("、") })}>カルテのアレルギーを反映する</button>
        <input value={f.comment ?? ""} onChange={(e) => set({ comment: e.target.value || undefined })} aria-label="注意（禁止食品・アレルギー・水分制限など）" placeholder="注意（禁止食品・アレルギー・水分制限など）" className="w-full rounded border border-rule bg-sheet px-2 py-1 text-xs" />
        <div className="rounded bg-sheet p-2 text-xs">
          <b>{dietLabel({ ...f, id: "", patientId: "", by: "", at: { day: 0, time: "" } })}</b>
          <span className="text-ink-soft">　{displayText(DAY_LABEL[f.from.day] ?? formatShort(addDays(today, f.from.day)))}の{displayText(f.from.meal)}食から</span>
          {errors.map((m) => (
            <p key={m} className="text-shu">
              {m}
            </p>
          ))}
          {notes.map((m) => (
            <p key={m} className="text-yamabuki">
              {m}
            </p>
          ))}
        </div>
        <button
          type="button"
          disabled={errors.length > 0}
          onClick={() => {
            const d = { ...next, id: `diet-${Date.now()}`, by: me.role === "管理栄養士" ? me.name : doctor };
            if (direct && effective && onAdjust) onAdjust(dietAdjustment(effective, d)); else onSave(d);
          }}
          className="w-full rounded-md bg-ai px-3 py-2 font-bold text-white disabled:opacity-40"
        >
          {me.role === "管理栄養士" ? direct ? "食事の調整を反映する" : "医師への提案を主治医の下書きに入れる" : "食事の変更をオーダの下書きに入れる"}
        </button>


      </section>
    </div>
  );
}

/* Help migration source (references and dynamic wording):
<span >、コードで計算</span>
<p >{DIET_ADJUSTMENT_HINT}</p>
<p >右の欄の下書きに入ります。上の「オーダーのみ」か「保存」で、ほかのオーダと一緒に飛びます。</p>
*/
