"use client";

import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { MEALS, MEAL_TIMES, dietAt, dietLabel, heldBy, type DietOrder } from "@/lib/diet";
import { examAt, type ImagingOrder, type PhysioOrder } from "@/lib/exams";
import { abs } from "@/lib/flowsheet";
import type { HistoryEntry, OrderEntry, Patient } from "@/lib/types";

const examTime = (e: OrderEntry) => examAt(e.order as ImagingOrder | PhysioOrder, abs(e.day, e.time));

const TONE: Record<string, string> = {
  絶食: "bg-yamabuki-soft text-yamabuki",
  経管栄養: "bg-ai-soft text-ai",
  流動食: "bg-fuji-soft text-fuji",
  嚥下調整食: "bg-fuji-soft text-fuji",
  治療食: "bg-wakatake-soft text-wakatake",
  常食: "bg-paper text-ink",
};

/**
 * 食事カレンダー: the diet of each meal from admission to a week ahead (朝・昼・夕), the change of
 * diet marked, and the meals held for an exam. Worked out from the diet orders by code; pressing a
 * meal opens the diet panel to change it.
 */
export function DietCalendar({ patient, entries, diets, today, nowTime, onOpenDiet }: { patient: Patient; entries: HistoryEntry[]; diets: DietOrder[]; today: CalendarDate; nowTime: string; onOpenDiet?: () => void }) {
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
      return { day, m, o, label, changed, held: heldBy(orders, day, m, examTime), served: abs(day, MEAL_TIMES[m]) <= nowAbs };
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
                {formatShort(addDays(today, d))}
                {d === 0 && "（今日）"}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MEALS.map((m) => (
            <tr key={m} className="align-top">
              <th className="pr-1 pt-1 text-left font-normal text-ink-soft">{m}</th>
              {days.map((d) => {
                const c = cells.find((x) => x.day === d && x.m === m)!;
                const tone = c.held.length ? "bg-yamabuki-soft text-yamabuki" : TONE[c.o?.kind ?? ""] ?? "bg-paper text-ink-faint";
                return (
                  <td key={d} className="p-0.5">
                    <button
                      type="button"
                      onClick={onOpenDiet}
                      title={`${formatShort(addDays(today, d))} ${m}：${c.held.length ? `検査で止め（${c.held.join("、")}）` : c.label}${c.o ? `　${c.o.by}の指示` : ""}`}
                      className={`block min-h-12 w-full rounded px-1.5 py-1 text-left ${tone} ${c.served ? "opacity-60" : ""} ${c.changed ? "ring-2 ring-inset ring-ai/60" : ""} ${d === 0 ? "outline outline-1 outline-ai/30" : ""}`}
                    >
                      {c.changed && <span className="mb-0.5 block text-[9px] font-bold text-ai">ここから変更</span>}
                      {c.held.length ? (
                        <>
                          <b>検査で止め</b>
                          <span className="block text-[10px]">{c.held.join("、")}</span>
                        </>
                      ) : (
                        c.label
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-ink-faint">食事の指示からコードが出しています。濃い枠は食事が変わる食、薄いのは配膳済み。押すと右に食事の欄が開きます。検査で止めるのは架空の病院の約束（腹部エコー・造影CT の前の1食）。</p>
    </div>
  );
}
