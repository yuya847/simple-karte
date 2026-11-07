"use client";
import { postopRestConflicts, replacePostopRest } from '@/lib/anesthesia-orders';
import { useState } from 'react';
import { LINE_CATS, type LineCat, type StandingLine } from '@/lib/standing-lines';
import { addDays, formatShort, type CalendarDate } from '@/lib/dates';

export interface AnesthesiaOrders {
  lines: Record<string, StandingLine[]>;
  onAdd: (pid: string, text: string, cat: LineCat, changedFrom?: string) => void;
}
export function AnesthesiaPostopOrders({patientId, orders, today, locked, nowTime}:{patientId:string;orders:AnesthesiaOrders;today:CalendarDate;locked:boolean;nowTime:string}) {
  const [text,setText]=useState('');
  const [cat,setCat]=useState<LineCat>('観察');
  const [open,setOpen]=useState(false);
  const [asking,setAsking]=useState(false);
  const conflicts=postopRestConflicts(orders.lines[patientId]??[],cat,text,nowTime);
  const commit=(replace:boolean)=>{if(replace && conflicts.length){for(const old of conflicts) orders.onAdd(patientId,replacePostopRest(old,text),old.cat,old.id);}else orders.onAdd(patientId,`術後指示：${text.trim()}`,cat);setText('');setAsking(false);};
  return <div><button type="button" className="rounded border border-rule px-2 py-1" onClick={()=>setOpen(!open)}>術後指示を{open?'閉じる':'開く'}</button>{open && <section aria-label="術後指示" className="space-y-2 rounded border border-rule bg-sheet p-3"><h4 className="font-bold">術後指示（指示簿）</h4>{(orders.lines[patientId]??[]).filter(l=>!l.stop && !l.changed).map(l=><p key={l.id} className="whitespace-pre-wrap">{l.cat} {l.text} · {formatShort(addDays(today,l.start.day))} {l.start.time}〜 · {l.by}</p>)}<div className="flex flex-wrap gap-2"><select aria-label="術後指示の分類" value={cat} disabled={locked} onChange={e=>setCat(e.target.value as LineCat)}>{LINE_CATS.map(k=><option key={k}>{k}</option>)}</select><textarea aria-label="術後指示の本文" className="min-w-80 rounded border border-rule p-2" disabled={locked} value={text} onChange={e=>setText(e.target.value)}/><button disabled={locked || !text.trim()} className="rounded border border-rule px-2" onClick={()=>{if(conflicts.length)setAsking(true);else commit(false);}}>術後指示を確定</button>{asking && <><span>有効な安静度の指示があります</span><button className="rounded border border-rule px-2" onClick={()=>commit(true)}>置き換える</button><button className="rounded border border-rule px-2" onClick={()=>commit(false)}>追加する</button><button onClick={()=>setAsking(false)}>戻る</button></>}</div></section>}</div>;
}
