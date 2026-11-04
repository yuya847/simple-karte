"use client";

import { Printer, Utensils } from "lucide-react";
import { useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { LEAVE_HOLD_RULE, MEAL_DEADLINE, holdTitle, type DietOrder } from "@/lib/diet";
import { examAt, type ImagingOrder, type PhysioOrder } from "@/lib/exams";
import { abs } from "@/lib/flowsheet";
import type { OrderEntry } from "@/lib/types";
import { deadlineText, wardMeals, type MealCell, type MealPerson } from "@/lib/ward-meals";

const examTime = (e: OrderEntry) => examAt(e.order as ImagingOrder | PhysioOrder, abs(e.day, e.time));
const DAYS = [0, 1];
const DAY_LABEL = ["今日", "明日"];

interface Props {
  title: string;
  people: MealPerson[];
  diets: DietOrder[];
  today: CalendarDate;
  nowTime: string;
}

/**
 * 病棟の食事 (for the 管理栄養士, readable by nurses): every patient × 朝・昼・夕 of today and tomorrow,
 * the 食数 per 食種 and the kitchen's deadline of each meal, all worked out by code from the orders.
 * Changes made after the deadline are flagged. It only shows; the diet is ordered by the doctor.
 */
export function MealsView({ title, people, diets, today, nowTime }: Props) {
  const [printing, setPrinting] = useState(false);
  const nowAbs = abs(0, nowTime);
  const { rows, slots } = wardMeals(people, diets, DAYS, nowAbs, examTime);
  const types = [...new Set(slots.flatMap((s) => s.byType.map((b) => b.type)))].sort(
    (a, b) => slots.reduce((n, s) => n + (s.byType.find((x) => x.type === b)?.count ?? 0), 0) - slots.reduce((n, s) => n + (s.byType.find((x) => x.type === a)?.count ?? 0), 0) || a.localeCompare(b, "ja"),
  );
  const late = rows.flatMap((r) => r.cells.filter((c) => c.late.length > 0 && !c.past).map((c) => ({ r, c })));
  const day = (d: number) => `${DAY_LABEL[d]} ${formatShort(addDays(today, d))}`;
  const slotHead = (
    <>
      <tr className="text-[11px] text-ink-soft">
        <th className="sticky left-0 bg-sheet" />
        {DAYS.map((d) => (
          <th key={d} colSpan={3} className={`border-l border-rule px-1 pt-1 text-left font-bold ${d === 0 ? "text-ai" : ""}`}>
            {day(d)}
          </th>
        ))}
      </tr>
      <tr className="text-[11px]">
        <th className="sticky left-0 bg-sheet" />
        {slots.map((s) => {
          const soon = !s.deadlinePassed && abs(s.deadline.day, s.deadline.time) - nowAbs <= 120;
          return (
            <th key={`${s.day}${s.meal}`} className={`min-w-28 px-1 pb-1 text-left font-normal ${s.meal === "朝" ? "border-l border-rule" : ""}`}>
              <span className="block font-bold text-ink">{s.meal}</span>
              <span className={`nums block text-[10px] ${s.deadlinePassed ? "text-ink-faint" : soon ? "font-bold text-yamabuki" : "text-ink-soft"}`}>{deadlineText(s, nowAbs)}</span>
            </th>
          );
        })}
      </tr>
    </>
  );
  // The counts and the patients' meals: shown here and printed as the 食数表 for the kitchen.
  const tables = (
    <>
        <section aria-label="食数">
          <h2 className="mb-1 text-xs font-bold text-ink-soft">食数（食種ごと。コードで数えています）</h2>
          <div className="scroll-thin overflow-x-auto rounded-lg border border-rule bg-sheet">
            <table className="nums w-full border-collapse text-[12px]">
              <thead>{slotHead}</thead>
              <tbody>
                {types.map((type) => (
                  <tr key={type} className="border-t border-rule-soft align-top">
                    <th className="sticky left-0 bg-sheet px-2 py-1 text-left font-normal">{type}</th>
                    {slots.map((s) => {
                      const b = s.byType.find((x) => x.type === type);
                      return (
                        <td key={`${s.day}${s.meal}`} className={`px-1 py-1 ${s.meal === "朝" ? "border-l border-rule" : ""}`}>
                          {b ? (
                            <>
                              <b className="text-sm">{b.count}</b>
                              {b.forms.some((f) => f.form) && <span className="block text-[10px] text-ink-soft">{b.forms.map((f) => `${f.form || "—"} ${f.count}`).join("、")}</span>}
                            </>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {(
                  [
                    ["食数（合計）", (s) => s.total, "font-bold"],
                    ["絶食", (s) => s.npo, "text-yamabuki"],
                    ["食止め（検査・外泊・外出・退院）", (s) => s.held, "text-yamabuki"],
                    ["指示なし", (s) => s.none, "text-shu"],
                    ["締切後の変更", (s) => s.late, "text-shu"],
                  ] as [string, (s: (typeof slots)[number]) => number, string][]
                ).map(([label, n, tone]) => (
                  <tr key={label} className="border-t border-rule">
                    <th className="sticky left-0 bg-sheet px-2 py-1 text-left font-normal text-ink-soft">{label}</th>
                    {slots.map((s) => (
                      <td key={`${s.day}${s.meal}`} className={`px-1 py-1 ${s.meal === "朝" ? "border-l border-rule" : ""} ${n(s) ? tone : "text-ink-faint"}`}>
                        {n(s)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-label="患者ごとの食事">
          <h2 className="mb-1 text-xs font-bold text-ink-soft">患者ごと（{rows.length}人）</h2>
          <div className="scroll-thin overflow-x-auto rounded-lg border border-rule bg-sheet">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="text-[11px] text-ink-soft">
                  <th className="sticky left-0 bg-sheet" />
                  <th colSpan={2} />
                  {DAYS.map((d) => (
                    <th key={d} colSpan={3} className={`border-l border-rule px-1 pt-1 text-left font-bold ${d === 0 ? "text-ai" : ""}`}>
                      {day(d)}
                    </th>
                  ))}
                </tr>
                <tr className="text-left text-[11px] text-ink-soft">
                  <th className="sticky left-0 bg-sheet px-2 pb-1 font-normal">患者</th>
                  <th className="px-1 pb-1 font-normal">アレルギー（カルテ）</th>
                  <th className="px-1 pb-1 font-normal">禁止・注意</th>
                  {slots.map((s) => (
                    <th key={`${s.day}${s.meal}`} className={`min-w-28 px-1 pb-1 font-bold text-ink ${s.meal === "朝" ? "border-l border-rule" : ""}`}>
                      {s.meal}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.patientId} className="border-t border-rule-soft align-top">
                    <th className="sticky left-0 bg-sheet px-2 py-1 text-left font-normal">
                      <span className="nums text-ink-faint">{r.room}</span> <b>{r.name}</b>
                    </th>
                    <td className="max-w-40 px-1 py-1">{r.allergies.length ? <span className="font-bold text-shu">{r.allergies.join("、")}</span> : <span className="text-ink-faint">なし</span>}</td>
                    <td className="max-w-48 px-1 py-1">{r.notes.length ? r.notes.join("、") : <span className="text-ink-faint">—</span>}</td>
                    {r.cells.map((c) => (
                      <td key={`${c.day}${c.meal}`} className={`p-0.5 ${c.meal === "朝" ? "border-l border-rule" : ""}`}>
                        <Cell c={c} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
    </>
  );
  const print = () => {
    flushSync(() => setPrinting(true));
    const done = () => {
      setPrinting(false);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };
  return (
    <section aria-label="病棟の食事" className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-paper">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="flex items-center gap-1.5 text-lg font-bold">
          <Utensils size={18} />
          病棟の食事
          <span className="ml-1 rounded border border-dashed border-ink-faint px-1.5 py-0.5 align-middle text-[10px] font-normal text-ink-soft">架空</span>
        </h1>
        <button type="button" onClick={print} className="flex items-center gap-1 rounded-md border border-rule px-2.5 py-1 text-sm hover:border-ai hover:text-ai">
          <Printer size={14} />
          食数表を印刷
        </button>
        <span className="nums text-sm text-ink-soft">
          {title}　{nowTime} 時点（食事の指示と、食事を止めるオーダ（検査・外泊・外出・退院）からコードで出しています）
        </span>
      </header>

      <div className="space-y-4 px-5 py-4 text-[13px]">
        {late.length > 0 && (
          <section className="rounded-lg border border-shu bg-shu-soft p-3" aria-label="締切後の変更">
            <h2 className="mb-1 font-bold text-shu">締切を過ぎてからの変更 {late.length}件</h2>
            <ul className="space-y-0.5">
              {late.map(({ r, c }) => (
                <li key={`${r.patientId}${c.day}${c.meal}`}>
                  <span className="nums text-ink-soft">{r.room}</span> <b>{r.name}</b>　{day(c.day)}の{c.meal}食：{c.holds.length ? holdTitle(c.holds) : c.type}
                  <span className="text-ink-soft">　{c.late.join("／")}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-ink-soft">献立と盛り付けに間に合うかは、厨房と確かめてください<span className="hint">（締切は架空の病院の取り決め）</span>。</p>
          </section>
        )}

        {tables}

        <ul className="hint space-y-0.5 text-[11px] text-ink-faint">
          <li>締切は、朝食が前日 {MEAL_DEADLINE.朝.time}、昼食が当日 {MEAL_DEADLINE.昼.time}、夕食が当日 {MEAL_DEADLINE.夕.time}（架空の病院の取り決め）。締切のあとに入った食事の指示・食止め・食止めの取り消しに印を付けます。</li>
          <li>検査で止めるのは、架空の病院の約束（腹部エコー・造影CT・内視鏡の前の1食）。{LEAVE_HOLD_RULE}。</li>
          <li>アレルギーはカルテの記載のまま（薬のアレルギーを含む）。禁止・注意は食事の指示の注意の欄と、カルテの注意のうち食事・水分に関わるもの。</li>
          <li>食事を決めるのは医師です（カルテの右の「食事」）。この画面は見るだけで、AI は使いません。</li>
        </ul>
      </div>
      {printing &&
        createPortal(
          <div className="print-sheet hidden bg-white p-[5mm] text-[10pt] text-ink print:block">
            <h1 className="mb-2 text-base font-bold">
              食数表　{title}　{nowTime} 時点（架空の病院）
            </h1>
            {tables}
          </div>,
          document.body,
        )}
    </section>
  );
}

const TONE: Record<string, string> = {
  絶食: "bg-yamabuki-soft text-yamabuki",
  経管栄養: "bg-ai-soft text-ai",
  流動食: "bg-fuji-soft text-fuji",
  嚥下調整食: "bg-fuji-soft text-fuji",
  治療食: "bg-wakatake-soft text-wakatake",
  常食: "bg-paper text-ink",
};

function Cell({ c }: { c: MealCell }) {
  const tone = c.holds.length ? "bg-yamabuki-soft text-yamabuki" : c.order ? TONE[c.order.kind] : "bg-shu-soft text-shu";
  return (
    <div
      title={[c.order ? `${c.order.by}の指示（${c.order.at.day === 0 ? "今日" : `${c.order.at.day}日`} ${c.order.at.time}）` : "食事の指示がありません", ...c.holds.map((h) => h.label), ...c.late].join("\n")}
      className={`min-h-10 rounded px-1.5 py-1 leading-tight ${tone} ${c.past ? "opacity-60" : ""} ${c.changed ? "ring-2 ring-inset ring-ai/60" : ""} ${c.late.length ? "outline outline-2 outline-shu" : ""}`}
    >
      {c.changed && <span className="mb-0.5 block text-[9px] font-bold text-ai">ここから変更</span>}
      {c.late.length > 0 && <span className="mb-0.5 block text-[9px] font-bold text-shu">締切後</span>}
      {c.holds.length ? (
        <>
          <b>{holdTitle(c.holds)}</b>
          <span className="block text-[10px]">{c.holds.map((h) => h.label).join("、")}</span>
          <span className="block text-[10px] text-ink-faint line-through">{c.type}</span>
        </>
      ) : c.order?.kind === "絶食" ? (
        <>
          <b>絶食</b>
          {c.order.npoReason && <span className="block text-[10px]">{c.order.npoReason}</span>}
        </>
      ) : (
        <>
          <span className={c.order ? "" : "font-bold"}>{c.type}</span>
          {c.form && <span className="block text-[10px] text-ink-soft">{c.form}</span>}
        </>
      )}
    </div>
  );
}
