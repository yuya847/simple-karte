"use client";

import { Check, DoorOpen, Minus, TriangleAlert } from "lucide-react";
import { createPortal } from "react-dom";
import type { CheckItem } from "@/lib/discharge-check";

/** 退院の実施: the checklist gathered from the record, then the person carries it out (or not). */
export function DischargeDialog({ name, items, onDo, onClose }: { name: string; items: CheckItem[]; onDo: () => void; onClose: () => void }) {
  const left = items.filter((i) => i.state === "todo").length;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="退院の実施" className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-rule bg-sheet p-4 text-[13px] shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 flex items-center gap-1.5 text-base font-bold">
          <DoorOpen size={18} />
          {name}さんの退院を実施する
        </h2>
        <p className="mb-2 text-xs text-ink-soft">カルテから集めた退院の準備です（コードで集めた事実）。済んでいないものがあっても、実施するかどうかは押す人が決めます。</p>
        <ul className="mb-3 divide-y divide-rule-soft rounded-md border border-rule">
          {items.map((i) => (
            <li key={i.label} className="flex items-start gap-2 px-3 py-1.5">
              {i.state === "ok" ? <Check size={14} className="mt-0.5 text-wakatake" /> : i.state === "none" ? <Minus size={14} className="mt-0.5 text-ink-faint" /> : <TriangleAlert size={14} className="mt-0.5 text-yamabuki" />}
              <span className="w-32 shrink-0 font-bold">{i.label}</span>
              <span className={i.state === "todo" ? "text-yamabuki" : "text-ink-soft"}>{i.detail}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onDo} className="rounded-md bg-ai px-4 py-1.5 font-bold text-white">
            退院を実施{left ? `（済んでいないもの ${left}件）` : ""}
          </button>
          <button type="button" onClick={onClose} className="rounded-md border border-rule px-3 py-1.5">
            やめる
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
