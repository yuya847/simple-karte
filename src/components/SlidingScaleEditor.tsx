"use client";
import { TimeInputs } from "@/components/TimeInput";
import { defaultSliding } from "@/lib/insulin";
import type { SlidingScale } from "@/lib/types";
import { SLIDING_HINT, slidingProblems } from "@/lib/insulin";
export function SlidingScaleEditor({value:s,onChange}:{value:SlidingScale;onChange:(s:SlidingScale)=>void}) {
 const number = (v:string) => v === "" ? NaN : Number(v);
 return <div className="space-y-1 text-xs"><p className="hint">{SLIDING_HINT}</p><span>血糖測定の時刻<TimeInputs label="血糖測定の時刻" times={s.times} options={defaultSliding().times} onChange={times=>onChange({...s,times})}/></span><p className="hint">時刻は打っても選んでも入力できます。初期値は毎食前・眠前です。</p><table><thead><tr><th>血糖 mg/dL（以上）</th><th>以下（空欄は上限なし）</th><th>単位</th><th /></tr></thead><tbody>{s.rows.map((r,i)=><tr key={i}>{(["from","to","units"] as const).map(k=><td key={k}><input aria-label={`${i+1}行 ${k}`} type="number" min="0" className="w-24 border border-rule" value={r[k] === null || Number.isNaN(r[k]) ? "" : r[k]} onChange={e=>onChange({...s,rows:s.rows.map((a,j)=>j===i?{...a,[k]:k==="to" && !e.target.value?null:number(e.target.value)}:a)})}/></td>)}<td><button type="button" onClick={()=>onChange({...s,rows:s.rows.filter((_,j)=>j!==i)})}>削除</button></td></tr>)}</tbody></table><button type="button" onClick={()=>onChange({...s,rows:[...s.rows,{from:(s.rows.at(-1)?.to ?? s.rows.at(-1)?.from ?? -1)+1,to:null,units:0}]})}>行を追加</button><label className="block">この血糖値以上は医師へ連絡<input type="number" min="0" value={s.callAbove ?? ""} onChange={e=>onChange({...s,callAbove:e.target.value?number(e.target.value):undefined})}/></label>{slidingProblems(s).map(x=><p className="text-shu" key={x}>{x}</p>)}</div>;
}
