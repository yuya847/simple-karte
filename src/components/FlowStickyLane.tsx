"use client";

import { Plus, StickyNote, Trash2, X } from "lucide-react";
import { useState } from "react";
import { GRAPH_NOTE_MAX, canRemoveNote, cleanNote, clusterNotes, type GraphNote } from "@/lib/flow-stickies";

const clock = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

interface Props {
  notes: GraphNote[];
  xAbs: (a: number) => number;
  lo: number;
  hi: number;
  plotW: number;
  labelW: number;
  meName: string;
  /** "11/3（火） 14:20" for a time. */
  fmtAt: (a: number) => string;
  /** Where a new note is being written (null = none), and moving it there. */
  draftAt: number | null;
  onDraft: (at: number | null) => void;
  /** Where the 「＋」 puts a new one (now, or the window when now is not in it). */
  defaultAt: number;
  /** Missing for those who cannot put notes (the 記事 permission). */
  onAdd?: (n: { at: number; text: string }) => void;
  onRemove?: (id: string) => void;
}

/**
 * 付箋 on the graph: a row of small markers at their time above the vital strips. Touching one shows its
 * text, who wrote it and when; its author can take it off. Pressing the row (or the graph) puts a new one.
 */
export function FlowStickyLane({ notes, xAbs, lo, hi, plotW, labelW, meName, fmtAt, draftAt, defaultAt, onDraft, onAdd, onRemove }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [time, setTime] = useState<{ for: number; v: string } | null>(null);
  const groups = clusterNotes(notes, xAbs);
  const shown = open === null ? null : groups.find((g) => Math.round(g.x) === open);
  const draftTime = draftAt === null ? null : time && time.for === draftAt ? time.v : clock(draftAt);
  const draftAbs = draftAt === null || draftTime === null || !/^([01]\d|2[0-3]):[0-5]\d$/.test(draftTime) ? null : Math.floor(draftAt / 1440) * 1440 + Number(draftTime.slice(0, 2)) * 60 + Number(draftTime.slice(3));
  const close = () => {
    onDraft(null);
    setText("");
    setTime(null);
  };
  return (
    <>
      <div className="flex border-b border-rule-soft">
        <div className="flex shrink-0 items-center justify-end gap-1 py-0.5 pr-2 text-ink-soft" style={{ width: labelW }}>
          <StickyNote size={11} className="text-yamabuki" aria-hidden />
          付箋
          {onAdd && (
            <button type="button" onClick={() => onDraft(defaultAt)} aria-label="付箋を貼る" title="付箋を貼る" className="rounded p-0.5 text-ink-faint hover:text-ai print:hidden">
              <Plus size={11} />
            </button>
          )}
        </div>
        <div
          className={`relative h-6 flex-1 ${onAdd ? "cursor-copy" : ""}`}
          onClick={(e) => {
            if (!onAdd) return;
            const r = e.currentTarget.getBoundingClientRect();
            onDraft(Math.round((lo + ((e.clientX - r.left) / plotW) * (hi - lo)) / 5) * 5);
            setTime(null);
          }}
        >
          {groups.map((g) => (
            <span key={`${g.x}`} className="absolute top-0.5 flex -translate-x-1/2 items-center gap-0.5" style={{ left: g.x }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(open === Math.round(g.x) ? null : Math.round(g.x));
                }}
                title={g.notes.map((n) => `${clock(n.at)} ${n.text}（${n.by}）`).join("\n")}
                aria-label={`付箋 ${g.notes.length}枚：${g.notes.map((n) => n.text).join("、")}`}
                className="flex h-4 min-w-4 items-center justify-center rounded-sm border border-yamabuki/60 bg-yamabuki-soft px-0.5 text-[9px] font-bold text-yamabuki shadow-sm"
              >
                {g.notes.length > 1 ? g.notes.length : "付"}
              </button>
              <span className="hidden max-w-40 truncate text-[9px] text-yamabuki print:inline">{g.notes.map((n) => n.text).join("／")}</span>
            </span>
          ))}
          {draftAt !== null && <span aria-hidden className="absolute inset-y-0 w-px bg-yamabuki" style={{ left: xAbs(draftAbs ?? draftAt) }} />}
          {shown && (
            <div onClick={(e) => e.stopPropagation()} className="absolute top-6 z-20 w-64 space-y-1 rounded-md border border-yamabuki/60 bg-sheet p-2 text-[11px] shadow-lg" style={{ left: Math.max(0, Math.min(plotW - 256, shown.x - 20)) }}>
              <div className="flex items-center gap-1 font-bold text-yamabuki">
                付箋
                <button type="button" onClick={() => setOpen(null)} aria-label="閉じる" className="ml-auto text-ink-faint hover:text-ink">
                  <X size={12} />
                </button>
              </div>
              {shown.notes.map((n) => (
                <div key={n.id} className="border-t border-rule-soft pt-1">
                  <div className="whitespace-pre-wrap text-ink">{n.text}</div>
                  <div className="nums flex items-center gap-1 text-[10px] text-ink-faint">
                    {fmtAt(n.at)} の付箋　{n.by}（{n.written.time} に記入）
                    {onRemove && canRemoveNote(n, meName) && (
                      <button type="button" onClick={() => onRemove(n.id)} className="ml-auto flex items-center gap-0.5 rounded px-1 text-shu hover:bg-shu-soft">
                        <Trash2 size={10} />
                        はがす
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {draftAt !== null && onAdd && (
        <form
          className="flex flex-wrap items-center gap-1.5 border-b border-rule-soft bg-yamabuki-soft/40 py-1 text-[11px] print:hidden"
          style={{ paddingLeft: labelW }}
          onSubmit={(e) => {
            e.preventDefault();
            const t = cleanNote(text);
            if (!t || draftAbs === null) return;
            onAdd({ at: draftAbs, text: t });
            close();
          }}
        >
          <span className="text-ink-soft">{fmtAt(draftAt).replace(/ \d\d:\d\d$/, "")}</span>
          <input value={draftTime ?? ""} onChange={(e) => draftAt !== null && setTime({ for: draftAt, v: e.target.value })} aria-label="付箋の時刻" className="w-14 rounded border border-rule bg-paper px-1 py-0.5 text-right" />
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={GRAPH_NOTE_MAX} placeholder="例：解熱剤のあと再検" aria-label="付箋に書くこと" className="min-w-40 flex-1 rounded border border-rule bg-paper px-1.5 py-0.5" />
          <button type="submit" disabled={!cleanNote(text) || draftAbs === null} className="rounded bg-yamabuki px-2 py-0.5 font-bold text-white disabled:opacity-40">
            貼る（{meName}）
          </button>
          <button type="button" onClick={close} className="rounded border border-rule px-2 py-0.5">
            やめる
          </button>
        </form>
      )}
    </>
  );
}
