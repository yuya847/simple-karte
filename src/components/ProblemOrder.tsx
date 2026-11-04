"use client";

import { GripVertical } from "lucide-react";
import { useRef, useState } from "react";
import type { ProblemBlock } from "@/lib/note-problems";

/**
 * The problems (＃) of the note being written, in order, each with a grip: drag it up or down (mouse or
 * finger), or press ↑/↓ on it, to move the problem — its "#" line and the body under it — and the numbers
 * are given again. Problems under different SOAP marks do not change places with each other.
 */
export function ProblemOrder({ problems, onMove }: { problems: ProblemBlock[]; onMove: (from: number, to: number) => void }) {
  const rows = useRef<(HTMLLIElement | null)[]>([]);
  const [drag, setDrag] = useState<{ from: number; over: number; dy: number } | null>(null);

  const overAt = (y: number) => {
    let over = 0;
    rows.current.forEach((el, i) => {
      if (el && y > el.getBoundingClientRect().top + el.offsetHeight / 2) over = Math.min(i + 1, problems.length - 1);
    });
    // The row the pointer is on (its middle not yet passed counts as that row).
    const hit = rows.current.findIndex((el) => el && y >= el.getBoundingClientRect().top && y <= el.getBoundingClientRect().bottom);
    return hit >= 0 ? hit : over;
  };

  return (
    <ol aria-label="プロブレムの順番" className="mb-1.5 flex flex-col gap-0.5 rounded-md border border-rule-soft bg-paper px-1.5 py-1 text-[12px]">
      {problems.map((b, i) => {
        const dragging = drag?.from === i;
        const target = drag && drag.over === i && drag.from !== i;
        const movable = (to: number) => problems[to] && problems[to].segment === b.segment;
        return (
          <li
            key={`${b.number}-${b.title}`}
            ref={(el) => {
              rows.current[i] = el;
            }}
            style={dragging ? { transform: `translateY(${drag!.dy}px)` } : undefined}
            className={`nums flex items-center gap-1 rounded px-1 ${dragging ? "relative z-10 bg-sheet shadow" : ""} ${target ? (drag!.from < i ? "border-b-2 border-ai" : "border-t-2 border-ai") : "border-y-2 border-transparent"}`}
          >
            <button
              type="button"
              aria-label={`＃${b.number} ${b.title || "（名前なし）"} の順番を変える（上下キーかドラッグ）`}
              title="ドラッグか ↑↓ で順番を変える"
              onKeyDown={(e) => {
                if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                e.preventDefault();
                const to = i + (e.key === "ArrowUp" ? -1 : 1);
                if (movable(to)) onMove(i, to);
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                setDrag({ from: i, over: i, dy: 0 });
                const startY = e.clientY;
                const move = (ev: PointerEvent) => setDrag({ from: i, over: overAt(ev.clientY), dy: ev.clientY - startY });
                const up = (ev: PointerEvent) => {
                  window.removeEventListener("pointermove", move);
                  window.removeEventListener("pointerup", up);
                  window.removeEventListener("pointercancel", up);
                  setDrag(null);
                  const to = overAt(ev.clientY);
                  if (to !== i && movable(to)) onMove(i, to);
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up);
                window.addEventListener("pointercancel", up);
              }}
              className="cursor-grab touch-none rounded p-0.5 text-ink-faint hover:bg-sheet hover:text-ink active:cursor-grabbing pointer-coarse:p-1.5"
            >
              <GripVertical size={13} aria-hidden />
            </button>
            <span className="font-bold text-ink-soft">＃{b.number}</span>
            <span className="truncate">{b.title || <span className="text-ink-faint">（名前なし）</span>}</span>
          </li>
        );
      })}
    </ol>
  );
}
