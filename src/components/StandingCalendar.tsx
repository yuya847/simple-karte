"use client";

import { StandingLineMenu } from "./StandingLineMenu";
import { StandingOrderForm } from "./panels/StandingOrderForm";
import { displayText } from "@/lib/display-text";
import { StandingBulkStop } from "./StandingBulkStop";
import { dragEnd, type StandingStopDraft } from "@/lib/standing-calendar";
import { useEffect, useRef, useState } from "react";
import { addDays, formatShort, hospitalDay, minutesOf, type CalendarDate } from "@/lib/dates";
import { barMark, barCell, calendarRows, lineCalendarDays, whenText, type StandingLine } from "@/lib/standing-lines";
import type { Patient } from "@/lib/types";
import { CatChip } from "./panels/StandingLines";
import { DenyNote, useDeny, useMe } from "./RoleContext";
import { cssPx, viewH, viewW } from "@/lib/page-zoom";

const HEAD_W = 150;
const COL_W = 44;

/**
 * 指示簿カレンダー: one row per line of the 指示簿 (grouped by category), one column per day from admission to
 * three days ahead. A bar runs from the start to the end; an open-ended line continues past the last column;
 * a stopped line ends where it was stopped. Press a bar for the full text, who and when; a doctor can stop
 * the line here (with a confirmation). Lines derived from the 項目で選ぶ fields are shown but stopped there.
 */
export function StandingCalendar({ patient, lines, today, nowTime, onStop, onOpenPanel, onBulkStop, onEdit, onEndField, onAdd }: { patient: Patient; lines: StandingLine[]; today: CalendarDate; nowTime: string; onStop?: (id: string, reason: string, day?: number, kind?: "終了") => void; onOpenPanel?: () => void; onEdit?: (l: StandingLine) => void; onEndField?: (l: StandingLine) => void; onBulkStop?: (draft: StandingStopDraft) => void; onAdd?: (line: StandingLine) => void }) {
  const [context, setContext] = useState<{ line: StandingLine; x: number; y: number } | null>(null);
  const [adding, setAdding] = useState<{ after?: StandingLine } | null>(null);
  const showMenu = (line: StandingLine, x: number, y: number) => setContext({ line, x, y });
  const [pending, setPending] = useState<{ line: StandingLine; end: number | null } | null>(null);
  const [endReason, setEndReason] = useState("");
  const propose = (line: StandingLine, end: number | null) => { setEndReason(""); setPending({ line, end }); };
  const [selected, setSelected] = useState<string[]>([]);
  const selectable = lines.filter((l) => !l.stop && !l.changed && !l.fromFields);
  const deny = useDeny();
  const canSelect = !!onBulkStop && !deny("order");
  const toggle = (ids: string[]) => setSelected((prev) => ids.every((id) => prev.includes(id)) ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]);
  const me = useMe();
  const days = lineCalendarDays(patient.admittedOn);
  const last = days[days.length - 1];
  const groups = calendarRows(lines);
  const [openId, setOpenId] = useState<string | null>(null);
  const [finish, setFinish] = useState(false);
  const [endDay, setEndDay] = useState(0);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const open = lines.find((l) => l.id === openId) ?? null;
  const fmtDay = (d: number) => formatShort(addDays(today, d));
  const nowPct = Math.min(100, Math.max(0, (minutesOf(nowTime) / 1440) * 100));
  const choose = (id: string) => {
    setOpenId(id === openId ? null : id);
    setConfirming(false);
    setReason("");
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {canSelect && <StandingBulkStop lines={lines} ids={selected} today={today} onConfirm={onBulkStop!} onClear={() => setSelected([])} />}
      <div className="scroll-thin min-h-0 flex-1 overflow-auto pb-4">
        <table className="nums table-fixed border-separate border-spacing-0 text-[12px]" style={{ width: HEAD_W + days.length * COL_W }}>
          <colgroup>
            <col style={{ width: HEAD_W }} />
            {days.map((d) => (
              <col key={d} style={{ width: COL_W }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 border-b border-rule bg-sheet px-3 py-1 text-left font-normal text-[11px] text-ink-faint">{canSelect && <input type="checkbox" aria-label="指示を全選択" checked={!!selectable.length && selectable.every((l) => selected.includes(l.id))} onChange={() => toggle(selectable.map((l) => l.id))} />} 指示簿カレンダー</th>
              {days.map((d) => (
                <th key={d} className={`sticky top-0 z-10 border-b border-l border-rule bg-sheet px-1 py-1 font-normal ${d === 0 ? "bg-ai-soft" : ""}`}>
                  <div className="flex flex-col items-center">
                    <b className={d === 0 ? "text-ai" : d > 0 ? "text-ink-faint" : ""}>{fmtDay(d)}</b>
                    <span className={`text-[10px] ${d === 0 ? "text-ai" : "text-ink-faint"}`}>{d === 0 ? `今日 ${nowTime}` : d > 0 ? "予定" : `${hospitalDay(patient.admittedOn, d)}日目`}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td colSpan={days.length + 1} className="px-3 py-6 text-center text-ink-faint">
                  この患者の指示簿はまだありません。
                </td>
              </tr>
            )}
            {groups.map((g) => (
              <GroupRows onMenu={showMenu} key={g.cat} cat={g.cat} lines={g.lines} days={days} last={last} openId={openId} onChoose={choose} today={today} nowPct={nowPct} onEnd={onAdd && !deny("order") ? propose : undefined} selected={selected} onToggle={canSelect ? toggle : undefined} />
            ))}
          </tbody>
        </table>

      </div>
      {context && <div className="fixed inset-0 z-50" onClick={() => setContext(null)} onContextMenu={e => { e.preventDefault(); setContext(null); }} onKeyDown={e => { if (e.key === "Escape") setContext(null); }}>
        <div className="fixed" style={{ left: Math.min(cssPx(context.x), Math.max(0, viewW() - 216)), top: Math.min(cssPx(context.y), Math.max(0, viewH() - 210)) }}>
          <StandingLineMenu line={context.line} canOrder={!deny("order")} canAdd={!!onAdd} onAction={i => {
            const l = context.line; setContext(null);
            if (i === 0) { if (onEdit) onEdit(l); else onOpenPanel?.(); }
            if (i === 1) { if (l.fromFields) onEndField?.(l); else { setOpenId(l.id); setFinish(true); setEndDay(Math.max(0, l.start.day)); setReason(""); setConfirming(true); } }
            if (i === 2 || i === 3) setAdding(i === 2 ? { after: l } : {});
            if (i === 4) void navigator.clipboard?.writeText(displayText(l.text));
          }} />
        </div>
      </div>}
      {adding && onAdd && <div role="dialog" aria-label="指示を追加" className="max-h-[65vh] overflow-auto border-t border-rule bg-paper p-3">
        <button type="button" className="float-right" onClick={() => setAdding(null)}>閉じる</button>
        <StandingOrderForm initialCategory={adding.after?.cat} lines={lines.filter(l => !l.fromFields)} versions={[]} nowTime={nowTime} today={today} patientId={patient.id} fmtDay={fmtDay} newId={() => `standing-${crypto.randomUUID()}`} onAdd={l => { onAdd({ ...l, insertAfter: adding.after?.id }); setAdding(null); }} onStop={onStop ?? (() => {})} onEditFields={l => { if (l) onEdit?.(l); }} />
      </div>}
      {pending && <div role="dialog" aria-label="終了日の変更" className="border-t border-rule bg-paper p-3 text-[12px]">
        <p>{displayText(pending.line.text.split("\n")[0])} を {pending.end === null ? "変えるまで続けます" : `${fmtDay(pending.end)}までにします`}</p>
        <label>理由（任意）<input autoFocus className="mx-2 rounded border border-rule bg-sheet px-2" value={endReason} onChange={(e) => setEndReason(e.target.value)} /></label>
        <button type="button" className="rounded bg-ai px-3 py-1 text-white" onClick={() => {
          const current = lines.find((l) => l.id === pending.line.id);
          if (current && !deny("order") && !current.stop && !current.changed && !current.fromFields) onAdd?.({ ...current, id: `${current.id}-end-draft`, start: { day: Math.max(0, current.start.day), time: current.start.day > 0 ? current.start.time : nowTime }, end: pending.end === null ? undefined : { day: pending.end }, at: { day: 0, time: nowTime }, changedFrom: current.id, changeReason: endReason });
          setPending(null);
        }}>する</button> <button type="button" onClick={() => setPending(null)}>やめる</button>
      </div>}
      {open && (
        <div role="region" aria-label="選んだ指示" className="border-t border-rule bg-paper px-4 py-2 text-[12px]">
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
            <CatChip cat={open.cat} />
            <div className="min-w-0 flex-1">
              <div className={`whitespace-pre-wrap ${open.stop && open.stop.kind !== "終了" ? "line-through text-ink-soft" : ""}`}>{displayText(open.text)}</div>
              <div className="nums text-[11px] text-ink-soft">
                {displayText(whenText(open.start, fmtDay))}から{displayText(open.end ? ` ${whenText(open.end, fmtDay)}まで` : "（変えるまで）")}　書いた人 {displayText(open.by)}（{fmtDay(open.at.day)} {open.at.time}）
                {open.fromFields && "　項目で選ぶ指示簿から"}
              </div>
              {open.changed && <div className="text-ink-faint">変更前 {fmtDay(open.changed.day)} {open.changed.time} {displayText(open.changed.by)} {displayText(open.changed.reason)}</div>}
              {open.stop && (
                <div className="nums text-[11px] font-bold text-shu">
                  {open.stop.kind ?? "中止"} {fmtDay(open.stop.day)} {open.stop.time}　{displayText(open.stop.by)}
                  {displayText(open.stop.reason ? `　理由：${open.stop.reason}` : "")}
                </div>
              )}
            </div>
            <button type="button" onClick={() => choose(open.id)} className="rounded border border-rule px-2 py-0.5 text-[11px] text-ink-soft">
              閉じる
            </button>
          </div>
          {!open.stop && !open.changed && !deny("order") && <div className="flex gap-3"><button type="button" disabled={open.start.day > 0} onClick={() => onEdit ? onEdit(open) : onOpenPanel?.()}>指示を変更</button>{(open.fromFields ? !!onEndField : !!onStop) && <button type="button" onClick={() => { if (open.fromFields) { onEndField?.(open); return; } setFinish(true); setEndDay(0); setConfirming(true); }}>指示を終了</button>}</div>}
          {!open.stop && !open.changed && !open.fromFields && onStop && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {confirming ? (
                <>
                  {finish && <label>終了日（今日からの日数）<input type="number" aria-label="指示を終了する日" min={open.start.day} max={open.end?.day} value={endDay} onChange={(e) => setEndDay(Number(e.target.value))} /></label>}<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={`${finish ? "終了" : "中止"}の理由（任意）`} aria-label={`${finish ? "終了" : "中止"}の理由`} className="min-w-48 flex-1 rounded border border-rule bg-sheet px-1.5 py-0.5" />
                  <button
                    type="button"
                    disabled={!!deny("order") || (finish && (endDay < open.start.day || (open.end !== undefined && endDay > open.end.day)))}
                    onClick={() => {
                      onStop(open.id, reason, finish ? endDay : 0, finish ? "終了" : undefined);
                      choose(open.id);
                    }}
                    className="rounded bg-shu px-2 py-0.5 font-bold text-white disabled:opacity-40"
                  >
                    {finish ? "この行を終了する" : "この行を中止する"}（{me.name} {nowTime}）
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} className="rounded border border-rule px-2 py-0.5 text-ink-soft">
                    やめる
                  </button>
                </>
              ) : (
                <button type="button" disabled={!!deny("order")} onClick={() => { setFinish(false); setConfirming(true); }} className="rounded border border-rule px-2 py-0.5 text-ink-soft hover:border-shu hover:text-shu disabled:opacity-40 pointer-coarse:py-1.5">
                  中止…
                </button>
              )}
              <DenyNote action="order" />
            </div>
          )}
          {!open.fromFields && !open.stop && !open.changed && open.end && onAdd && !deny("order") && <button type="button" onClick={() => propose(open, null)}>変えるまで続ける（終了日をなくす）</button>}
          {open.fromFields && onOpenPanel && (
            <button type="button" onClick={onOpenPanel} className="mt-1.5 rounded border border-ai/50 px-2 py-0.5 text-[11px] font-bold text-ai hover:bg-ai-soft">
              指示簿を開いて変える
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function GroupRows({ onMenu, today, cat, lines, days, last, openId, onChoose, nowPct, selected, onToggle, onEnd }: { onMenu: (line: StandingLine, x: number, y: number) => void; today: CalendarDate; cat: StandingLine["cat"]; lines: StandingLine[]; days: number[]; last: number; openId: string | null; onChoose: (id: string) => void; nowPct: number; selected: string[]; onToggle?: (ids: string[]) => void; onEnd?: (line: StandingLine, end: number) => void }) {
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdPoint = useRef({ x: 0, y: 0 });
  const held = useRef(false);
  useEffect(() => () => { if (hold.current) clearTimeout(hold.current); }, []);
  const cancelHold = () => { if (hold.current) clearTimeout(hold.current); hold.current = null; };
  const [preview, setPreview] = useState<{ id: string; end: number } | null>(null);
  const dragging = useRef<{ id: string; pointer: number; x: number; day: number; moved: boolean } | null>(null);
  const targetDay = (l: StandingLine, x: number) => dragEnd(l, Math.min(last, dragging.current!.day + Math.round(cssPx(x - dragging.current!.x) / COL_W)), 0).end!;
  return (
    <>
      <tr>
        <td colSpan={days.length + 1} className="sticky left-0 border-b border-rule bg-paper px-3 pb-0.5 pt-2 text-[11px] font-bold text-ink-soft">
          {onToggle && <input type="checkbox" aria-label={`${cat}を全選択`} checked={lines.some((l) => !l.stop && !l.changed && !l.fromFields) && lines.filter((l) => !l.stop && !l.changed && !l.fromFields).every((l) => selected.includes(l.id))} onChange={() => onToggle(lines.filter((l) => !l.stop && !l.changed && !l.fromFields).map((l) => l.id))} />} <CatChip cat={cat} small /> {cat}
        </td>
      </tr>
      {lines.map((l) => {
        const chosen = openId === l.id;
        const tone = l.changed ? "bg-tab text-ink-faint" : l.stop?.kind === "終了" ? "bg-tab text-ink-faint" : l.stop ? "bg-shu-soft/40 text-ink-faint line-through" : l.fromFields ? "bg-tab text-ink-soft" : l.start.day > 0 ? "border border-dashed border-ai/60 bg-sheet text-ai" : "bg-ai-soft text-ai";
        return (
          <tr key={l.id} className={chosen ? "bg-yamabuki-soft/30" : ""}>
            <th scope="row" onContextMenu={e => { e.preventDefault(); cancelHold(); onMenu(l, e.clientX, e.clientY); }} onPointerDown={e => { if (e.pointerType === "mouse") return; cancelHold(); held.current = false; holdPoint.current = { x: e.clientX, y: e.clientY }; hold.current = setTimeout(() => { held.current = true; onMenu(l, e.clientX, e.clientY); hold.current = null; }, 550); }} onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerMove={e => { if (Math.hypot(e.clientX - holdPoint.current.x, e.clientY - holdPoint.current.y) > 10) cancelHold(); }} onClickCapture={e => { if (held.current) { e.preventDefault(); e.stopPropagation(); held.current = false; } }} className="sticky left-0 z-[5] border-b border-rule-soft bg-sheet px-3 py-1 text-left align-top font-normal">
              {onToggle && !l.stop && !l.changed && !l.fromFields && <input type="checkbox" aria-label={displayText(`${l.text}を選択`)} checked={selected.includes(l.id)} onChange={() => onToggle([l.id])} />}
              <button type="button" onClick={() => onChoose(l.id)} aria-expanded={chosen} className={`block w-full truncate text-left hover:text-ai ${l.stop && l.stop.kind !== "終了" ? "text-ink-faint line-through" : ""}`} title={displayText(l.text)}>
                {displayText(l.text.split("\n")[0])}
              </button>
              <div className="text-[10px] text-ink-faint">
                {displayText(l.by)}
                {l.changed ? "　変更前" : l.stop ? `　${l.stop.kind ?? "中止"}` : l.end ? "　終了日あり" : ""}
              </div>
            </th>
            {days.map((d) => {
              const shown = preview?.id === l.id ? { ...l, end: { day: preview.end } } : l;
              const c = barCell(shown, d, last);
              const mark = barMark(shown, d, last);
              const handle = onEnd && !l.fromFields && !l.stop && !l.changed && barCell(l, d, last).on && d === Math.min(l.end?.day ?? last, last);
              return (
                <td key={d} className={`relative border-b border-l border-rule-soft p-0 align-middle ${d === 0 ? "bg-ai-soft/30" : d > 0 ? "bg-paper/50" : ""}`}>
                  {c.on && (
                    <button
                      type="button"
                      onClick={() => onChoose(l.id)}
                      aria-label={displayText(`${l.text}　${c.label || (c.first ? "開始" : c.continues ? "続く" : "")}`)}
                      className={`relative my-1.5 block h-5 w-full truncate px-1 text-left text-[10px] leading-5 ${tone} ${c.first ? "rounded-l" : ""} ${c.last ? "rounded-r" : ""}`}
                    >
                      {displayText(c.first || d === days[0] ? `${l.text.split("\n")[0]}　${c.label}` : c.label)}
                      {mark === "arrow" && <span className="absolute right-0 top-0 bg-ai-soft px-1 text-xl font-bold leading-5" aria-label="右へ続く">→</span>}{mark === "end" && !l.stop && <span className="absolute right-0 top-0 bg-ai-soft text-[10px]">〜{formatShort(addDays(today, d))}</span>}
                    </button>
                  )}
                  {preview?.id === l.id && d === preview.end && <span className="pointer-events-none absolute bottom-full right-0 z-30 whitespace-nowrap rounded border border-rule bg-sheet px-2 py-1 shadow">{formatShort(addDays(today, preview.end))}まで</span>}
                  {handle && <button type="button" aria-label={displayText(`${l.text}の終了日をドラッグ`)} title="終了日を変える" style={{ transform: preview?.id === l.id ? `translateX(${(preview.end - d) * COL_W}px)` : undefined }} className="group absolute -right-2 top-0 z-10 flex h-full w-6 cursor-ew-resize touch-none items-center justify-center"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => { if (!e.isPrimary || e.button !== 0) return; e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); dragging.current = { id: l.id, pointer: e.pointerId, x: e.clientX, day: d, moved: false }; }}
                    onPointerMove={(e) => { const active = dragging.current; if (!active || active.id !== l.id || active.pointer !== e.pointerId) return; active.moved ||= Math.abs(e.clientX - active.x) > 3; if (active.moved) setPreview({ id: l.id, end: targetDay(l, e.clientX) }); }}
                    onPointerUp={(e) => { const active = dragging.current; if (!active || active.id !== l.id || active.pointer !== e.pointerId) return; const result = dragEnd(l, targetDay(l, e.clientX), 0); dragging.current = null; setPreview(null); if (active.moved && result.kind !== "none" && !result.problem) onEnd(l, result.end!); }}
                    onPointerCancel={() => { dragging.current = null; setPreview(null); }} onLostPointerCapture={() => { dragging.current = null; setPreview(null); }}
                  ><span className="h-4 w-[6px] rounded bg-ai group-hover:w-2 group-focus-visible:w-2" /></button>}
                  {d === 0 && <span aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-shu" style={{ left: `${nowPct}%` }} />}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

/* Help migration source (references and dynamic wording):
<p >
          {LINE_RULES.cats} 帯の右端をドラッグすると終わりの日を変えられます（延ばす・縮める）
          <span > 色の帯が指示の続く期間です。右端の「→」は表示期間の先まで指示が続く印です。終了日のある帯は「〜日付」で閉じます。変更前の帯は薄く残ります。「中止」と書かれた所で止まった帯は中止した行（履歴として残ります）。帯を押すと全文・書いた人・時刻が下に出ます。薄い帯は「項目で選ぶ」指示簿の版から出した行で、変えるときはその指示簿を変えます。今日の列の赤い線がいまの時刻。</span>
        </p>
*/
