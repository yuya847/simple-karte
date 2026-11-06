"use client";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { deleteToolGroup, moveTool, type ToolLayout } from "@/lib/tool-layout";
export function ToolLayoutEditor({ layout, labels, icons, onChange, onReset }: { layout: ToolLayout; labels: Record<string, string>; icons: Record<string, LucideIcon>; onChange: (v: ToolLayout) => void; onReset: () => void }) {
  const [drag, setDrag] = useState<string | null>(null);
  return <div className="space-y-2 text-[11px]" aria-label="道具の配置を編集">
    <div className="flex gap-2"><button onClick={() => onChange({ ...layout, groups: [...layout.groups, { key: `custom:${Date.now()}`, title: "新しいカテゴリ", tools: [] }] })}>カテゴリを追加</button><button onClick={onReset}>初めに戻す</button></div>
    {layout.groups.map(g => <section key={g.key} className="rounded border border-rule p-1" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (drag) onChange(moveTool(layout, drag, g.key)); setDrag(null); }}>
      <div className="flex"><input aria-label={`${g.title}の名前`} className="min-w-0 w-full bg-sheet" value={g.title} onChange={e => onChange({ ...layout, groups: layout.groups.map(x => x.key === g.key ? { ...x, title: e.target.value } : x) })} /><button disabled={g.key === "other"} aria-label={`${g.title}を削除`} onClick={() => onChange(deleteToolGroup(layout, g.key))}>削除</button></div>
      {g.tools.map((t, i) => <div key={t} draggable onDragStart={() => setDrag(t)} onDragEnd={() => setDrag(null)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); e.stopPropagation(); if (drag) onChange(moveTool(layout, drag, g.key, t)); setDrag(null); }} className="my-1 rounded bg-sheet p-1">
        <label><input type="checkbox" checked={!layout.hidden.includes(t)} onChange={() => onChange({ ...layout, hidden: layout.hidden.includes(t) ? layout.hidden.filter(x => x !== t) : [...layout.hidden, t] })} />{icons[t] && (() => { const Icon = icons[t]; return <Icon size={16} className="inline-block mx-1" />; })()}{labels[t] ?? t}</label>
        <div className="flex gap-1"><button aria-label={`${labels[t]}を上へ`} disabled={i === 0} onClick={() => onChange(moveTool(layout, t, g.key, g.tools[i - 1]))}>↑</button><button aria-label={`${labels[t]}を下へ`} disabled={i === g.tools.length - 1} onClick={() => onChange(moveTool(layout, g.tools[i + 1], g.key, t))}>↓</button><select aria-label={`${labels[t]}の移動先`} className="min-w-0 flex-1" value={g.key} onChange={e => onChange(moveTool(layout, t, e.target.value))}>{layout.groups.map(x => <option key={x.key} value={x.key}>{x.title}</option>)}</select></div>
      </div>)}
    </section>)}
  </div>;
}
