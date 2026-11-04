"use client";

// The parts of the 指示受け and 実施入力 screens that follow the catalog's form (富士通 HOPE/EGMAIN-GX):
// the band at the top (the date to move through, 「…も表示する」, the kinds to tick, 全チェック・全チェック解除
// and the bulk button), the band of a patient (ID・氏名・年齢・性別・部屋), and one block per order (a check
// on the left, the heading with the kind and the date and time, three 「日時／者」 pairs on the right, and
// 「項目名：値」 lines). Colours and type are this app's own, not the vendor's.

import type { ReactNode } from "react";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { SHEET_CATEGORIES, SHEET_SOURCES, type SheetCategory, type SheetField, type Stamp } from "@/lib/order-sheet";
import { ageText } from "@/lib/person";
import type { Patient } from "@/lib/types";
import { DayNav } from "./DayNav";
import { Sources } from "./DeskParts";

export interface SheetBandProps {
  day: number;
  range: { min: number; max: number };
  onDay: (d: number) => void;
  today: CalendarDate;
  /** 「指示受け済みも表示する」／「実施済みも表示する」 with how many it would add. */
  also: { label: string; checked: boolean; count: number; onChange: (v: boolean) => void };
  cats: SheetCategory[];
  onCats: (c: SheetCategory[]) => void;
  /** 全チェック・全チェック解除・the bulk button (一括受け／一括実施). */
  check: { all: () => void; none: () => void; bulk: { label: string; count: number; disabled?: boolean; title?: string; onClick: () => void } };
  children?: ReactNode;
}

/** The band at the top: date, what else to show, the kinds, and the checks. */
export function SheetBand({ day, range, onDay, today, also, cats, onCats, check, children }: SheetBandProps) {
  const fmtDay = (d: number) => formatShort(addDays(today, d));
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-sheet px-5 py-2 text-sm">
      <DayNav day={day} min={range.min} max={range.max} onChange={onDay} fmtDay={fmtDay} />
      <label className="flex cursor-pointer items-center gap-1 text-xs">
        <input type="checkbox" className="accent-ai" checked={also.checked} onChange={(e) => also.onChange(e.target.checked)} />
        {also.label}
        <span className="nums text-ink-faint">（{also.count}件）</span>
      </label>
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">出す種類</legend>
        {SHEET_CATEGORIES.map((c) => (
          <label key={c} className="flex cursor-pointer items-center gap-1 text-xs">
            <input type="checkbox" className="accent-ai" checked={cats.includes(c)} onChange={() => onCats(cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c])} />
            {c}
          </label>
        ))}
      </fieldset>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={check.all} className="rounded border border-rule px-2 py-0.5 text-xs text-ink-soft hover:border-ai hover:text-ai">
          全チェック
        </button>
        <button type="button" onClick={check.none} className="rounded border border-rule px-2 py-0.5 text-xs text-ink-soft hover:border-ai hover:text-ai">
          全チェック解除
        </button>
        <button type="button" disabled={check.bulk.disabled || check.bulk.count === 0} onClick={check.bulk.onClick} title={check.bulk.title} className="rounded border border-yamabuki px-2 py-0.5 text-xs font-bold text-yamabuki hover:bg-yamabuki hover:text-white disabled:opacity-40">
          {check.bulk.label}（{check.bulk.count}件）
        </button>
      </div>
      {children}
    </div>
  );
}

/** The band of a patient: 患者ID・氏名・年齢・性別・部屋, then whatever the screen adds (受け持ち, buttons). */
export function PatientBand({ patient, room, children }: { patient: Pick<Patient, "id" | "name" | "age" | "ageMonths" | "sex">; room: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule-soft bg-paper px-2 py-1 text-[12px]">
      <span>
        <span className="text-ink-faint">患者ID </span>
        <span className="nums">{patient.id}</span>
      </span>
      <b className="text-[13px]">
        <span className="font-normal text-ink-faint">氏名 </span>
        {patient.name}
      </b>
      <span>
        <span className="text-ink-faint">年齢 </span>
        {ageText(patient.age, patient.ageMonths)}
      </span>
      <span>
        <span className="text-ink-faint">性別 </span>
        {patient.sex}
      </span>
      <span>
        <span className="text-ink-faint">部屋 </span>
        {room}
      </span>
      {children}
    </div>
  );
}

export interface SheetBlockProps {
  /** The ○ on the left: null when the block cannot be ticked (shown as a blank). */
  check: { checked: boolean; disabled?: boolean; title?: string; label: string; onChange: (v: boolean) => void } | null;
  /** "入院注射", and a tag after it (新規・中止・【変】 or the item's kind). */
  title: string;
  tag?: { text: string; tone: "ai" | "shu" | "yamabuki" | "wakatake" | "ink" };
  /** The order's date and time (blue and bold, like the catalog). */
  when: string;
  flags?: { text: string; className: string }[];
  stamps: { start: Stamp; done: Stamp; take: Stamp };
  fields: SheetField[];
  /** Struck through (a stop). */
  struck?: boolean;
  /** Under the fields: before/after of a change, related orders, the buttons and the panels they open. */
  children?: ReactNode;
  /** Beside the title, to the right of the stamps (status words). */
  status?: ReactNode;
}

const TAG_CLASS = { ai: "bg-ai-soft text-ai", shu: "bg-shu text-white", yamabuki: "bg-yamabuki-soft text-yamabuki", wakatake: "bg-wakatake-soft text-wakatake", ink: "bg-tab text-ink" } as const;

const StampLine = ({ a, b, at, by }: { a: string; b: string; at: string; by: string }) => (
  <span className="flex gap-2 whitespace-nowrap">
    <span>
      <span className="text-ink-faint">{a}：</span>
      <span className="nums">{at || "　"}</span>
    </span>
    <span>
      <span className="text-ink-faint">{b}：</span>
      {by || "　"}
    </span>
  </span>
);

/** One order in the catalog's form. */
export function SheetBlock({ check, title, tag, when, flags = [], stamps, fields, struck, children, status }: SheetBlockProps) {
  return (
    <div className={`flex gap-2 border-b border-rule-soft px-1 py-1.5 text-[12px] ${struck ? "text-ink-soft" : ""}`}>
      <div className="w-7 shrink-0 pt-0.5 text-center">
        {check ? (
          <input type="checkbox" aria-label={check.label} title={check.title} className="h-4 w-4 accent-ai disabled:opacity-30" checked={check.checked} disabled={check.disabled} onChange={(e) => check.onChange(e.target.checked)} />
        ) : (
          <span className="text-ink-faint">—</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <b className={`text-[13px] ${struck ? "line-through" : "text-ai"}`}>{title}</b>
            {tag && <span className={`rounded px-1 text-[10px] font-bold ${TAG_CLASS[tag.tone]}`}>{tag.text}</span>}
            <b className={`nums ${struck ? "line-through" : "text-ai"}`}>{when}</b>
            {flags.map((f) => (
              <span key={f.text} className={`rounded px-1 text-[10px] font-bold ${f.className}`}>
                {f.text}
              </span>
            ))}
            {status}
          </div>
          <div className="ml-auto flex flex-col gap-px text-[11px]">
            <StampLine a="指示開始日時" b="指示者" at={stamps.start.at} by={stamps.start.by} />
            <StampLine a="実施日時" b="実施者" at={stamps.done.at} by={stamps.done.by} />
            <StampLine a="指示受け日時" b="指示受け者" at={stamps.take.at} by={stamps.take.by} />
          </div>
        </div>
        <dl className={`mt-0.5 grid grid-cols-[auto_1fr] gap-x-1 gap-y-0 pl-3 ${struck ? "line-through" : ""}`}>
          {fields.map((f, i) => (
            <div key={`${f.label}-${i}`} className="contents">
              <dt className="text-ink-soft after:content-['：']">{f.label}</dt>
              <dd className="nums">{f.value}</dd>
            </div>
          ))}
        </dl>
        {children}
      </div>
    </div>
  );
}

/** The notes under both screens: how the form follows the catalog, what is this hospital's own, and the sources. */
export function SheetNotes({ children }: { children?: ReactNode }) {
  return (
    <div className="space-y-1 text-[11px] text-ink-faint">
      {children}
      <p>画面の形（上の日付の移動と種類のチェック、患者の帯、指示ごとの見出しと右の「指示開始・実施・指示受け」の日時と者、「項目名：値」の本文）は、富士通 HOPE/EGMAIN-GX のカタログの「指示受け」「実施入力」の画面に合わせています。種類の分け方（処置・検査／注射・輸血／処方／看護指示／食事／その他）と日付の範囲（昨日〜明日）は架空の病院の取り決めです。オーダからコードで並べています（AI は使っていません）。</p>
      <Sources items={SHEET_SOURCES} />
    </div>
  );
}
