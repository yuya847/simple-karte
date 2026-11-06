"use client";
import { useState, useSyncExternalStore } from "react";
import { DOCUMENT_CATEGORIES, filterDocuments, type CatalogItem, type DocumentCategory, type DocumentSuggestion } from "@/lib/document-catalog";

import { documentMemorySnapshot, parseDocumentMemory, rememberDocument, saveDocumentMemory, subscribeDocumentMemory, type DocumentMemory } from "@/lib/document-memory";
export function DocumentBrowser({ items, actor, onCreate, suggestions = [], disabled = false, canCreate = () => true }: { items: CatalogItem[]; actor: string; onCreate: (id: string) => void; suggestions?: DocumentSuggestion[]; disabled?: boolean; canCreate?: (id: string) => boolean }) {
  const rawMemory = useSyncExternalStore(subscribeDocumentMemory, () => documentMemorySnapshot(actor), () => "");
  const memory = parseDocumentMemory(rawMemory);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<DocumentCategory>();
  const store = (m: DocumentMemory) => saveDocumentMemory(actor, m);
  const create = (id: string) => { if (disabled || !canCreate(id)) return; onCreate(id); if (id.startsWith("CONSENT-")) rememberDocument(actor, id); };
  const filtered = filterDocuments(items, query, category);
  const frequent = filtered.filter(i => memory.stars.includes(i.id) || memory.recent.includes(i.id)).sort((a, b) => Number(memory.stars.includes(b.id)) - Number(memory.stars.includes(a.id)) || memory.recent.indexOf(a.id) - memory.recent.indexOf(b.id));
  const row = (i: CatalogItem) => <li key={i.id} className="flex items-center gap-2 border-b border-rule-soft py-1.5"><button type="button" aria-label={`${i.name}をお気に入り${memory.stars.includes(i.id) ? "から外す" : "にする"}`} aria-pressed={memory.stars.includes(i.id)} onClick={() => store({ ...memory, stars: memory.stars.includes(i.id) ? memory.stars.filter(x => x !== i.id) : [...memory.stars, i.id] })} className="text-yamabuki">{memory.stars.includes(i.id) ? "★" : "☆"}</button><div className="min-w-0 flex-1"><b>{i.name}</b><p className="truncate text-xs text-ink-soft" title={i.description}>{i.description}</p></div><button disabled={disabled || !canCreate(i.id)} type="button" onClick={() => create(i.id)} className="shrink-0 rounded border border-rule px-3 py-1 text-ai disabled:opacity-40">作る</button></li>;
  return <section className="space-y-2 text-[13px]">
    <input aria-label="書類を検索" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="書類名・よみ・略称で検索" className="w-full rounded border border-rule bg-sheet px-3 py-2" />
    <div className="flex flex-wrap gap-1">{([undefined, ...DOCUMENT_CATEGORIES] as const).map(c => <button key={c ?? "all"} type="button" aria-pressed={c === category} onClick={() => setCategory(c)} className={`rounded-full border px-2 py-1 ${c === category ? "border-ai bg-ai-soft text-ai" : "border-rule"}`}>{c ?? "すべて"}</button>)}</div>
    {suggestions.length > 0 && <div className="flex gap-2 overflow-x-auto whitespace-nowrap text-xs"><b>この患者で作るとよい書類</b>{suggestions.map(s => { const i = items.find(i => i.id === s.id); return i && <button type="button" disabled={disabled || !canCreate(s.id)} key={s.id} onClick={() => create(s.id)} className="text-ai">{i.name}（{s.reason}）</button>; })}</div>}
    {frequent.length > 0 && <div><h3 className="font-bold">よく使う</h3><ul>{frequent.map(row)}</ul></div>}
    <ul className="max-h-72 overflow-y-auto">{filtered.filter(i => !frequent.some(f => f.id === i.id)).map(row)}</ul>
    {!filtered.length && <p className="text-ink-soft">該当する書類はありません。</p>}
  </section>;
}
