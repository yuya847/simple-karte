"use client";
import { currentInfusion } from "@/lib/icu/current-infusion";
import { insulinTarget } from "@/lib/icu/insulin-target";
import { useState } from "react";
import { addDays, formatShort } from "@/lib/dates";
import { abs } from "@/lib/flowsheet";
import { glucosePoints } from "@/lib/flow-meds";
import { isInsulin } from "@/lib/insulin";
import { INSULIN_SLOTS, parseInsulinDoses } from "@/lib/insulin-doses";
import { insulinDay, insulinProductLabel, insulinProducts, interventionDraft, repeatedScale } from "@/lib/insulin-intervention";
import { injectionCell } from "@/lib/calendar";
import { dietAt } from "@/lib/diet";
import type { InjectionDraft } from "@/lib/drafts";
import type { InjectionOrder, OrderEntry, SlidingScale } from "@/lib/types";
import type { RefWindowProps } from "./RefWindows";
import { ExecuteTarget } from "./ExecuteMenu";
import { SlidingScaleEditor } from "./SlidingScaleEditor";

export type InsulinEdit = { onDraft?: (d: InjectionDraft) => void; onGlucose?: (day: number, time: string) => void };
export function InsulinWindow({ icu, standingCal, patient, entries, today, nowTime, care, io, diets = [], execute, insulinEdit }: RefWindowProps) {
  const [end, setEnd] = useState(0);
  const [span, setSpan] = useState(7);
  const goal = insulinTarget(standingCal?.lines ?? [], abs(0, nowTime));
  const target = goal ? [goal.low, goal.high] : null;
  const [editing, setEditing] = useState(false);
  const [previous, setPrevious] = useState<OrderEntry>();
  const [code, setCode] = useState(insulinProducts[0]?.code ?? "");
  const [dose, setDose] = useState("2-2-2-0");
  const [start, setStart] = useState(1);
  const [scale, setScale] = useState<SlidingScale>();
  const [error, setError] = useState("");
  const records = execute?.records ?? io?.records ?? {};
  const orders = entries.filter((e): e is OrderEntry & { order: InjectionOrder } => e.kind === "order" && e.order.type === "injection" && isInsulin(e.order));
  const points = [...glucosePoints(care?.orders ?? [], (care?.records ?? []).filter(r => r.patientId === patient.id), patient.labs, Object.values(records).filter(r => r.patientId === patient.id)), ...(icu?.hourly ?? []).filter(r => r.patientId === patient.id && r.glucose !== undefined).map(r => ({ at:abs(r.at.day,r.at.time), value:r.glucose!, title:`${r.at.time} ICU 記録`, source:"簡易血糖" as const }))].sort((a,b)=>a.at-b.at);
  const days = Array.from({ length: span }, (_, i) => end - span + 1 + i);
  const lo = days[0] * 1440, hi = (end + 1) * 1440;
  const visible = points.filter(p => p.at >= lo && p.at < hi);
  const ymax = Math.max(300, (target?.[1] ?? 0) + 30, ...visible.map(p => p.value));
  const x = (at: number) => (at - lo) / (hi - lo) * 1000;
  const y = (v: number) => 150 - v / ymax * 140;
  const edit = (entry?: OrderEntry, day = 1) => {
    setPrevious(entry); setStart(Math.max(1, day)); setEditing(true); setError("");
    if (entry?.order.type === "injection") { setCode(entry.order.items[0].drugCode); setDose(entry.order.insulinDoses?.map(d => d.units).join("-") ?? "0-0-0-0"); setScale(entry.order.sliding ? structuredClone(entry.order.sliding) : undefined); }
    else { setDose("2-2-2-0"); setScale(undefined); }
  };
  const th = "border border-rule p-1 align-top";
  return <div className="space-y-3 overflow-auto p-3 text-xs">
    <div className="flex flex-wrap items-center gap-2"><button onClick={() => setEnd(end - span)} aria-label="前の期間">←</button><button onClick={() => setEnd(0)}>今日</button><button onClick={() => setEnd(end + span)} aria-label="次の期間">→</button><select aria-label="表示日数" value={span} onChange={e => setSpan(Number(e.target.value))}><option value={7}>7日</option><option value={14}>14日</option></select>{goal && <span>目標 {goal.low}〜{goal.high} mg/dL　{goal.by} {formatShort(addDays(today, goal.at.day))} {goal.at.time}</span>}{insulinEdit?.onDraft && <button className="rounded border border-ai px-2 py-1 text-ai" onClick={() => edit()}>指示を追加</button>}</div>
    <div className="overflow-x-auto"><div style={{ minWidth: span * 115 + 130 }}>
      <div className="ml-[130px] flex">{days.map(day => <div className="flex-1 border border-rule p-1 text-center" key={day}>{formatShort(addDays(today, day))}{day === 0 && " 今日"}</div>)}</div>
      <div className="flex"><div className="w-[130px] shrink-0">血糖 mg/dL<br />{target && <>{target[0]}–{target[1]}<br /><span className="text-shu">▼帯より低い<br />▲帯より高い</span></>}</div><svg className="h-44 flex-1" viewBox="0 0 1000 170" preserveAspectRatio="none" role="img" aria-label="血糖の推移">{target && <rect x="0" y={y(target[1])} width="1000" height={y(target[0]) - y(target[1])} fill="var(--color-wakatake-soft, #e0f0e5)" />}{days.map(day => <line key={day} x1={x(day * 1440)} x2={x(day * 1440)} y1="0" y2="170" stroke="#ddd" />)}<polyline points={visible.map(p => `${x(p.at)},${y(p.value)}`).join(" ")} fill="none" stroke="#447f98" strokeWidth="1.5" />{visible.map((p, i) => <g key={i}><title>{formatShort(addDays(today, Math.floor(p.at / 1440)))} {p.title}</title><circle cx={x(p.at)} cy={y(p.value)} r="3" fill={target && (p.value < target[0] || p.value > target[1]) ? "#c24e41" : "#447f98"} /><text x={x(p.at)} y={y(p.value) - 6} fontSize="10" textAnchor="middle">{target && p.value < target[0] ? "▼" : target && p.value > target[1] ? "▲" : ""}{p.value}</text></g>)}</svg></div>
      <table className="w-full table-fixed border-collapse"><thead><tr><th className="w-[130px]">朝・昼・夕・眠前</th>{days.map(day => <th key={day} className={th}>{visible.filter(p => Math.floor(p.at / 1440) === day).map((p, i) => <div key={i} title={p.title}>{String(Math.floor(((p.at % 1440 + 1440) % 1440) / 60)).padStart(2, "0")}:{String((p.at % 60 + 60) % 60).padStart(2, "0")} {p.value}</div>)}{day <= 0 && insulinEdit?.onGlucose && <button className="text-ai" onClick={() => insulinEdit.onGlucose!(day, nowTime)}>血糖を記録</button>}</th>)}</tr></thead><tbody>
        <tr><th className={th}>食事量（主食 / 副食）</th>{days.map(day => { const daily = patient.daily.find(d => d.day === day); return <td className={th} key={day}>{["朝", "昼", "夕"].map((m, i) => <div key={m}>{m} {daily?.meals === "絶食" || dietAt(diets, patient.id, day, m as "朝" | "昼" | "夕")?.kind === "絶食" ? "絶食" : Array.isArray(daily?.meals) && daily.meals[i] != null ? `${daily.meals[i]}割 / ${daily.sideMeals?.[i] != null ? `${daily.sideMeals[i]}割` : "—"}` : "—"}</div>)}</td>; })}</tr>
        {orders.map(e => e.order.type === "injection" && <tr key={e.id}><th className={th}>{insulinProductLabel(e.order.items[0].drugCode)}<div>{e.status}</div>{!e.order.continuous && e.status === "有効" && insulinEdit?.onDraft && <button className="text-ai" onClick={() => edit(e)}>指示を変える</button>}</th>{days.map(day => { if (e.order.continuous) { const at = Math.min(abs(day,"23:59"), abs(0,nowTime)); const current = day <= 0 ? currentInfusion(e.order,icu,patient.id,at) : undefined; return <td className={th} key={day}>{current?.text ?? "—"}{icu?.infusions.find(i=>i.id===e.order.continuous?.infusionId)?.changes.filter(c=>c.at.day===day&&abs(c.at.day,c.at.time)<=abs(0,nowTime)).map((c,i)=><div key={i}>{c.at.time} {c.rateMlPerH}mL/時</div>)}</td>; } const actual = insulinDay([e], records, patient.id, day); const cell = injectionCell(e, day, abs(0, nowTime)); return <td className={th} key={day}><div>固定指示 {cell.doses.length ? e.order.insulinDoses?.map(d => d.units).join("-") ?? `${e.order.items[0].amount} U/回` : "—"}</div>{actual.doses.map(d => <div key={d.record.key}>{d.record.doneAt} 実施 {d.fixed}＋スケール {d.scale} U</div>)}{cell.doses.map(d => <ExecuteTarget key={d.time} execute={execute} patient={patient} entry={e} at={abs(day, d.time)} title="インスリン実施" className="block"><button data-dose-menu="true" className="text-ai">{d.time} 実施記録</button></ExecuteTarget>)}{day >= 1 && e.status === "有効" && insulinEdit?.onDraft && <button className="text-ai" onClick={() => edit(e, day)}>この日の量を変える</button>}</td>; })}</tr>)}
        <tr><th className={th}>実施総単位<br />うちスケール</th>{days.map(day => { const total = insulinDay(orders.filter(e => !e.order.continuous), records, patient.id, day); return <td className={th} key={day}>{total.doses.length ? `${total.total} U / ${total.scale} U` : "—"}</td>; })}</tr>
      </tbody></table>
    </div></div>
    {repeatedScale(orders.filter(e => !e.order.continuous), records, patient.id, Math.min(end, 0)).map(s => <p key={s} className="text-yamabuki">● {s}</p>)}
    <section><b>現在の指示</b>{orders.filter(e => !e.order.continuous && injectionCell(e, 0, abs(0, nowTime)).doses.length).map(e => e.order.type === "injection" && <div className="my-1 border border-rule p-2" key={e.id}>{insulinProductLabel(e.order.items[0].drugCode)}　{e.order.insulinDoses?.map(d => d.units).join("-")}{e.order.sliding && <table><tbody>{e.order.sliding.rows.map(r => <tr key={r.from}><td>{r.from}〜{r.to ?? "上限なし"} mg/dL</td><td className="pl-3">{r.units} U</td></tr>)}</tbody></table>}</div>)}</section>
    {editing && <section className="space-y-2 rounded border border-ai p-3" aria-label="インスリン指示の変更"><select aria-label="インスリン品名" value={code} onChange={e => setCode(e.target.value)}>{insulinProducts.map(d => <option key={d.code} value={d.code}>{insulinProductLabel(d.code)}</option>)}</select><input className="ml-2 border border-rule p-1" aria-label="朝-昼-夕-眠前の単位" value={dose} onChange={e => setDose(e.target.value)} /><div className="flex flex-wrap gap-2">{INSULIN_SLOTS.map((slot, i) => <label key={slot}>{slot}<select aria-label={`${slot}の単位`} value={parseInsulinDoses(dose)?.[i] ?? 0} onChange={e => { const u = parseInsulinDoses(dose) ?? [0, 0, 0, 0]; u[i] = Number(e.target.value); setDose(u.join("-")); }}>{Array.from({ length: 31 }, (_, n) => <option key={n}>{n}</option>)}</select>{[-2, -1, 1, 2].map(delta => <button key={delta} className="mx-1 border border-rule" onClick={() => { const u = parseInsulinDoses(dose) ?? [0, 0, 0, 0]; u[i] = Math.max(0, Math.min(30, u[i] + delta)); setDose(u.join("-")); }}>{delta > 0 ? "+" : ""}{delta}</button>)}</label>)}</div><label>開始 <input aria-label="開始日（明日=1）" type="number" min={1} className="w-16 border border-rule" value={start} onChange={e => setStart(Number(e.target.value))} />日後から</label><label className="block"><input type="checkbox" checked={!!scale} onChange={e => setScale(e.target.checked ? { times: ["07:30", "11:30", "17:30", "21:00"], rows: [{ from: 0, to: null, units: 0 }] } : undefined)} />スライディングスケール</label>{scale && <SlidingScaleEditor value={scale} onChange={setScale} />}{error && <p role="alert" className="text-shu">{error}</p>}<button className="rounded bg-ai px-3 py-1 text-white" onClick={() => { try { insulinEdit?.onDraft?.(interventionDraft(code, dose, start, scale, previous)); setEditing(false); } catch (e) { setError((e as Error).message); } }}>下書きに入れる</button><button className="ml-3" onClick={() => setEditing(false)}>閉じる</button></section>}
  </div>;
}
