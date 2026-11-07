"use client";
import { useState } from 'react';
import { draftLine } from '@/lib/draft-line';
import type { CheckContext, Draft } from '@/lib/drafts';
import { reusableDraft, saveSavedSet, setDraft, type SavedSet } from '@/lib/saved-sets';
import { useMe } from './RoleContext';
/** 「セットにする」を押すと下書きの横に選ぶ印が出て（picking）、選んだ下書きをセットに保存する。閉じると印も消える。 */
export function DraftSetComposer({ drafts, selected, ctx, picking, onPick, onDone }: { ctx: CheckContext; drafts: Draft[]; selected: string[]; picking: boolean; onPick: (on: boolean) => void; onDone: () => void }) {
  const me = useMe();
  const open = picking;
  const setOpen = (on: boolean) => { if (on) onPick(true); else onDone(); };
  const [name, setName] = useState('');
  const [scope, setScope] = useState<SavedSet['scope']>('自分だけ');
  const [fields, setFields] = useState<Record<string, { heading: string; note: string; label: string }>>({});
  const [error, setError] = useState('');
  const rows = drafts.filter(d => selected.includes(d.id) && reusableDraft(d));
  return <div className="text-xs"><button type="button" aria-pressed={open} onClick={() => setOpen(!open)} className="rounded border border-ai px-2 py-1 text-ai aria-pressed:bg-ai-soft">{open ? `セットにする（${rows.length}）` : "セットにする"}</button>{open && <section aria-label="セットの作成" className="space-y-2 rounded border border-rule bg-sheet p-2">
    <label>名前<input aria-label="セット名" value={name} onChange={e => setName(e.target.value)} className="ml-2 border border-rule p-1" /></label>
    <select aria-label="公開範囲" value={scope} onChange={e => setScope(e.target.value as SavedSet['scope'])}>{['自分だけ', '科', '病棟'].map(s => <option key={s}>{s}</option>)}</select>
    {rows.map((d, i) => <div key={d.id} className="flex flex-wrap gap-1">{i + 1}{(['label', 'heading', 'note'] as const).map(k => <input key={k} aria-label={`${i + 1}行目の${k === 'label' ? '名前' : k === 'heading' ? '見出し' : '注意書き'}`} placeholder={k === 'label' ? '行の名前' : k === 'heading' ? '見出し' : '注意書き'} value={fields[d.id]?.[k] ?? (k === 'label' ? draftLine(d, ctx) : '')} onChange={e => setFields(v => ({ ...v, [d.id]: { ...(v[d.id] ?? { heading: '', note: '', label: draftLine(d, ctx) }), [k]: e.target.value } }))} className="min-w-0 border border-rule p-1" />)}</div>)}
    <button type="button" disabled={!name.trim() || !rows.length || rows.some(d => !(fields[d.id]?.label ?? draftLine(d, ctx)).trim())} onClick={() => { const ok = saveSavedSet({ id: crypto.randomUUID(), name: name.trim(), owner: me.name, scope, rows: rows.map(d => ({ ...(fields[d.id] ?? { heading: '', note: '', label: draftLine(d, ctx) }), draft: setDraft(d, '') })) }); if (!ok) { setError('端末に保存できません。'); return; } setOpen(false); }} className="rounded bg-ai px-3 py-1 text-white disabled:opacity-40">保存</button><button type="button" onClick={() => setOpen(false)}>閉じる</button>{error && <p role="alert">{error}</p>}
  </section>}</div>;
}
