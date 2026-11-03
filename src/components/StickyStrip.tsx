"use client";

import { Plus, StickyNote, X } from "lucide-react";
import { useState } from "react";
import { useMe } from "./RoleContext";

export interface Sticky {
  id: string;
  text: string;
  by: string;
  at: string;
  /** Seen by everyone, or only by the person who wrote it. */
  shared: boolean;
}

/**
 * 付箋: short reminders stuck on the chart (「明日の CT の前に同意書」…), shown under the patient band.
 * Not part of the record: they can be taken off when done. Only the writer sees a private one.
 */
export function StickyStrip({ stickies, onAdd, onRemove, newId, nowTime }: { stickies: Sticky[]; onAdd: (s: Sticky) => void; onRemove: (id: string) => void; newId: () => string; nowTime: string }) {
  const me = useMe();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [shared, setShared] = useState<boolean | null>(null);
  const mine = stickies.filter((s) => s.shared || s.by === me.name);
  if (!mine.length && !adding)
    return (
      <div className="flex justify-end border-b border-rule-soft bg-sheet px-4 py-0.5">
        <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1 text-[11px] text-ink-faint hover:text-yamabuki">
          <StickyNote size={12} />
          付箋を貼る
        </button>
      </div>
    );
  const add = () => {
    if (!text.trim() || shared === null) return;
    onAdd({ id: newId(), text: text.trim(), by: me.name, at: nowTime, shared });
    setText("");
    setShared(null);
    setAdding(false);
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-rule-soft bg-yamabuki-soft/40 px-4 py-1 text-[12px]">
      <StickyNote size={13} className="text-yamabuki" />
      {mine.map((s) => (
        <span key={s.id} title={`${s.at} ${s.by}${s.shared ? "（みんなに）" : "（自分だけ）"}`} className="flex items-center gap-1 rounded bg-yamabuki-soft px-2 py-0.5 text-ink shadow-sm">
          {s.text}
          <span className="text-[10px] text-ink-faint">{s.shared ? s.by : "自分だけ"}</span>
          <button type="button" onClick={() => onRemove(s.id)} aria-label={`付箋「${s.text}」をはがす`} className="text-ink-faint hover:text-shu">
            <X size={12} />
          </button>
        </span>
      ))}
      {adding ? (
        <span className="flex flex-wrap items-center gap-1">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && add()}
            placeholder="例：明日の CT の前に同意書"
            aria-label="付箋の文"
            className="w-56 rounded border border-rule bg-sheet px-2 py-0.5"
          />
          {[
            [true, "みんなに"],
            [false, "自分だけ"],
          ].map(([v, l]) => (
            <button key={String(l)} type="button" aria-pressed={shared === v} onClick={() => setShared(v as boolean)} className={`rounded border px-1.5 py-0.5 ${shared === v ? "border-ink bg-ink text-white" : "border-rule"}`}>
              {l as string}
            </button>
          ))}
          <button type="button" disabled={!text.trim() || shared === null} onClick={add} className="rounded bg-yamabuki px-2 py-0.5 font-bold text-white disabled:opacity-40">
            貼る
          </button>
          <button type="button" onClick={() => setAdding(false)} className="text-ink-faint">
            やめる
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setAdding(true)} aria-label="付箋を貼る" className="rounded p-0.5 text-ink-faint hover:text-yamabuki">
          <Plus size={13} />
        </button>
      )}
      <span className="ml-auto text-[10px] text-ink-faint">付箋は記録ではありません（済んだらはがす）</span>
    </div>
  );
}
