"use client";

import { Mic, Square } from "lucide-react";
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
  heldBy,
  nextOrderableMeal,
  pastDeadline,
  type DietKind,
  type DietOrder,
  type DysphagiaCode,
  type Meal,
  type SideForm,
  type Staple,
  type Thickness,
} from "@/lib/diet";
import { abs } from "@/lib/flowsheet";
import { useSpeech } from "@/lib/use-speech";
import type { OrderEntry, Patient } from "@/lib/types";
import { CLAUDE, auditLog } from "@/lib/audit";

interface Props {
  patient: Patient;
  today: CalendarDate;
  nowTime: string;
  doctor: string;
  diets: DietOrder[];
  entries: OrderEntry[];
  onSave: (d: DietOrder) => void;
}

type Form = Omit<DietOrder, "id" | "patientId" | "by" | "at">;

const DAY_LABEL = ["今日", "明日", "明後日"];

/** Diet order: a 3-day meal grid (what is served, meals held for tests) and a new order (typed, chosen or spoken). */
export function DietPanel({ patient, today, nowTime, doctor, diets, entries, onSave }: Props) {
  const nowAbs = abs(0, nowTime);
  const first = nextOrderableMeal(nowAbs);
  const [f, setF] = useState<Form>({ from: { day: first.day, meal: first.meal }, kind: "常食", staple: "米飯", side: "常菜" });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const speech = useSpeech((t) => setText((x) => (x ? `${x}、${t}` : t)));
  const set = (patch: Partial<Form>) => setF((cur) => ({ ...cur, ...patch }));

  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/diet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `エラー（${res.status}）`);
      const w = json.diet;
      auditLog({ role: "AI", actor: CLAUDE, action: "食事オーダーを項目に写した", patient: patient.name, detail: text });
      const day = w.startDay === "today" ? 0 : w.startDay === "tomorrow" ? 1 : w.startDay === "day_after" ? 2 : null;
      setF((cur) => ({
        from: day !== null || w.startMeal ? { day: day ?? cur.from.day, meal: (w.startMeal || cur.from.meal) as Meal } : cur.from,
        kind: (w.kind || cur.kind) as DietKind,
        staple: (w.staple || undefined) as Staple | undefined,
        side: (w.side || undefined) as SideForm | undefined,
        therapeutic: w.therapeutic || undefined,
        energyKcal: w.energyKcal || undefined,
        saltG: w.saltG || undefined,
        proteinG: w.proteinG || undefined,
        dysphagia: (w.dysphagia || undefined) as DysphagiaCode | undefined,
        thickness: (w.thickness || undefined) as Thickness | undefined,
        tube: w.tubeProduct || w.tubeMl ? { product: w.tubeProduct, mlPerMeal: w.tubeMl, ratePerH: w.tubeRate || undefined } : undefined,
        npoReason: w.npoReason || undefined,
        comment: w.comment || undefined,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み取れませんでした。");
    } finally {
      setBusy(false);
    }
  };

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
    notes.push(`${DAY_LABEL[f.from.day] ?? ""}の${f.from.meal}食の締切（${d.dayBefore ? "前日" : "当日"} ${d.time}、架空の病院の取り決め）を過ぎています。確定したら栄養科に電話で伝えてください。`);
  }
  const oral = entries.filter((e) => e.status === "有効" && e.order.type === "prescription");
  if (f.kind === "絶食" && oral.length) notes.push(`内服薬が ${oral.length}件 有効です。絶食中の内服をどうするか（少量の水で内服する・止めるなど）を指示してください。`);
  if (patient.cautions.some((c) => c.includes("水分制限"))) notes.push(`カルテの注意：${patient.cautions.filter((c) => c.includes("水分制限")).join("、")}`);

  const sel = "rounded border border-rule bg-sheet px-1 py-0.5";
  return (
    <div className="space-y-4 text-[13px]">
      <section>
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
                  const held = heldBy(entries, day, m);
                  const served = abs(day, MEAL_TIMES[m]) <= nowAbs;
                  return (
                    <td key={m} className={`px-1 py-1 ${served ? "text-ink-faint" : ""}`}>
                      <span className={d?.kind === "絶食" || held.length ? "font-bold text-yamabuki" : ""}>{held.length ? "検査で止め" : dietLabel(d)}</span>
                      {held.length > 0 && <div className="text-[10px] text-yamabuki">{held.join("、")}</div>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[10px] text-ink-faint">検査で止めるのは、架空の病院の約束（腹部エコー・造影CT の前の1食）。締切は朝食が前日17:00、昼食が当日10:00、夕食が当日15:00（架空）。</p>
      </section>

      <section className="space-y-2 rounded-md border border-rule bg-paper p-3">
        <h3 className="font-bold">食事を変える</h3>
        <div className="flex gap-1.5">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="例：明日の昼から嚥下食コード1j、水分は中間のとろみ" className="flex-1 rounded border border-rule bg-sheet px-2 py-1.5 outline-none focus:border-ai" />
          {speech.supported && (
            <button type="button" onClick={speech.listening ? speech.stop : speech.start} className="rounded border border-rule px-2" title="話して入力">
              {speech.listening ? <Square size={14} /> : <Mic size={14} />}
            </button>
          )}
          <button type="button" disabled={!text.trim() || busy} onClick={read} className="rounded bg-ai px-3 font-bold text-white disabled:opacity-40">
            {busy ? "…" : "項目にする"}
          </button>
        </div>
        {error && <p className="text-shu">{error}</p>}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-soft">いつから</span>
          <select value={f.from.day} onChange={(e) => set({ from: { ...f.from, day: Number(e.target.value) } })} className={sel} aria-label="日">
            {[0, 1, 2].map((d) => (
              <option key={d} value={d}>
                {DAY_LABEL[d]} {formatShort(addDays(today, d))}
              </option>
            ))}
          </select>
          <select value={f.from.meal} onChange={(e) => set({ from: { ...f.from, meal: e.target.value as Meal } })} className={sel} aria-label="食事">
            {MEALS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <span className="text-ink-faint">食から</span>
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
            {f.tube?.product && f.tube.mlPerMeal > 0 && <span className="text-ink-soft">1日 {Math.round(f.tube.mlPerMeal * 3 * (TUBE_PRODUCTS.find((x) => x.code === f.tube!.product)?.kcalPerMl ?? 1))} kcal（3回、コードで計算）</span>}
          </div>
        )}
        {f.kind === "絶食" && (
          <input value={f.npoReason ?? ""} onChange={(e) => set({ npoReason: e.target.value || undefined })} placeholder="絶食の理由（例：嚥下の評価まで）" className="w-full rounded border border-rule bg-sheet px-2 py-1 text-xs" />
        )}
        <input value={f.comment ?? ""} onChange={(e) => set({ comment: e.target.value || undefined })} placeholder="注意（禁止食品・水分制限など）" className="w-full rounded border border-rule bg-sheet px-2 py-1 text-xs" />
        <div className="rounded bg-sheet p-2 text-xs">
          <b>{dietLabel({ ...f, id: "", patientId: "", by: "", at: { day: 0, time: "" } })}</b>
          <span className="text-ink-soft">　{DAY_LABEL[f.from.day]}の{f.from.meal}食から</span>
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
            onSave({ ...f, id: `diet-${Date.now()}`, patientId: patient.id, by: doctor, at: { day: 0, time: nowTime } });
            setText("");
          }}
          className="w-full rounded-md bg-ai px-3 py-2 font-bold text-white disabled:opacity-40"
        >
          確定（{nowTime}　{doctor}）
        </button>
      </section>
    </div>
  );
}
