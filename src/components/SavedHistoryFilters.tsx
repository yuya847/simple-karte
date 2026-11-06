"use client";

import { useState } from "react";
import { filterProblems, moveFilter, removeFilter, sameFilter, type FilterConditions, type SavedFilter } from "@/lib/history-filters";

export function SavedHistoryFilters({ list, current, onApply, onChange }: {
  list: SavedFilter[]; current: FilterConditions; onApply: (f: SavedFilter) => void; onChange: (list: SavedFilter[]) => void;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id?: string; name: string } | null>(null);
  const [error, setError] = useState("");
  const start = (id?: string, name = "") => { setEditing({ id, name }); setError(""); setMenu(null); };
  const submit = () => {
    if (!editing) return;
    const name = editing.name.trim();
    const problems = filterProblems(name, list, editing.id);
    const duplicate = list.find((f) => f.name === name && f.id !== editing.id);
    if (problems.length && (!duplicate || editing.id)) { setError(problems.join("")); return; }
    if (duplicate && !window.confirm(`「${name}」をいまの条件で上書きしますか？`)) return;
    const existing = editing.id ? list.find((f) => f.id === editing.id) : duplicate;
    const value = editing.id && existing ? { ...existing, name } : { ...current, id: existing?.id ?? crypto.randomUUID(), name };
    onChange(existing ? list.map((f) => f.id === existing.id ? value : f) : [...list, value]);
    setEditing(null);
  };
  return <span role="group" aria-label="保存した絞り込み" className="flex flex-wrap items-center gap-1">
    {list.map((f, i) => <span key={f.id} className="relative flex rounded border border-rule" onContextMenu={(e) => { e.preventDefault(); setMenu(f.id); }}>
      <button type="button" aria-pressed={sameFilter(current, f)} onClick={() => onApply(f)} className={`rounded-l px-2 py-0.5 ${sameFilter(current, f) ? "bg-ai text-white" : "hover:bg-paper"}`}>{f.name}</button>
      <button type="button" aria-label={`${f.name}のメニュー`} aria-expanded={menu === f.id} onClick={() => setMenu(menu === f.id ? null : f.id)} className="px-1">…</button>
      {menu === f.id && <span className="absolute left-0 top-full z-20 flex min-w-36 flex-col rounded border border-rule bg-sheet p-1 shadow">
        <button type="button" onClick={() => start(f.id, f.name)}>名前を変える</button>
        <button type="button" onClick={() => { onChange(removeFilter(list, f.id)); setMenu(null); }}>消す</button>
        <button type="button" disabled={i === 0} onClick={() => onChange(moveFilter(list, f.id, -1))}>前へ移す</button>
        <button type="button" disabled={i === list.length - 1} onClick={() => onChange(moveFilter(list, f.id, 1))}>後ろへ移す</button>
        <button type="button" onClick={() => setMenu(null)}>閉じる</button>
      </span>}
    </span>)}
    <button type="button" onClick={() => start()} className="rounded border border-rule px-2 py-0.5">＋いまの条件を保存</button>
    {editing && <span className="flex flex-wrap items-center gap-1">
      <input aria-label="絞り込みの名前" autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } if (e.key === "Escape") setEditing(null); }} className="rounded border border-rule bg-paper px-2 py-1" />
      <button type="button" onClick={submit}>保存</button>
      <button type="button" onClick={() => setEditing(null)}>やめる</button>
      {error && <span role="alert" className="text-shu">{error}</span>}
    </span>}
    <span className="hint">この端末のみに保存します。初回の「医師の記事だけ」は架空の使用例です。名前の変更・削除ができます。</span>
  </span>;
}
