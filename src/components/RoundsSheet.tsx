"use client";
import { Printer, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { formatShort, type CalendarDate } from "@/lib/dates";
import { abs } from "@/lib/flowsheet";
import { labNumber } from "@/lib/lab-number";
import { paginateRounds, rowHeightMm, ROUNDS_LABS, stampText, type RoundsLab, type RoundsRow } from "@/lib/rounds-sheet";
import { usePrintSheet } from "./DeskParts";

// 回診表: the patients of the list, in its order, one box each on A4 landscape with a blank to write in on the
// right. The preview shows the very pages that print (rounds-sheet.ts reads the record and splits the pages).

export interface RoundsInfo {
  /** The list it was made from (受け持ち患者 …). */
  title: string;
  today: CalendarDate;
  now: string;
  /** Who prints ("医師 山本"): at the foot of every page. */
  by: string;
}

/** The preview over the list, and 印刷 (`onPrinted` goes to the audit log). */
export function RoundsPreview({ rows, info, onPrinted, onClose }: { rows: RoundsRow[]; info: RoundsInfo; onPrinted: () => void; onClose: () => void }) {
  const [print, portal] = usePrintSheet();
  const pages = useMemo(() => paginateRounds(rows, rowHeightMm), [rows]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="回診表" className="fixed inset-0 z-50 flex flex-col bg-ink/40 print:hidden">
      <div className="flex items-center gap-3 border-b border-rule bg-sheet px-5 py-2.5">
        <b className="text-base">回診表</b>
        <span className="nums text-sm text-ink-soft">
          {rows.length}人・{pages.length}枚（A4横）
        </span>
        <button
          type="button"
          onClick={() => {
            onPrinted();
            print(<RoundsPages pages={pages} info={info} />);
          }}
          className="ml-auto flex items-center gap-1.5 rounded-md bg-ai px-3 py-1.5 font-bold text-white"
        >
          <Printer size={15} />
          印刷
        </button>
        <button type="button" onClick={onClose} aria-label="閉じる" className="rounded p-1 text-ink-soft hover:text-ink">
          <X size={18} />
        </button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto p-6">
        <RoundsPages pages={pages} info={info} screen />
      </div>
      {portal}
    </div>,
    document.body,
  );
}

/** The pages: on screen as sheets of paper, on paper one page each (the print margins are the page's). */
export function RoundsPages({ pages, info, screen }: { pages: RoundsRow[][]; info: RoundsInfo; screen?: boolean }) {
  const t = info.today;
  const printed = `印刷 ${t.y}/${t.m}/${t.d} ${info.now}　${info.by}`;
  return (
    <div className={screen ? "flex flex-col items-center gap-6" : ""}>
      {pages.map((rows, i) => (
        <section
          key={i}
          aria-label={`${i + 1}枚目`}
          className={`flex flex-col bg-white text-ink ${screen ? "min-h-[210mm] w-[297mm] shrink-0 p-[10mm] shadow-lg" : `min-h-[186mm] ${i < pages.length - 1 ? "break-after-page" : ""}`}`}
        >
          <header className="flex items-baseline gap-3 border-b-2 border-ink pb-1">
            <b className="text-[13pt]">回診表</b>
            <span className="text-[9pt]">{info.title}</span>
            <span className="text-[9pt]">{formatShort(t)}</span>
            <span className="nums ml-auto text-[9pt]">
              {i + 1}/{pages.length}
            </span>
          </header>
          <table className="nums w-full table-fixed border-collapse text-[8pt] leading-[1.3]">
            <colgroup>
              <col className="w-[38mm]" />
              <col className="w-[48mm]" />
              <col className="w-[42mm]" />
              <col className="w-[30mm]" />
              <col className="w-[66mm]" />
              <col />
              <col className="w-[8mm]" />
            </colgroup>
            <thead>
              <tr className="border-b border-ink text-left text-[7pt] text-ink-soft">
                {["患者", "ToDo", "今日の予定", "点滴・抗菌薬・酸素", "バイタル・検査（前回比）", "メモ", ""].map((h, j) => (
                  <th key={j} className="px-1 py-0.5 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <RoundsBox key={r.id} r={r} today={t} />
              ))}
            </tbody>
          </table>
          <footer className="mt-auto pt-1 text-right text-[7pt] text-ink-soft">{printed}</footer>
        </section>
      ))}
    </div>
  );
}

const cell = "border-l border-ink/30 px-1 py-1 align-top";

function RoundsBox({ r, today }: { r: RoundsRow; today: CalendarDate }) {
  const treat: [string, string][] = [...r.drips.map((d): [string, string] => ["点滴", d]), ...r.antibiotics.map((a): [string, string] => ["抗菌", a]), ...(r.oxygen ? [["酸素", r.oxygen] as [string, string]] : [])];
  return (
    <tr className="break-inside-avoid border-b border-ink/60">
      <td className="h-[27mm] px-1 py-1 align-top">
        <div className="flex items-baseline gap-1.5">
          <b className="text-[11pt]">{r.room}</b>
          <b className="text-[10pt]">{r.name}</b>
        </div>
        <div>
          {r.ageSex}・{r.day}日目
        </div>
        <div className="break-words">{r.diagnosis}</div>
        {(r.panic > 0 || r.unseen > 0 || !!r.waiting) && (
          <div className="mt-0.5 flex flex-wrap gap-1 text-[7pt] font-bold">
            {r.panic > 0 && <span className="rounded-sm border border-shu px-0.5 text-shu">パニック値 {r.panic}</span>}
            {r.unseen > 0 && <span className="rounded-sm border border-ink/60 px-0.5">未確認の結果 {r.unseen}</span>}
            {!!r.waiting && <span className="rounded-sm border border-ink/60 px-0.5">指示受けがまだ {r.waiting}</span>}
          </div>
        )}
      </td>
      <td className={cell}>
        {r.todos.map((t, i) => (
          <div key={i} className="flex gap-1">
            <span className="shrink-0">☐</span>
            <span className="break-words">{t}</span>
          </div>
        ))}
      </td>
      <td className={cell}>
        {r.today.map((t, i) => (
          <div key={i} className="break-words">
            {t}
          </div>
        ))}
      </td>
      <td className={cell}>
        {treat.map(([k, v], i) => (
          <div key={i} className="break-words">
            <span className="mr-1 text-[7pt] text-ink-soft">{k}</span>
            {v}
          </div>
        ))}
      </td>
      <td className={cell}>
        {r.vitals && (
          <div>
            <span className="mr-1 text-[7pt] text-ink-soft">{r.vitals.at}</span>
            {r.vitals.text}
          </div>
        )}
        {r.labs.length > 0 && <Labs labs={r.labs} today={today} />}
      </td>
      <td className={cell}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-[4.6mm] border-b border-dotted border-ink/30" />
        ))}
      </td>
      <td className={`${cell} text-center`}>
        <div aria-label="済" className="mx-auto mt-0.5 h-[4.5mm] w-[4.5mm] border border-ink" />
      </td>
    </tr>
  );
}

/** The fixed labs: the newest value with ↑↓ against the one before, which is shown small underneath. */
function Labs({ labs, today }: { labs: RoundsLab[]; today: CalendarDate }) {
  const newest = labs.reduce((a, b) => (abs(b.at.day, b.at.time) > abs(a.at.day, a.at.time) ? b : a));
  const key = (l: RoundsLab) => `${l.at.day} ${l.at.time}`;
  const byCode = new Map(labs.map((l) => [l.code, l]));
  return (
    <div className="mt-0.5">
      <div className="text-[7pt] text-ink-soft">検査 {stampText(newest.at.day, newest.at.time, today)}</div>
      <table className="w-full border-collapse text-center">
        <thead>
          <tr className="text-[6.5pt] text-ink-soft">
            {ROUNDS_LABS.map((c) => (
              <th key={c} className="font-normal">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="text-[7.5pt] font-bold">
            {ROUNDS_LABS.map((c) => {
              const l = byCode.get(c);
              return (
                <td key={c}>
                  {l ? labNumber(c, l.value) : "—"}
                  {(l?.trend === "↑" || l?.trend === "↓") && <span className="text-[6pt]">{l.trend}</span>}
                </td>
              );
            })}
          </tr>
          <tr className="text-[6.5pt] text-ink-soft">
            {ROUNDS_LABS.map((c) => {
              const l = byCode.get(c);
              return (
                <td key={c}>
                  {l && l.prev !== null ? labNumber(c, l.prev) : ""}
                  {l && key(l) !== key(newest) && <div>{l.at.day === 0 ? l.at.time : stampText(l.at.day, l.at.time, today).split(" ")[0]}</div>}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
