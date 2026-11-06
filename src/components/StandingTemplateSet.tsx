"use client";
import { useState } from 'react';
import { standingTitle, type LineTemplate, type LineCat } from '@/lib/standing-lines';
import { selectedStandingText, standingRowKey } from '@/lib/standing-set-selection';
export function StandingTemplateSet({ templates, disabled, onPick }: { templates: LineTemplate[]; disabled: boolean; onPick: (cat: LineCat, text: string) => void }) {
  const [keep, setKeep] = useState<string[]>([]);
  const keys = (t: LineTemplate) => t.text.split('\n').slice(1).map((_, i) => standingRowKey(t.id, i));
  const text = selectedStandingText(templates, keep);
  return <div className="space-y-2"><button type="button" onClick={() => setKeep(templates.flatMap(keys))}>全部</button> <button type="button" onClick={() => setKeep([])}>選択を外す</button>{templates.map(t => <section key={t.id}><label className="font-bold"><input type="checkbox" checked={keys(t).every(k => keep.includes(k))} onChange={e => setKeep(v => e.target.checked ? [...new Set([...v, ...keys(t)])] : v.filter(k => !keys(t).includes(k)))} /> {standingTitle(t.text)}</label><div className="ml-5 text-[11px] text-ink-soft">{t.text.split('\n').slice(1).map((row, i) => { const key = standingRowKey(t.id, i); return <label key={key} className="flex gap-2"><input type="checkbox" checked={keep.includes(key)} onChange={e => setKeep(v => e.target.checked ? [...v, key] : v.filter(k => k !== key))} />{row}</label>; })}</div></section>)}<button type="button" disabled={disabled || !text} onClick={() => { const selected = templates.filter(t => keys(t).some(k => keep.includes(k))); onPick(selected.every(t => t.cat === selected[0].cat) ? selected[0].cat : 'その他', text); }} className="rounded border border-ai px-2 py-1 text-ai disabled:opacity-40">選んだ指示を入力欄へ</button></div>;
}
