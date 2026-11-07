"use client";

import { useEffect, useState } from "react";
import { INITIAL_SAVED_SETS, loadSavedSets, expandSavedSet, setVisible, SET_SCOPES, type SetScope } from "@/lib/saved-sets";
import { useMe } from "../RoleContext";
import type { Draft } from "@/lib/drafts";
import { CROSS_SETS, expandSet, itemLabel } from "@/lib/order-sets";

/** セット展開: choose a set, take out what is not needed, and put the rest in as drafts. */
export function SetPanel({ onAdd, newId }: { onAdd: (d: Draft[]) => void; newId: () => string }) {
  const me = useMe();
  const [saved, setSaved] = useState(loadSavedSets);
  const [chosen, setChosen] = useState<string | null>(null);
  const [indices, setIndices] = useState<number[]>([]);
  useEffect(() => { const refresh = () => setSaved(loadSavedSets()); window.addEventListener('draft-sets-changed', refresh); window.addEventListener('storage', refresh); return () => { window.removeEventListener('draft-sets-changed', refresh); window.removeEventListener('storage', refresh); }; }, []);
  // 院内共通・科・部署・個人: the sets this person may see, narrowed to one scope when chosen.
  const [only, setOnly] = useState<SetScope | null>(null);
  const visible = [...INITIAL_SAVED_SETS, ...saved.filter(s => setVisible(s, me))];
  const available = visible.filter(s => !only || s.scope === only);
  const current = available.find(s => s.id === chosen);
  const [code, setCode] = useState<string | null>(null);
  const [keep, setKeep] = useState<boolean[]>([]);
  const set = CROSS_SETS.find((s) => s.code === code);
  return (
    <div className="space-y-3 text-[13px]">

      <div role="group" aria-label="セットの範囲" className="flex flex-wrap gap-1 text-[11px]">
        {[null, ...SET_SCOPES].map(k => <button key={k ?? "all"} type="button" aria-pressed={only === k} onClick={() => setOnly(k)} className={`rounded border px-1.5 py-0.5 ${only === k ? "border-ai bg-ai text-white" : "border-rule text-ink-soft hover:text-ink"}`}>{k ?? "すべて"}<span className="ml-1 opacity-70">{visible.filter(s => !k || s.scope === k).length}</span></button>)}
      </div>
      {available.map(s => <button type="button" key={s.id} onClick={() => { setChosen(s.id); setIndices(s.rows.map((_, i) => i)); }} className="mr-2 mb-1 inline-flex items-center gap-1.5 rounded border border-rule px-2 py-1">{s.name}<span className="rounded bg-paper px-1 text-[10px] text-ink-soft">{s.scope}</span></button>)}
      {current && <section className="space-y-2 rounded border border-rule p-2"><h3 className="font-bold">{current.name}</h3><button type="button" onClick={() => setIndices(current.rows.map((_, i) => i))}>全部</button> <button type="button" onClick={() => setIndices([])}>選択を外す</button>
        {[...new Set(current.rows.map(r => r.heading))].map(heading => <div key={heading}><label className="block font-bold"><input type="checkbox" checked={current.rows.every((r, i) => r.heading !== heading || indices.includes(i))} onChange={e => setIndices(v => current.rows.flatMap((r, i) => (r.heading === heading ? e.target.checked : v.includes(i)) ? [i] : []))} /> {heading || '項目'}</label>{current.rows.map((r, i) => r.heading === heading && <div key={i}><label className="flex gap-2"><input type="checkbox" checked={indices.includes(i)} onChange={e => setIndices(v => e.target.checked ? [...v, i] : v.filter(n => n !== i))} />{r.label}</label>{r.note && <p className="ml-6 text-[11px] text-ink-soft">{r.note}</p>}</div>)}</div>)}
        <button type="button" disabled={!indices.length} onClick={() => onAdd(expandSavedSet(current, indices, newId))} className="rounded bg-ai px-3 py-2 text-white disabled:opacity-40">{indices.length}件を下書きに入れる</button>
      </section>}
      <ul className="space-y-1.5">
        {CROSS_SETS.map((s) => (
          <li key={s.code}>
            <button
              type="button"
              onClick={() => {
                setCode(s.code);
                setKeep(s.items.map(() => true));
              }}
              className={`w-full rounded-md border px-3 py-2 text-left pointer-coarse:py-3 ${code === s.code ? "border-ai bg-ai-soft" : "border-rule bg-sheet hover:border-ai"}`}
            >
              <b>{s.name}</b>
              <span className="ml-2 text-[12px] text-ink-soft">{s.purpose}</span>
              <span className="block text-[11px] text-ink-faint">{s.items.map(itemLabel).join("／")}</span>
            </button>
          </li>
        ))}
      </ul>
      {set && (
        <section className="space-y-1.5 rounded-md border border-rule bg-paper p-2">
          <h3 className="font-bold">{set.name}</h3>
          {set.items.map((it, i) => (
            <label key={i} className="flex items-center gap-2 pointer-coarse:py-1">
              <input type="checkbox" checked={keep[i] ?? false} onChange={() => setKeep((k) => k.map((v, j) => (j === i ? !v : v)))} className="accent-ai" />
              <span className="text-[11px] text-ink-faint">{it.kind === "lab" ? "検体検査" : it.kind === "imaging" ? "画像" : "生理"}</span>
              {itemLabel(it)}
            </label>
          ))}
          <button type="button" disabled={!keep.some(Boolean)} onClick={() => onAdd(expandSet(set, keep, newId))} className="mt-1 w-full rounded-md bg-ai px-3 py-2 font-bold text-white disabled:opacity-40">
            {keep.filter(Boolean).length}件を下書きに入れる
          </button>
        </section>
      )}
    </div>
  );
}

/* ヘルプへ移動した説明:
セットを選び、要らない項目のチェックを外してから下書きにします。採る時刻・撮り方などは、下書きの確かめで選びます。
*/
