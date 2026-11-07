"use client";

import { useMe } from "./RoleContext";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { addDays, formatShort } from "@/lib/dates";
import { currentDiet, nextMeal, dietAt, dietLabel, MEALS, MEAL_TIMES, mealHolds, holdTitle, SIDE_FORMS, STAPLES, type DietOrder, type DysphagiaCode, type SideForm } from "@/lib/diet";
import { dietChangeOrders, undoDietChange, type DietChangeRange } from "@/lib/diet-change";
import { abs } from "@/lib/flowsheet";
import { examAt, type ImagingOrder, type PhysioOrder } from "@/lib/exams";
import { dietNeedsProposal } from "@/lib/diet-workflow";
import type { OrderEntry } from "@/lib/types";
import type { DietCalendar } from "./DietCalendar";
import { DietPanel } from "./panels/DietPanel";

type Props = Pick<ComponentProps<typeof DietCalendar>, "patient" | "entries" | "diets" | "today" | "nowTime" | "dietEdit">;
const newId = () => `diet-${crypto.randomUUID()}`;
/** One-tap 嚥下調整食 (日本摂食嚥下リハビリテーション学会 嚥下調整食分類2021 のコード). The rest is in 「詳しく変える」. */
const QUICK_DYSPHAGIA: { code: DysphagiaCode; label: string; side?: SideForm }[] = [
  { code: "2-1", label: "ペースト食（2-1）", side: "ミキサー" },
  { code: "2-2", label: "粒のあるペースト（2-2）", side: "ミキサー" },
  { code: "1j", label: "ゼリー・ムース食（1j）" },
  { code: "3", label: "押しつぶせる（3）", side: "刻み" },
  { code: "4", label: "やわらか（4）", side: "一口大" },
];
const examTime = (e: OrderEntry) => examAt(e.order as ImagingOrder | PhysioOrder, abs(e.day, e.time));

export function DietWindow({ patient, entries, diets, today, nowTime, dietEdit }: Props) {
  const me = useMe();
  const [saved, setSaved] = useState("");
  const [newOrder, setNewOrder] = useState(false);
  const [menu, setMenu] = useState<DietOrder["from"] | null>(null);
  // Where the menu floats: beside the cell that was pressed (screen coordinates).
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [edit, setEdit] = useState<{ at: DietOrder["from"]; range: DietChangeRange; npo?: boolean } | null>(null);
  const [count, setCount] = useState(3);
  // The one-tap change being built in the popover, and how long it lasts (既定：ずっと).
  const [quick, setQuick] = useState<Partial<DietOrder>>({});
  const [quickRange, setQuickRange] = useState<"once" | "day" | "meals" | "until">("until");
  const [error, setError] = useState("");
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPress = () => { if (press.current) clearTimeout(press.current); press.current = null; };
  useEffect(() => () => { if (press.current) clearTimeout(press.current); }, []);
  const orders = entries.filter((e): e is OrderEntry => e.kind === "order");
  const next = nextMeal(abs(0, nowTime));
  const current = currentDiet(diets, patient.id, nowTime);
  const todayHolds = mealHolds(orders, next.day, next.meal, examTime);
  const allowed = !!dietEdit && !dietEdit.denied;
  const submit = (added: DietOrder[], adjust = false) => {
    if (!allowed) return;
    // Restoration and undo must also pass the existing clinical-field permission check.
    const direct = adjust && dietEdit.onAdjust && added.every(d => !dietNeedsProposal(dietAt(diets, patient.id, d.from.day, d.from.meal), d));
    if (direct) dietEdit.onAdjust!(added); else dietEdit.onDraft(added);
    setSaved(me.role === "管理栄養士" && !direct ? "主治医の下書きに入れました" : direct ? "食事の調整を反映しました" : "オーダの下書きに入れました");
    setEdit(null); setNewOrder(false); setMenu(null); setError("");
  };
  const save = (d: DietOrder, adjust = false) => {
    try { submit(dietChangeOrders(diets, d, edit?.at ?? d.from, edit?.range ?? { kind: "until-changed" }, newId), adjust); }
    catch (e) { setError((e as Error).message); }
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


    {saved && <p role="status">{saved}</p>}
    {error && <p role="alert" className="text-shu">{error}</p>}
    {menu && (() => {
      const base = dietAt(diets, patient.id, menu.day, menu.meal) ?? { id: "", patientId: patient.id, from: menu, kind: "常食" as const, staple: "米飯" as const, side: "常菜" as const, by: dietEdit?.doctor ?? "", at: { day: 0, time: nowTime } };
      const next = { ...base, ...quick };
      const changed = Object.keys(quick).length > 0;
      const range: DietChangeRange = quickRange === "once" ? { kind: "once" } : quickRange === "day" ? { kind: "meals", count: 3 } : quickRange === "meals" ? { kind: "meals", count } : { kind: "until-changed" };
      const at = quickRange === "day" ? { day: menu.day, meal: "朝" as const } : menu;
      const chip = (on: boolean) => `rounded border px-2 py-1 ${on ? "border-ai bg-ai text-white" : "border-rule bg-sheet hover:border-ai"}`;
      const saveQuick = () => {
        if (!changed) return;
        if (abs(at.day, MEAL_TIMES[at.meal]) <= abs(0, nowTime)) { setError("配膳済みの食事は変更できません。これからの食事を選んでください。"); return; }
        try { submit(dietChangeOrders(diets, { ...next, id: newId(), patientId: patient.id, by: dietEdit!.doctor, at: { day: 0, time: nowTime } }, at, range, newId), !!dietEdit?.onAdjust); setQuick({}); }
        catch (e) { setError((e as Error).message); }
      };
      return <section role="dialog" aria-label="食事を変える" style={menuAt ? { position: "fixed", left: Math.min(menuAt.x, window.innerWidth - 420), top: Math.min(menuAt.y, window.innerHeight - 520), zIndex: 60, width: 400 } : undefined} className="space-y-2 rounded border border-rule bg-sheet p-3 shadow-lg">
        <div className="flex items-baseline justify-between"><b>{formatShort(addDays(today, menu.day))} {menu.meal}食を変える</b><button type="button" onClick={() => { setMenu(null); setQuick({}); }} aria-label="閉じる" className="text-ink-faint">×</button></div>
        <p className="text-ink-soft">いま：{dietLabel(base)}{base.side ? `・${base.side}` : ""}</p>
        <div><div className="mb-1 text-[11px] text-ink-faint">主食</div><div className="flex flex-wrap gap-1">{STAPLES.map((x) => <button key={x} type="button" className={chip(next.staple === x && next.kind !== "絶食")} onClick={() => setQuick({ ...quick, staple: x, ...(next.kind === "絶食" ? { kind: "常食" } : {}) })}>{x}</button>)}</div></div>
        <div><div className="mb-1 text-[11px] text-ink-faint">おかずの形</div><div className="flex flex-wrap gap-1">{SIDE_FORMS.map((x) => <button key={x} type="button" className={chip(next.side === x && next.kind !== "絶食")} onClick={() => setQuick({ ...quick, side: x, ...(next.kind === "絶食" ? { kind: "常食" } : {}) })}>{x}</button>)}</div></div>
        <div><div className="mb-1 text-[11px] text-ink-faint">嚥下調整食（学会分類2021）</div><div className="flex flex-wrap gap-1">{QUICK_DYSPHAGIA.map((x) => <button key={x.code} type="button" className={chip(next.kind === "嚥下調整食" && next.dysphagia === x.code)} onClick={() => setQuick({ ...quick, kind: "嚥下調整食", dysphagia: x.code, ...(x.side ? { side: x.side } : {}) })}>{x.label}</button>)}</div></div>
        <div className="flex flex-wrap gap-1"><button type="button" className={chip(next.kind === "絶食")} onClick={() => { setEdit({ at, range, npo: true }); setMenu(null); setQuick({}); }}>食止め（絶食）…</button><button type="button" className="rounded border border-rule px-2 py-1" onClick={() => { setEdit({ at, range }); setMenu(null); setQuick({}); }}>詳しく変える（食種・治療食・量）…</button></div>
        <div><div className="mb-1 text-[11px] text-ink-faint">いつまで</div><div className="flex flex-wrap items-center gap-1">
          {([["once", "この 1 回だけ"], ["day", "この日の 3 回"], ["meals", "N 回"], ["until", "ずっと（次に変えるまで）"]] as const).map(([k, l]) => <button key={k} type="button" disabled={k === "day" && abs(menu.day, MEAL_TIMES.朝) <= abs(0, nowTime)} className={`${chip(quickRange === k)} disabled:opacity-40`} onClick={() => setQuickRange(k)}>{l}</button>)}
          {quickRange === "meals" && <input aria-label="変更する回数" type="number" min={1} step={1} value={Number.isNaN(count) ? "" : count} onChange={e => setCount(e.target.value === "" ? NaN : Number(e.target.value))} className="w-14 rounded border border-rule px-1" />}
        </div></div>
        {changed && <p className="rounded bg-ai-soft px-2 py-1">変更後：{dietLabel(next)}{next.side ? `・${next.side}` : ""}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={!changed} onClick={saveQuick} className="rounded bg-ai px-3 py-1.5 font-bold text-white disabled:opacity-40">保存する</button>
          {base.change && <button type="button" className="text-ai underline" onClick={() => {
            if (abs(base.from.day, MEAL_TIMES[base.from.meal]) <= abs(0, nowTime)) { setError("配膳済みの食事から始まった変更は取り消せません。"); return; }
            try { submit(undoDietChange(diets, base as DietOrder, { by: dietEdit!.doctor, at: { day: 0, time: nowTime } }, newId), true); }
            catch (e) { setError((e as Error).message); }
          }}>この変更を取り消す</button>}
        </div>
      </section>;
    })()}
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
          const open = (at?: { x: number; y: number }) => { if (!allowed || served) return; setMenu({ day, meal }); setMenuAt(at ?? null); setError(""); setEdit(null); setNewOrder(false); };
          return <td key={meal} className="border border-rule p-1 align-top"><button type="button" disabled={!allowed || served} aria-label={`${formatShort(addDays(today, day))} ${meal}食：${label}`} onClick={(e) => open({ x: e.clientX, y: e.clientY })}
            onContextMenu={e => { e.preventDefault(); if (allowed && !served) open({ x: e.clientX, y: e.clientY }); }}
            onPointerDown={e => { if (e.pointerType !== "touch") return; cancelPress(); const at = { x: e.clientX, y: e.clientY }; press.current = setTimeout(() => open(at), 450); }} onPointerMove={cancelPress} onPointerUp={cancelPress} onPointerCancel={cancelPress}
            className="min-h-16 w-full select-none rounded p-1 text-left enabled:hover:bg-paper disabled:opacity-50">
            {holds.length > 0 && <span className="block text-yamabuki">{holdTitle(holds)}：{holds.map(h => h.label).join("、")}</span>}{label}
          </button></td>;
        })}
      </tr>)}</tbody>
    </table>
  </div>;
}

/* Help migration source (references and dynamic wording):
<p >食事を押すと、その回から変えられます（主食・おかずの形・ペースト食などを押して「保存する」）。</p>
<p >回数を指定すると元の食事に戻す指示も下書きに入ります。予約済みの次の指示は残します。「この日の3回」は朝から夕までです。配膳済みの食事は変更できません。検査・外泊・退院による食止めは、この変更では解除されません。栄養部門への連携は模擬です。</p>
*/
