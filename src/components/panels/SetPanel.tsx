"use client";

import { useState } from "react";
import type { Draft } from "@/lib/drafts";
import { CROSS_SETS, expandSet, itemLabel } from "@/lib/order-sets";

/** セット展開: choose a set, take out what is not needed, and put the rest in as drafts. */
export function SetPanel({ onAdd, newId }: { onAdd: (d: Draft[]) => void; newId: () => string }) {
  const [code, setCode] = useState<string | null>(null);
  const [keep, setKeep] = useState<boolean[]>([]);
  const set = CROSS_SETS.find((s) => s.code === code);
  return (
    <div className="space-y-3 text-[13px]">

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
            {keep.filter(Boolean).length}件を保存する
          </button>
        </section>
      )}
    </div>
  );
}

/* ヘルプへ移動した説明:
セットを選び、要らない項目のチェックを外してから下書きにします。採る時刻・撮り方などは、下書きの確かめで選びます。
*/
