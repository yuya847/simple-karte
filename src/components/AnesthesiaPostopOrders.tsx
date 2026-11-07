"use client";
import { useState } from 'react';
import { LINE_CATS, type LineCat, type StandingLine } from '@/lib/standing-lines';
import { addDays, formatShort, type CalendarDate } from '@/lib/dates';

export interface AnesthesiaOrders {
  lines: Record<string, StandingLine[]>;
  onAdd: (pid: string, text: string, cat: LineCat) => void;
}
export function AnesthesiaPostopOrders({patientId, orders, today, locked}:{patientId:string;orders:AnesthesiaOrders;today:CalendarDate;locked:boolean}) {
  const [text,setText]=useState('');
  const [cat,setCat]=useState<LineCat>('観察');
  const [open,setOpen]=useState(false);
  return <div><button type="button" className="rounded border border-rule px-2 py-1" onClick={()=>setOpen(!open)}>術後指示を{open?'閉じる':'開く'}</button>{open && <section aria-label="術後指示" className="space-y-2 rounded border border-rule bg-sheet p-3"><h4 className="font-bold">術後指示（指示簿）</h4>{(orders.lines[patientId]??[]).filter(l=>!l.stop && !l.changed).map(l=><p key={l.id} className="whitespace-pre-wrap">{l.cat} {l.text} · {formatShort(addDays(today,l.start.day))} {l.start.time}〜 · {l.by}</p>)}<div className="flex flex-wrap gap-2"><select aria-label="術後指示の分類" value={cat} disabled={locked} onChange={e=>setCat(e.target.value as LineCat)}>{LINE_CATS.map(k=><option key={k}>{k}</option>)}</select><textarea aria-label="術後指示の本文" className="min-w-80 rounded border border-rule p-2" disabled={locked} value={text} onChange={e=>setText(e.target.value)}/><button disabled={locked || !text.trim()} className="rounded border border-rule px-2" onClick={()=>{orders.onAdd(patientId,`術後指示：${text.trim()}`,cat);setText('');}}>術後指示を確定</button></div></section>}</div>;
}
