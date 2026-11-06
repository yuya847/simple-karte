"use client";

import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { DEFAULT_LAYOUT, FLOW_GROUPS, FLOW_ROWS, careRowKey, careShown, chooseSet, deleteSet, groupOrder, groupShown, moveGroup, saveSet, toggleCollapsed, toggleHidden, type FlowGroupKey, type FlowLayout } from "@/lib/flow-layout";

/** One group of the flow sheet with its heading; pressing the heading folds it. */
export function FlowGroup({ id, title, layout, onLayout, extra, children }: { id: FlowGroupKey; title: string; layout: FlowLayout; onLayout: (l: FlowLayout) => void; extra?: React.ReactNode; children: React.ReactNode }) {
  const folded = layout.collapsed.includes(id);
  return (
    <section aria-label={title} className="mt-3 first:mt-0">
      <div className="flex items-center gap-2 border-b border-rule py-1 text-[11px] font-bold text-ink-soft">
        <button type="button" onClick={() => onLayout(toggleCollapsed(layout, id))} aria-expanded={!folded} className="flex items-center gap-0.5 rounded px-0.5 hover:bg-paper hover:text-ink">
          <span className="print:hidden">{folded ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</span>
          {title}
        </button>
        {folded && <span className="font-normal text-ink-faint">（たたんでいます）</span>}
        {!folded && extra}
      </div>
      {!folded && children}
    </section>
  );
}

/**
 * 行の設定: which groups and rows to show and in what order, and sets of 看護ケア・観察 rows to switch between.
 * Kept per user in this browser.
 */
export function FlowLayoutPanel({ layout, onLayout, careItems, onClose }: { layout: FlowLayout; onLayout: (l: FlowLayout) => void; careItems: string[]; onClose: () => void }) {
  const [name, setName] = useState("");
  const order = groupOrder(layout.order);
  const title = (k: FlowGroupKey) => FLOW_GROUPS.find((g) => g.key === k)!.title;
  const shownCare = careItems.filter((i) => careShown(layout, i));
  const box = "accent-ai";
  return (
    <div className="mb-2 space-y-2 rounded-md border border-rule bg-sheet p-2 text-[11px] shadow">
      <div className="flex items-center gap-2">
        <b className="text-[12px]">行の設定</b>
        <span className="text-ink-faint">この端末のこの利用者のみに適用されます。</span>
        <button type="button" onClick={() => onLayout({ ...DEFAULT_LAYOUT, sets: layout.sets })} className="ml-auto rounded border border-rule px-2 py-0.5">
          並びと表示を初期に戻す
        </button>
        <button type="button" onClick={onClose} aria-label="行の設定を閉じる" className="rounded p-0.5 text-ink-faint hover:text-ink">
          <X size={13} />
        </button>
      </div>
      <ol className="space-y-1">
        {order.map((k, i) => {
          const rows = k === "care" ? careItems.map((item) => ({ key: careRowKey(item), label: item })) : (FLOW_ROWS[k] ?? []);
          return (
            <li key={k} className="rounded border border-rule-soft bg-paper/60 px-1.5 py-1">
              <div className="flex items-center gap-1.5">
                <label className="flex flex-1 cursor-pointer items-center gap-1 font-bold">
                  <input type="checkbox" className={box} checked={groupShown(layout, k)} onChange={() => onLayout(toggleHidden(layout, `group:${k}`))} />
                  {title(k)}
                </label>
                <button type="button" disabled={i === 0} onClick={() => onLayout(moveGroup(layout, k, -1))} aria-label={`${title(k)}を上へ`} className="rounded border border-rule p-0.5 disabled:opacity-30">
                  <ArrowUp size={11} />
                </button>
                <button type="button" disabled={i === order.length - 1} onClick={() => onLayout(moveGroup(layout, k, 1))} aria-label={`${title(k)}を下へ`} className="rounded border border-rule p-0.5 disabled:opacity-30">
                  <ArrowDown size={11} />
                </button>
              </div>
              {rows.length > 0 && groupShown(layout, k) && (
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 pl-4">
                  {rows.map((r) => (
                    <label key={r.key} className="flex cursor-pointer items-center gap-1">
                      <input type="checkbox" className={box} checked={!layout.hidden.includes(r.key)} onChange={() => onLayout(toggleHidden(layout, r.key))} />
                      {r.label}
                    </label>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="space-y-1 rounded border border-rule-soft px-1.5 py-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <b>観察項目のセット</b>
          <select value={layout.activeSet ?? ""} onChange={(e) => onLayout(chooseSet(layout, e.target.value || null))} aria-label="使うセット" className="rounded border border-rule bg-paper px-1 py-0.5">
            <option value="">すべての看護ケア・観察</option>
            {layout.sets.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}（{s.items.length}行）
              </option>
            ))}
          </select>
          {layout.activeSet && (
            <button type="button" onClick={() => onLayout(deleteSet(layout, layout.activeSet!))} className="rounded border border-shu/50 px-1.5 py-0.5 text-shu">
              このセットを消す
            </button>
          )}
        </div>
        <form
          className="flex flex-wrap items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            onLayout(saveSet(layout, name, shownCare));
            setName("");
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：呼吸の観察" aria-label="セットの名前" className="w-32 rounded border border-rule bg-paper px-1 py-0.5" />
          <button type="submit" disabled={!name.trim() || !shownCare.length} className="rounded bg-ai px-2 py-0.5 font-bold text-white disabled:opacity-40">
            いま出している看護ケア・観察の行（{shownCare.length}行）をセットに残す
          </button>
        </form>

      </div>
    </div>
  );
}

/* Help migration source (references and dynamic wording):
<p >セットは項目の名前で覚えるので、ほかの患者にも使えます。セットを選ぶと、その項目の行だけが出ます。</p>
*/
