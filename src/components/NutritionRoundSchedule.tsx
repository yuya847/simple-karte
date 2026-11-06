"use client";
import { useState } from "react";
import { DayInput } from "./DayInput";
import { TimeInput } from "./TimeInput";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import type { Moment } from "@/lib/teams";
export function NutritionRoundSchedule({value,today,locked,onSave}:{value?:Moment;today:CalendarDate;locked:boolean;onSave:(at:Moment)=>void}) {
 const [day,setDay]=useState<number|null>(value?.day ?? null);
 const [time,setTime]=useState(value?.time ?? "");
 return <div className="flex flex-wrap items-center gap-2 text-xs">
  <span>NST 次の回診{value ? `：${formatShort(addDays(today,value.day))} ${value.time}` : ""}</span>
  <DayInput label="NST 次の回診日" today={today} value={day} onChange={setDay} disabled={locked} />
  <TimeInput aria-label="NST 次の回診時刻" value={time} onChange={e=>setTime(e.target.value)} disabled={locked} />
  <button type="button" className="rounded border border-rule px-2 py-1 disabled:opacity-40" disabled={locked || day === null || day < 0 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)} onClick={()=>day !== null && onSave({day,time})}>回診の予定を記録</button>
 </div>;
}
