"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { addDays, formatShort } from "@/lib/dates";
import { dietAt, dietLabel, MEALS, MEAL_TIMES, mealHolds, holdTitle, type DietOrder } from "@/lib/diet";
import { dietChangeOrders, undoDietChange, type DietChangeRange } from "@/lib/diet-change";
import { abs } from "@/lib/flowsheet";
import { examAt, type ImagingOrder, type PhysioOrder } from "@/lib/exams";
import { dietNeedsProposal } from "@/lib/diet-workflow";
import type { OrderEntry } from "@/lib/types";
import type { DietCalendar } from "./DietCalendar";
import { DietPanel } from "./panels/DietPanel";

type Props = Pick<ComponentProps<typeof DietCalendar>, "patient" | "entries" | "diets" | "today" | "nowTime" | "dietEdit">;
const newId = () => `diet-${crypto.randomUUID()}`;
const examTime = (e: OrderEntry) => examAt(e.order as ImagingOrder | PhysioOrder, abs(e.day, e.time));

export function DietWindow({ patient, entries, diets, today, nowTime, dietEdit }: Props) {
  const [newOrder, setNewOrder] = useState(false);
  const [menu, setMenu] = useState<DietOrder["from"] | null>(null);
  const [edit, setEdit] = useState<{ at: DietOrder["from"]; range: DietChangeRange; npo?: boolean } | null>(null);
  const [count, setCount] = useState(3);
  const [error, setError] = useState("");
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPress = () => { if (press.current) clearTimeout(press.current); press.current = null; };
  useEffect(() => () => { if (press.current) clearTimeout(press.current); }, []);
  const orders = entries.filter((e): e is OrderEntry => e.kind === "order");
  const currentMeal = [...MEALS].reverse().find(m => abs(0, MEAL_TIMES[m]) <= abs(0, nowTime)) ?? "朝";
  const current = dietAt(diets, patient.id, 0, currentMeal);
  const todayHolds = mealHolds(orders, 0, currentMeal, examTime);
  const allowed = !!dietEdit && !dietEdit.denied;
  const submit = (added: DietOrder[], adjust = false) => {
    if (!allowed) return;
    // Restoration and undo must also pass the existing clinical-field permission check.
    const direct = adjust && dietEdit.onAdjust && added.every(d => !dietNeedsProposal(dietAt(diets, patient.id, d.from.day, d.from.meal), d));
    if (direct) dietEdit.onAdjust!(added); else dietEdit.onDraft(added);
    setEdit(null); setNewOrder(false); setMenu(null); setError("");
  };
  const save = (d: DietOrder, adjust = false) => {
    try { submit(dietChangeOrders(diets, d, edit?.at ?? d.from, edit?.range ?? { kind: "until-changed" }, newId), adjust); }
    catch (e) { setError((e as Error).message); }
  };
  const choose = (range: DietChangeRange, npo = false, wholeDay = false) => {
    if (!menu) return;
    if (range.kind === "meals" && (!Number.isSafeInteger(range.count) || range.count < 1)) { setError("回数は1以上の整数で入れてください。"); return; }
    const at = wholeDay ? { day: menu.day, meal: "朝" as const } : menu;
    if (abs(at.day, MEAL_TIMES[at.meal]) <= abs(0, nowTime)) { setError("配膳済みの食事は変更できません。これからの食事を選んでください。"); return; }
    setEdit({ at, range, npo }); setMenu(null); setError(""); setNewOrder(false);
  };
  const days = Array.from({ length: 7 - Math.max(patient.admittedOn, -6) }, (_, i) => Math.max(patient.admittedOn, -6) + i);
  return <div className="scroll-thin max-h-[75vh] space-y-3 overflow-auto p-3 text-[13px]" onKeyDown={e => { if (e.key === "Escape") { setMenu(null); setEdit(null); setNewOrder(false); } }}>
    <section className="rounded border border-rule bg-paper p-3">
      <h3 className="font-bold">現在の食事</h3>
      <p>{dietLabel(current)}</p>
      {current?.side && <p>副食：{current.side}</p>}
      {current?.comment && <p>{current.comment}</p>}
      {todayHolds.length > 0 && <p className="text-yamabuki">{holdTitle(todayHolds)}：{todayHolds.map(h => h.label).join("、")}</p>}
      <button type="button" disabled={!allowed} onClick={() => { setNewOrder(!newOrder); setEdit(null); setMenu(null); setError(""); }} className="mt-2 rounded border border-rule bg-sheet px-3 py-1 disabled:opacity-40">新しい食事オーダ</button>
      {dietEdit?.denied && <p>{dietEdit.denied}</p>}
    </section>
    <p className="hint">右クリック（iPad は長押し）でその回から変えられます</p>
    <p className="hint">回数を指定すると元の食事に戻す指示も下書きに入ります。予約済みの次の指示は残します。「この日の3回」は朝から夕までです。配膳済みの食事は変更できません（架空の病院の取り決め）。検査・外泊・退院による食止めは、この変更では解除されません。栄養部門への連携は模擬です。</p>
    {error && <p role="alert" className="text-shu">{error}</p>}
    {menu && <section role="menu" aria-label="食事の変更" className="space-y-1 rounded border border-rule bg-sheet p-2 shadow-lg">
      <p>{formatShort(addDays(today, menu.day))} {menu.meal}食</p>
      <button type="button" role="menuitem" className="block p-2 hover:bg-paper" onClick={() => choose({ kind: "once" })}>この 1 回だけ</button>
      <button type="button" role="menuitem" disabled={abs(menu.day, MEAL_TIMES.朝) <= abs(0, nowTime)} className="block p-2 hover:bg-paper disabled:opacity-40" onClick={() => choose({ kind: "meals", count: 3 }, false, true)}>この日の 3 回</button>
      <label className="block">回数 <input aria-label="変更する回数" type="number" min={1} step={1} value={Number.isNaN(count) ? "" : count} onChange={e => setCount(e.target.value === "" ? NaN : Number(e.target.value))} className="w-20 rounded border border-rule p-1" /></label>
      <button type="button" role="menuitem" className="block p-2 hover:bg-paper" onClick={() => choose({ kind: "meals", count })}>今日から N 回（選んだ食事から）</button>
      <button type="button" role="menuitem" className="block p-2 hover:bg-paper" onClick={() => choose({ kind: "until-changed" })}>ずっと（次に変えるまで）</button>
      <button type="button" role="menuitem" className="block p-2 hover:bg-paper" onClick={() => choose({ kind: "once" }, true)}>食止め（絶食）…</button>
      <button type="button" role="menuitem" disabled={!dietAt(diets, patient.id, menu.day, menu.meal)?.change} className="block p-2 hover:bg-paper disabled:opacity-40" onClick={() => {
        const changed = dietAt(diets, patient.id, menu.day, menu.meal);
        if (!changed) return;
        if (abs(changed.from.day, MEAL_TIMES[changed.from.meal]) <= abs(0, nowTime)) { setError("配膳済みの食事から始まった変更は取り消せません。"); return; }
        try { submit(undoDietChange(diets, changed, { by: dietEdit!.doctor, at: { day: 0, time: nowTime } }, newId), true); }
        catch (e) { setError((e as Error).message); }
      }}>元に戻す（この変更を取り消す）</button>
      <button type="button" onClick={() => setMenu(null)} className="p-2">閉じる</button>
    </section>}
    {(edit || newOrder) && allowed && <section aria-label="食事を変える">
      <button type="button" className="mb-2 rounded border border-rule px-2 py-1" onClick={() => { setEdit(null); setNewOrder(false); }}>閉じる</button>
      {edit && <label className="mb-2 block">変更する期間 <select aria-label="変更する期間" value={edit.range.kind} onChange={e => setEdit({ ...edit, range: e.target.value === "meals" ? { kind: "meals", count } : { kind: e.target.value as "once" | "until-changed" } })} className="rounded border border-rule p-1"><option value="once">この1回だけ</option><option value="meals">{edit.range.kind === "meals" ? edit.range.count : count}回</option><option value="until-changed">ずっと（次に変えるまで）</option></select></label>}
      <DietPanel key={edit ? `${edit.at.day}-${edit.at.meal}-${!!edit.npo}` : "new"} compact={!!edit} patient={patient} today={today} nowTime={nowTime} doctor={dietEdit.doctor} diets={diets} entries={orders}
        initial={edit ? { ...(dietAt(diets, patient.id, edit.at.day, edit.at.meal) ?? { kind: "常食", staple: "米飯", side: "常菜" }), ...(edit.npo ? { kind: "絶食" } : {}), from: edit.at } : undefined}
        onSave={d => save(d)} onAdjust={dietEdit.onAdjust ? d => save(d, true) : undefined} />
    </section>}
    <table className="w-full table-fixed border-collapse text-xs"><caption className="mb-2 text-left font-bold">食事カレンダー</caption>
      <thead><tr><th className="w-24">日付</th>{MEALS.map(m => <th key={m} className="p-2">{m}</th>)}</tr></thead>
      <tbody>{days.map(day => <tr key={day} className={day === 0 ? "bg-ai-soft outline outline-1 outline-ai/40" : ""}>
        <th className="p-1 text-left font-normal">{formatShort(addDays(today, day))}{day === 0 && "（今日）"}</th>
        {MEALS.map(meal => {
          const d = dietAt(diets, patient.id, day, meal);
          const holds = mealHolds(orders, day, meal, examTime);
          const served = abs(day, MEAL_TIMES[meal]) <= abs(0, nowTime);
          const label = [dietLabel(d), d?.side, d?.energyKcal !== undefined && `${d.energyKcal}kcal`, d?.saltG !== undefined && `塩分${d.saltG}g`, d?.comment].filter(Boolean).join("・");
          const open = () => { if (!allowed || served) return; setMenu({ day, meal }); setError(""); setEdit(null); setNewOrder(false); };
          return <td key={meal} className="border border-rule p-1 align-top"><button type="button" disabled={!allowed || served} aria-label={`${formatShort(addDays(today, day))} ${meal}食：${label}`} onClick={open}
            onContextMenu={e => { e.preventDefault(); if (allowed && !served) open(); }}
            onPointerDown={e => { if (e.pointerType !== "touch") return; cancelPress(); press.current = setTimeout(open, 450); }} onPointerMove={cancelPress} onPointerUp={cancelPress} onPointerCancel={cancelPress}
            className="min-h-16 w-full select-none rounded p-1 text-left enabled:hover:bg-paper disabled:opacity-50">
            {holds.length > 0 && <span className="block text-yamabuki">{holdTitle(holds)}：{holds.map(h => h.label).join("、")}</span>}{label}
          </button></td>;
        })}
      </tr>)}</tbody>
    </table>
  </div>;
}
