"use client";

import { X } from "lucide-react";

/**
 * 内服・注射の入力を、記事の下（下書きが溜まる場所の上）にそのまま出す枠。浮いたウインドウにしないので、
 * 記事とカルテの右側を隠さない（ユーザー 2026-11-06）。
 */
export function InlineOrder({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="my-2 rounded-md border border-ai/40 bg-sheet">
      <div className="flex items-center gap-2 border-b border-rule bg-ai-soft/50 px-3 py-1 text-sm">
        <h2 className="font-bold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="閉じる" className="ml-auto rounded p-0.5 text-ink-faint hover:text-ink">
          <X size={16} />
        </button>
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}
