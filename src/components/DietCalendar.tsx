"use client";

import { calendarBands } from "@/lib/calendar-bands";
import { displayText } from "@/lib/display-text";
import { useState } from "react";
import { createPortal } from "react-dom";

import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { MEALS, MEAL_TIMES, dietAt, dietLabel, holdTitle, mealHolds, type DietOrder, type Meal } from "@/lib/diet";
import { examAt, type ImagingOrder, type PhysioOrder } from "@/lib/exams";
import { abs } from "@/lib/flowsheet";
import type { HistoryEntry, OrderEntry, Patient } from "@/lib/types";

import { DietPanel } from "./panels/DietPanel";
import { calendarDietOrders, type DietScope } from "@/lib/diet-calendar-edit";

const examTime = (e: OrderEntry) => examAt(e.order as ImagingOrder | PhysioOrder, abs(e.day, e.time));

const TONE: Record<string, string> = {
  絶食: "bg-yamabuki-soft text-yamabuki",
  経管栄養: "bg-ai-soft text-ai",
  流動食: "bg-fuji-soft text-fuji",
  嚥下調整食: "bg-fuji-soft text-fuji",
  治療食: "bg-wakatake-soft text-wakatake",
  常食: "bg-paper text-ink",
};

/** One line in the 移動 row: admission, a booked or done move, discharge or leave. */
export interface MoveEvent {
  day: number;
  time: string | null;
  label: string;
  tone: "ai" | "wakatake" | "yamabuki" | "shu" | "ink";
  /** A booked move that can be carried out now. */
  entryId?: string;
  done?: boolean;
}
export type BookWhat = "move" | "dept" | "退院" | "外泊" | "diet";

const EVENT_TONE: Record<MoveEvent["tone"], string> = {
  ai: "bg-ai-soft text-ai",
  wakatake: "bg-wakatake-soft text-wakatake",
  yamabuki: "bg-yamabuki-soft text-yamabuki",
  shu: "bg-shu-soft text-shu",
  ink: "bg-paper text-ink-soft",
};

/**
 * 移動・食事カレンダー: the 移動 row (admission, booked and done moves, discharge and leave) above the
 * meals. Pressing a date books a 転床・転棟, a 転科, a 退院 or a 外泊 for that day (as a draft order).
 *
 * 食事カレンダー: the diet of each meal from admission to a week ahead (朝・昼・夕), the change of
 * diet marked, and the meals held for an exam. Worked out from the diet orders by code; pressing a
 * meal opens the diet panel to change it.
 */
export function DietCalendar({ patient, entries, diets, today, nowTime, onOpenDiet, dietEdit, moves = [], onBook, onDoMove }: { patient: Patient; entries: HistoryEntry[]; diets: DietOrder[]; today: CalendarDate; nowTime: string; onOpenDiet?: () => void; dietEdit?: { denied: string | null; doctor: string; onDraft: (orders: DietOrder[]) => void; onAdjust?: (orders: DietOrder[]) => void }; moves?: MoveEvent[]; onBook?: (day: number, what: BookWhat) => void; onDoMove?: (entryId: string) => void }) {
  const [editing, setEditing] = useState<{ day: number; meal: Meal } | null>(null);
  const [scope, setScope] = useState<DietScope>("from");
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<{ day: number; x: number; y: number } | null>(null);
  const first = Math.max(patient.admittedOn, -6);
  const days: number[] = [];
  for (let d = first; d <= 6; d++) days.push(d);
  const orders = entries.filter((e): e is OrderEntry => e.kind === "order");
  const nowAbs = abs(0, nowTime);
  let prev = "";
  const cells = days.flatMap((day) =>
    MEALS.map((m) => {
      const o = dietAt(diets, patient.id, day, m);
      const label = dietLabel(o);
      const changed = !!prev && label !== prev;
      prev = label;
      const holds = mealHolds(orders, day, m, examTime);
      return { day, m, o, label, changed, holds, held: holds.map((h) => h.label), served: abs(day, MEAL_TIMES[m]) <= nowAbs };
    }),
  );
  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-auto px-4 py-3">
      <table className="nums border-collapse text-[11px]">
        <thead className="sticky top-0 z-10 bg-sheet">
          <tr>
            <th className="w-10" />
            {days.map((d) => (
              <th key={d} className={`min-w-24 px-1 pb-1 text-left font-normal ${d === 0 ? "font-bold text-ai" : "text-ink-faint"}`}>
                <button
                  type="button"
                  disabled={!onBook}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setMenu({ day: d, x: r.left, y: r.bottom + 4 });
                  }}
                  title="この日に転床・転棟・転科・退院・外泊を予約する"
                  className="rounded px-1 hover:bg-ai-soft hover:text-ai"
                >
                  {formatShort(addDays(today, d))}
                  {d === 0 && "（今日）"}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="align-top">
            <th className="pr-1 pt-1 text-left font-normal text-ink-soft">移動</th>
            {days.map((d) => (
              <td key={d} className="p-0.5">
                <div className="min-h-10 space-y-0.5">
                  {moves
                    .filter((m) => m.day === d)
                    .map((m, i) => (
                      <div key={i} className={`rounded px-1.5 py-0.5 ${EVENT_TONE[m.tone]} ${m.done ? "opacity-60" : ""}`}>
                        <span className="nums">{m.time ?? ""}</span> {m.label}
                        {/* 実施 only on or after the booked day. */}
                        {m.entryId && !m.done && onDoMove && m.day <= 0 && (
                          <button type="button" onClick={() => onDoMove(m.entryId!)} className="ml-1 rounded bg-sheet px-1 text-[10px] font-bold text-ink hover:text-ai">
                            実施
                          </button>
                        )}
                        {m.done && <span className="ml-1 text-[10px]">済</span>}
                      </div>
                    ))}
                </div>
              </td>
            ))}
          </tr>
          {MEALS.map((m) => (
            <tr key={m} className="align-top">
              <th className="pr-1 pt-1 text-left font-normal text-ink-soft">{m}</th>
              {calendarBands(cells.filter(x => x.m === m), c => JSON.stringify([c.o?.id, c.label, c.held, c.served])).map(({ first: c, count }) => {
                const d = c.day;
                const tone = c.held.length ? "bg-yamabuki-soft text-yamabuki" : TONE[c.o?.kind ?? ""] ?? "bg-paper text-ink-faint";
                return (
                  <td key={d} colSpan={count} className="p-0.5">
                    <div className={`grid overflow-hidden rounded ${tone}`} style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
                    {Array.from({ length: count }, (_, offset) => <button
                      key={offset}
                      type="button"
                      aria-label={`${formatShort(addDays(today, d + offset))} ${m}：${c.held.length ? holdTitle(c.holds) : c.o?.kind ?? "未指示"}`}
                      disabled={!dietEdit || !!dietEdit.denied || c.served}
                      onClick={() => { setEditing({ day: d + offset, meal: m }); setScope("from"); setError(""); }}
                      title={displayText(`${dietEdit?.denied ?? (c.served ? "配膳済みの食事は変更できません" : "押して変える")}：${formatShort(addDays(today, d + offset))} ${m}：${c.held.length ? `${holdTitle(c.holds)}（${c.held.join("、")}）` : c.label}${c.o ? `　${c.o.by}の指示` : ""}`)}
                      className={`block min-h-10 w-full enabled:hover:bg-ai-soft enabled:hover:text-ai px-1.5 py-1 text-left ${tone} ${c.served ? "opacity-60" : ""} ${c.changed ? "ring-2 ring-inset ring-ai/60" : ""} ${d === 0 ? "outline outline-1 outline-ai/30" : ""}`}
                    >
                      {offset === 0 && c.changed && <span className="mb-0.5 block text-[9px] font-bold text-ai">ここから変更</span>}
                      {offset === 0 ? (c.held.length ? <b>{holdTitle(c.holds)}</b> : c.o?.kind ?? "未指示") : <span aria-hidden="true">─</span>}
                    </button>)}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {editing && dietEdit && !dietEdit.denied && createPortal(
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-ink/20" onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }}>
          <div role="dialog" aria-modal="true" aria-label="食事を変える" className="scroll-thin max-h-[85vh] w-[min(28rem,95vw)] overflow-auto rounded-lg border border-rule bg-sheet p-3 shadow-xl">
            <button type="button" autoFocus onClick={() => setEditing(null)} className="mb-2 rounded border border-rule px-2 py-1">閉じる</button>
            <label className="mb-2 block text-xs">変更する期間 <select value={scope} onChange={(e) => setScope(e.target.value as DietScope)} className="rounded border border-rule bg-sheet p-1">
              <option value="from">この食事から（次の指示まで）</option><option value="day">この日だけ（選んだ食事から夕食まで）</option>
            </select></label>
            {mealHolds(orders, editing.day, editing.meal, examTime).map((h) => <p key={h.orderId} className="text-xs text-yamabuki">食止め継続：{h.label}</p>)}

            {error && <p role="alert" className="text-xs text-shu">{error}</p>}
            <DietPanel compact patient={patient} today={today} nowTime={nowTime} doctor={dietEdit.doctor} diets={diets} entries={orders}
              initial={{ ...(dietAt(diets, patient.id, editing.day, editing.meal) ?? { kind: "常食", staple: "米飯", side: "常菜" }), from: editing }}
              onAdjust={dietEdit.onAdjust ? (d) => { try { dietEdit.onAdjust!(calendarDietOrders(diets, d, scope)); setEditing(null); } catch (e) { setError((e as Error).message); } } : undefined}
              onSave={(d) => { try { dietEdit.onDraft(calendarDietOrders(diets, d, scope)); setEditing(null); } catch (e) { setError((e as Error).message); } }} />
          </div>
        </div>, document.body)}
      {menu &&
        createPortal(
          <div role="menu" style={{ position: "fixed", left: Math.min(menu.x, window.innerWidth - 240), top: menu.y, zIndex: 1000 }} className="w-56 rounded-lg border border-rule bg-sheet p-1 text-[13px] shadow-[0_12px_32px_-8px_rgba(38,34,28,0.4)]">
            <div className="px-2 py-1 text-[11px] text-ink-faint">{formatShort(addDays(today, menu.day))} に</div>
            {(
              [
                ["move", "転床・転棟を予約"],
                ["dept", "転科を予約"],
                ["退院", "退院を予約"],
                ["外泊", "外泊・外出を予約"],
                ["diet", "食事を変える"],
              ] as [BookWhat, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  if (k === "diet") onOpenDiet?.();
                  else onBook?.(menu.day, k);
                }}
                className="block w-full rounded px-2 py-1.5 text-left hover:bg-paper pointer-coarse:py-2.5"
              >
                {label}
              </button>
            ))}
            <button type="button" onClick={() => setMenu(null)} className="block w-full rounded px-2 py-1 text-left text-[11px] text-ink-faint hover:bg-paper">
              やめる
            </button>
          </div>,
          document.body,
        )}

    </div>
  );
}

/* Help migration source (references and dynamic wording):
<p >検査・外泊・退院による食止めは、この変更では解除されません。禁止食品・アレルギーは注意欄に記入できます。患者情報のアレルギーは別に管理します。</p>
<p >日付を押すと、その日の転床・転棟・転科・退院・外泊を予約できます（下書きになり、確定すると「予約」として出ます。当日「実施」で移ります）。食事の指示からコードが出しています。濃い枠は食事が変わる食、薄いのは配膳済み。食事を押すとその場で編集でき、下書きに入れてから「オーダーのみ」か「保存」で確定します。検査で止めるのは院内の取り決め（腹部エコー・造影CT・内視鏡の前の1食）。{LEAVE_HOLD_RULE}。</p>
*/
