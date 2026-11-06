"use client";

import { GripVertical } from "lucide-react";
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { indentBlock, isDividerLine, isSectionHeadingLine, isHeadingLine, joinWithNext, joinWithPrevious, moveLines, movedLine, nudgeLine, offsetOf, posOf, replaceLine, splitLine, toLines, unitAt, type Edited } from "@/lib/note-blocks";
import { isProblemLine, problemMarkerEnd, stripProblemMarker } from "@/lib/note-problems";
const leadingSpace = (l: string) => l.match(/^[ \t　]*/)![0];
import { toggleMark } from "@/lib/note-edit";
import { renumberProblems } from "@/lib/note-problems";
import { expandAt, type Phrase } from "@/lib/phrases";

/** What the pane around the editor can ask of it (the text itself comes and goes through value/onChange). */
export interface NoteBlocksHandle {
  /** Focus the line the caret was on last (or the last line). */
  focus(): void;
  /** The selection as offsets in the whole text — the last known one while no line has focus. */
  readonly selection: { start: number; end: number };
  /** Put the caret (or a selection) at these offsets of the text after it changes, and focus that line. */
  select(start: number, end?: number): void;
}

interface Props {
  ref?: Ref<NoteBlocksHandle>;
  value: string;
  onChange: (text: string) => void;
  /** 定型文 for 「;読み」 then Tab. */
  phrases?: Phrase[];
  readOnly?: boolean;
  /** The text selected in a line (for the 定型文 panel's "register the selection"). */
  onSelectedText?: (text: string) => void;
  /** 「LD」「ばいたる」 then Tab or Enter: the latest blood test or vital signs replace the line (lab-paste.ts); null when none. */
  pastes?: { test: (line: string) => boolean; text: () => string | null }[];
}

/** Typography shared by each line's box and the hidden copy that gives it its height. */
const TEXT = "nums whitespace-pre-wrap break-words px-2 py-0.5 text-[13px] leading-relaxed pointer-coarse:text-[16px]";
const LONG_PRESS_MS = 450;

/**
 * The note being written, one line (block) at a time, the way Notion edits: Enter makes the next line (indented
 * under a "＃"), Backspace at the start joins the line above, ↑↓ move between lines, Tab indents, ⌘B/⌘I wrap in
 * ** / *, 「;読み」 then Tab puts a 定型文 in. Each line has a grip on its left (shown on hover, focus or a long
 * press): drag it to move the line — a "＃" line takes its body — to the blue line, or press Alt+↑↓. The
 * "＃" lines are numbered from the top after every change (renumberProblems). The text stays one string:
 * what the pane gets back is always the lines joined with "\n".
 */
export function NoteBlocks({ ref, value, onChange, phrases = [], readOnly = false, onSelectedText, pastes = [] }: Props) {
  const [whole, setWhole] = useState(false);
  const wholeRef = useRef<HTMLTextAreaElement | null>(null);
  const wholeRange = useRef({ start: 0, end: 0 });
  const pointerAnchor = useRef<number | null>(null);
  const lines = toLines(value);
  const rows = useRef<(HTMLTextAreaElement | null)[]>([]);
  const mirrors = useRef<(HTMLDivElement | null)[]>([]);
  const wraps = useRef<(HTMLDivElement | null)[]>([]);
  const latest = useRef(value);
  // The selection the person made last (line and columns), kept while the focus is elsewhere.
  const sel = useRef<{ line: number; start: number; end: number } | null>(null);
  // Where the caret should go once the new text has rendered.
  const pending = useRef<{ start: number; end: number } | null>(null);
  const composing = useRef(false);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number; at: number | null } | null>(null);
  const [shown, setShown] = useState<number | null>(null);

  const flush = () => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    const text = latest.current;
    if (wholeRef.current) {
      wholeRef.current.focus();
      wholeRef.current.setSelectionRange(p.start, p.end);
      wholeRange.current = p;
      return;
    }
    const s = posOf(text, p.start);
    const e = posOf(text, p.end);
    const el = rows.current[s.line];
    if (!el) return;
    el.focus();
    const end = e.line === s.line ? e.col : el.value.length;
    el.setSelectionRange(s.col, end);
    sel.current = { line: s.line, start: s.col, end };
  };
  useLayoutEffect(() => {
    latest.current = value;
    flush();
  }, [value, whole]);

  const commit = (r: Edited | { text: string; start: number; end: number }) => {
    const range = "caret" in r ? { start: r.caret, end: r.caret } : { start: r.start, end: r.end };
    pending.current = range;
    onChange(r.text);
    requestAnimationFrame(flush);
  };
  /** The text with the "＃" numbers given again, the caret kept; nothing pending when nothing changed. */
  const numbered = (text: string, caret: number): Edited => renumberProblems(text, caret);

  useImperativeHandle(ref, () => ({
    focus() {
      if (wholeRef.current) { wholeRef.current.focus(); return; }
      const text = latest.current;
      const s = sel.current ?? { line: toLines(text).length - 1, start: Infinity, end: Infinity };
      pending.current = { start: offsetOf(text, { line: s.line, col: s.start }), end: offsetOf(text, { line: s.line, col: s.end }) };
      flush();
    },
    get selection() {
      if (wholeRef.current) return wholeRange.current;
      const text = latest.current;
      const active = rows.current.findIndex((el) => el && typeof document !== "undefined" && el === document.activeElement);
      const s = active >= 0 ? { line: active, start: rows.current[active]!.selectionStart, end: rows.current[active]!.selectionEnd } : sel.current;
      if (!s) return { start: text.length, end: text.length };
      return { start: offsetOf(text, { line: s.line, col: s.start }), end: offsetOf(text, { line: s.line, col: s.end }) };
    },
    select(start, end = start) {
      pending.current = { start, end };
      if (posOf(latest.current, start).line !== posOf(latest.current, end).line) setWhole(true);
      requestAnimationFrame(flush);
    },
  }));

  const remember = (i: number, el: HTMLTextAreaElement) => {
    sel.current = { line: i, start: el.selectionStart, end: el.selectionEnd };
    onSelectedText?.(el.value.slice(el.selectionStart, el.selectionEnd));
  };

  /** Typing in a line (also a paste with line breaks, which makes more lines). */
  const typed = (i: number, el: HTMLTextAreaElement, isComposing: boolean) => {
    const v = el.value;
    const r = replaceLine(latest.current, i, v, el.selectionStart);
    if (v.includes("\n")) {
      commit(numbered(r.text, r.caret));
      return;
    }
    // IME composition is numbered once the conversion finishes.
    if (isComposing || composing.current) {
      onChange(r.text);
      return;
    }
    const n = numbered(r.text, r.caret);
    if (n.text === r.text) onChange(r.text);
    else commit(n);
  };

  /** Whether the caret sits on the first (or last) visual row of a wrapped line. */
  const edgeRow = (i: number, col: number, which: "first" | "last") => {
    const m = mirrors.current[i];
    const node = m?.firstChild;
    if (!m || !node || typeof document === "undefined") return true;
    try {
      // The character at the caret (the copy ends with a space, so there is always one).
      const range = document.createRange();
      const at = Math.min(col, (node.textContent?.length ?? 1) - 1);
      range.setStart(node, at);
      range.setEnd(node, at + 1);
      const r = range.getClientRects()[0] ?? range.getBoundingClientRect();
      const box = m.getBoundingClientRect();
      if (!r || !r.height) return true;
      return which === "first" ? r.top - box.top < r.height / 2 : box.bottom - r.bottom < r.height / 2;
    } catch {
      return true;
    }
  };

  const focusLine = (i: number, col: number) => {
    const el = rows.current[i];
    if (!el) return;
    el.focus();
    const c = Math.min(col, el.value.length);
    el.setSelectionRange(c, c);
    sel.current = { line: i, start: c, end: c };
  };

  const keyDown = (i: number, e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      pending.current = { start: 0, end: latest.current.length };
      setWhole(true);
      return;
    }
    if (readOnly) return;
    // Enter and the arrows during IME conversion belong to the IME (Safari reports it as keyCode 229 too).
    if (e.nativeEvent.isComposing || composing.current || e.keyCode === 229) return;
    const el = e.currentTarget;
    const text = latest.current;
    const s = el.selectionStart;
    const en = el.selectionEnd;
    const base = offsetOf(text, { line: i, col: 0 });
    const line = lines[i];
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey && !e.shiftKey && (e.key === "b" || e.key === "B" || e.key === "i" || e.key === "I")) {
      e.preventDefault();
      const r = toggleMark(line, s, en, e.key.toLowerCase() === "b" ? "**" : "*");
      commit({ text: replaceLine(text, i, r.text).text, start: base + r.start, end: base + r.end });
      return;
    }
    // 「LD」 on its own line, then Tab or Enter: the latest blood test (学会発表の書式) replaces the line.
    const paste = (e.key === "Tab" || e.key === "Enter") && !e.shiftKey && !mod ? pastes.find((x) => x.test(line)) : undefined;
    if (paste) {
      const pasted = paste.text();
      if (pasted) {
        e.preventDefault();
        commit(replaceLine(text, i, pasted));
        return;
      }
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (!e.shiftKey && s === en) {
        const r = expandAt(text, base + s, phrases);
        if (r) {
          commit(r);
          return;
        }
      }
      commit(indentBlock(text, i, s, en, e.shiftKey));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const cut = s === en ? text : replaceLine(text, i, line.slice(0, s) + line.slice(en), s).text;
      const r = splitLine(cut, i, s);
      commit(numbered(r.text, r.caret));
      return;
    }
    // Backspace just after a problem's "＃n " marker removes the marker (the text stays), like a list bullet.
    if (e.key === "Backspace" && !mod && s === en) {
      const markerEnd = problemMarkerEnd(line);
      if (markerEnd !== null && s > 0 && s <= markerEnd) {
        e.preventDefault();
        const bare = stripProblemMarker(line);
        const r = replaceLine(text, i, bare, leadingSpace(bare).length);
        commit(numbered(r.text, r.caret));
        return;
      }
    }
    if (e.key === "Backspace" && isDividerLine(line) && !mod) {
      e.preventDefault();
      commit(replaceLine(text, i, ""));
      return;
    }
    if (e.key === "Backspace" && s === 0 && en === 0 && i > 0 && !mod) {
      e.preventDefault();
      const r = joinWithPrevious(text, i);
      commit(numbered(r.text, r.caret));
      return;
    }
    if (e.key === "Delete" && s === line.length && en === s && i + 1 < lines.length && !mod) {
      e.preventDefault();
      const r = joinWithNext(text, i);
      commit(numbered(r.text, r.caret));
      return;
    }
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      // Only a problem (＃) block moves; other lines stay where they are.
      if (!isProblemLine(lines[i] ?? "")) return;
      e.preventDefault();
      commit(nudgeLine(text, i, s, e.key === "ArrowUp" ? -1 : 1));
      return;
    }
    if (e.shiftKey || mod || e.altKey) return;
    if (e.key === "ArrowUp" && i > 0 && edgeRow(i, s, "first")) {
      e.preventDefault();
      focusLine(i - 1, s);
    } else if (e.key === "ArrowDown" && i + 1 < lines.length && edgeRow(i, s, "last")) {
      e.preventDefault();
      focusLine(i + 1, s);
    } else if (e.key === "ArrowLeft" && s === 0 && en === 0 && i > 0) {
      e.preventDefault();
      focusLine(i - 1, Infinity);
    } else if (e.key === "ArrowRight" && s === line.length && en === s && i + 1 < lines.length) {
      e.preventDefault();
      focusLine(i + 1, 0);
    }
  };

  /** The line boundary the pointer is over: before line k (k = the number of lines means after the last). */
  const boundaryAt = (y: number) => {
    let at = lines.length;
    for (let k = 0; k < lines.length; k++) {
      const r = wraps.current[k]?.getBoundingClientRect();
      if (r && y < r.top + r.height / 2) {
        at = k;
        break;
      }
    }
    return at;
  };

  const dropped = (d: NonNullable<typeof drag>) => {
    setDrag(null);
    if (d.at === null) return;
    const text = latest.current;
    const out = moveLines(text, d.from, d.to, d.at);
    if (out === text) return;
    commit({ text: out, caret: offsetOf(out, { line: movedLine(d.from, d.to, d.at), col: 0 }) });
  };

  const cancelPress = () => {
    if (press.current) clearTimeout(press.current);
    press.current = null;
  };

  // Use the rendered character rectangles so wrapping and Japanese text keep their exact offsets.
  const pointOffset = (x: number, y: number) => {
    let best = { distance: Infinity, offset: 0 };
    mirrors.current.forEach((mirror, i) => {
      const node = mirror?.firstChild;
      if (!node) return;
      for (let col = 0; col <= (lines[i]?.length ?? 0); col++) {
        const range = document.createRange();
        range.setStart(node, col);
        range.setEnd(node, col + 1);
        const r = range.getBoundingClientRect();
        const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
        const dx = Math.abs(x - r.left);
        const distance = dy * 10000 + dx;
        if (distance < best.distance) best = { distance, offset: offsetOf(latest.current, { line: i, col }) };
      }
    });
    return best.offset;
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const anchor = pointerAnchor.current;
      if (anchor === null) return;
      const end = pointOffset(e.clientX, e.clientY);
      if (posOf(latest.current, anchor).line === posOf(latest.current, end).line && !wholeRef.current) return;
      e.preventDefault();
      const range = { start: Math.min(anchor, end), end: Math.max(anchor, end) };
      wholeRange.current = range;
      pending.current = range;
      setWhole(true);
      if (wholeRef.current) flush();
    };
    const up = () => { pointerAnchor.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
  });

  const firstSection = lines.findIndex(isSectionHeadingLine);

  return (
    <div
      onPointerDownCapture={(e) => {
        if (whole || e.button !== 0 || !(e.target instanceof HTMLTextAreaElement)) return;
        const at = pointOffset(e.clientX, e.clientY);
        if (e.shiftKey) {
          e.preventDefault();
          const anchor = sel.current ? offsetOf(value, { line: sel.current.line, col: sel.current.start }) : at;
          pending.current = { start: Math.min(anchor, at), end: Math.max(anchor, at) };
          setWhole(true);
        } else pointerAnchor.current = at;
      }}
      role="group"
      aria-label="記事"
      // No box around the whole editor (an empty note is just a blank line); a problem line (＃) gets its own box below.
      className={`relative rounded-md py-1.5 pr-2 ${readOnly ? "bg-paper" : ""}`}
      onClick={(e) => {
        // A click on the margin under the last line puts the caret at its end.
        if (e.target === e.currentTarget) focusLine(lines.length - 1, Infinity);
      }}
    >
      {whole && <textarea ref={wholeRef} aria-label="記事の全行" value={value} readOnly={readOnly}
        className={`${TEXT} absolute left-6 top-1.5 z-20 w-[calc(100%-2rem)] h-[calc(100%-0.75rem)] min-h-20 resize-none bg-sheet outline-none`}
        onChange={e => { wholeRange.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; onChange(e.currentTarget.value); }}
        onSelect={e => { wholeRange.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; onSelectedText?.(value.slice(e.currentTarget.selectionStart, e.currentTarget.selectionEnd)); }}
        onBlur={() => { if (pointerAnchor.current === null && wholeRange.current.start === wholeRange.current.end) { const p = posOf(value, wholeRange.current.start); sel.current = { line: p.line, start: p.col, end: p.col }; setWhole(false); } }}
      />}
      <div className={whole ? "invisible" : ""}>
      {lines.map((line, i) => {
        const heading = isHeadingLine(line);
        const divider = isDividerLine(line);
        const sectionRule = isSectionHeadingLine(line) && i !== firstSection;
        const unit = drag && i >= drag.from && i <= drag.to;
        const u = unitAt(value, i);
        const gripLabel = u.problem ? `${line.trim()} のブロック（見出しと本文）を動かす（ドラッグか Alt+↑↓）` : `${i + 1}行目を動かす（ドラッグか Alt+↑↓）`;
        return (
          <div
            key={i}
            ref={(el) => {
              wraps.current[i] = el;
            }}
            className={`group relative pl-6 pointer-coarse:pl-8 ${unit ? "opacity-40" : ""}`}
            onPointerDown={(e) => {
              if (readOnly || e.pointerType !== "touch" || !isProblemLine(line)) return;
              cancelPress();
              press.current = setTimeout(() => setShown(i), LONG_PRESS_MS);
            }}
            onPointerMove={cancelPress}
            onPointerUp={cancelPress}
            onPointerCancel={cancelPress}
          >
            {drag && drag.at === i && <span aria-hidden className="pointer-events-none absolute inset-x-1 top-0 z-10 h-0.5 -translate-y-px rounded bg-ai" />}
            {drag && drag.at === lines.length && i === lines.length - 1 && <span aria-hidden className="pointer-events-none absolute inset-x-1 bottom-0 z-10 h-0.5 translate-y-px rounded bg-ai" />}
            {/* The grip (and the drag) is for reordering problems (＃ blocks) only; other lines stay where they are. */}
            {!readOnly && u.problem && isProblemLine(line) && (
              <button
                type="button"
                tabIndex={-1}
                aria-label={gripLabel}
                title="ドラッグか Alt+↑↓ で動かす"
                data-grip
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setShown(null);
                  setDrag({ from: u.from, to: u.to, at: null });
                }}
                onPointerMove={(e) => {
                  if (!drag || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
                  const at = boundaryAt(e.clientY);
                  if (at !== drag.at) setDrag({ ...drag, at });
                }}
                onPointerUp={(e) => {
                  if (!drag) return;
                  dropped({ ...drag, at: boundaryAt(e.clientY) });
                }}
                onPointerCancel={() => setDrag(null)}
                className={`absolute left-0.5 top-0.5 cursor-grab touch-none rounded p-0.5 text-ink-faint hover:bg-paper hover:text-ink active:cursor-grabbing pointer-coarse:p-1.5 pointer-coarse:top-1 ${
                  shown === i || unit ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                }`}
              >
                <GripVertical size={14} aria-hidden />
              </button>
            )}
            <div className={`relative grid ${sectionRule ? "border-t border-rule" : ""}`}>
              {divider && <span role="separator" className="pointer-events-none absolute inset-x-2 top-1/2 border-t border-rule" />}
              <div
                ref={(el) => {
                  mirrors.current[i] = el;
                }}
                aria-hidden
                className={`${TEXT} invisible [grid-area:1/1/2/2] ${heading ? "font-bold" : ""}`}
              >
                {line + " "}
              </div>
              <textarea
                ref={(el) => {
                  rows.current[i] = el;
                }}
                value={line}
                rows={1}
                readOnly={readOnly}
                aria-label={`${i + 1}行目`}
                data-heading={heading || undefined}
                data-divider={divider || undefined}
                onChange={(e) => typed(i, e.currentTarget, (e.nativeEvent as InputEvent).isComposing)}
                onCompositionStart={() => (composing.current = true)}
                onCompositionEnd={(e) => {
                  composing.current = false;
                  typed(i, e.currentTarget, false);
                }}
                onKeyDown={(e) => keyDown(i, e)}
                onSelect={(e) => remember(i, e.currentTarget)}
                onKeyUp={(e) => remember(i, e.currentTarget)}
                onFocus={(e) => {
                  remember(i, e.currentTarget);
                  setShown(null);
                }}
                onBlur={() => {
                  if (readOnly) return;
                  const r = renumberProblems(latest.current);
                  if (r.text !== latest.current) onChange(r.text);
                }}
                className={`${TEXT} ${divider ? "text-transparent caret-transparent" : ""} resize-none overflow-hidden bg-transparent outline-none [grid-area:1/1/2/2] ${isProblemLine(line) || heading ? "font-bold text-ink" : ""}`}
              />
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
