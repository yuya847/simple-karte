"use client";
import { nutritionWork } from "@/lib/nutrition-work";
import type { ComponentProps } from "react";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
type Args = Parameters<typeof nutritionWork>;
export function NutritionToday({people,evaluations,teams,guidance,today,onOpen}: {people:Args[0];evaluations:Args[1];teams:Args[2];guidance:Args[3];today:CalendarDate;onOpen?:(id:string,panel:"nutrition"|"team"|"guide-record")=>void}) {
 const rows=nutritionWork(people,evaluations,teams,guidance);
 const table = (items: typeof rows) => <table className="w-full text-left text-xs"><thead><tr>{["日付","患者・部屋","仕事","内容"].map(x=><th key={x} className="px-2 py-1">{x}</th>)}</tr></thead><tbody>{items.map((r,i)=><tr key={`${r.patientId}-${i}`} className="border-t border-rule-soft"><td className="whitespace-nowrap px-2 py-1">{formatShort(addDays(today,r.day))}</td><td className="whitespace-nowrap px-2 py-1"><button type="button" className="text-ai underline" onClick={()=>onOpen?.(r.patientId,r.panel)}>{r.room} {r.name}</button></td><td className="px-2 py-1">{r.kind}</td><td className="px-2 py-1">{r.detail}</td></tr>)}</tbody></table>;
 const due = rows.filter(r => r.day === 0);
 const overdue = rows.filter(r => r.day < 0);
 const future = rows.filter(r => r.day > 0);
 return <section aria-label="今日の仕事" className="space-y-3 rounded border border-rule bg-sheet p-3"><h2 className="font-bold">今日の仕事（{due.length}）</h2>
 {due.length ? table(due) : <p>今日の仕事はありません。</p>}
 <details><summary className="cursor-pointer font-bold">期限切れ（{overdue.length}）</summary>{table(overdue)}</details>
 <div><h3 className="font-bold">これから（{future.length}）</h3>{future.length ? table(future) : <p>予定はありません。</p>}</div>
 </section>;
}

export type NutritionTodayProps = ComponentProps<typeof NutritionToday>;
