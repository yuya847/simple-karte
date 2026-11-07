"use client";

// The parts of the 指示受け and 実施入力 screens that follow the catalog's form (富士通 HOPE/EGMAIN-GX):
// the band at the top (the date to move through, 「…も表示する」, the kinds to tick, 全チェック・全チェック解除
// and the bulk button), the band of a patient (ID・氏名・年齢・性別・部屋), and one block per order (a check
// on the left, the heading with the kind and the date and time, three 「日時／者」 pairs on the right, and
// 「項目名：値」 lines). Colours and type are this app's own, not the vendor's.

import { displayText } from "@/lib/display-text";
import { useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { SHEET_CATEGORIES, type SheetCategory, type SheetField, type Stamp } from "@/lib/order-sheet";
import { ageText } from "@/lib/person";
import type { Patient } from "@/lib/types";
import { useLongPress } from "@/lib/use-long-press";
import { BlockCheck } from "./ConfirmCheck";
import { DayNav } from "./DayNav";

export interface SheetBandProps<C extends string = SheetCategory> {
  day: number;
  range: { min: number; max: number };
  onDay: (d: number) => void;
  today: CalendarDate;
  /** 「指示受け済みも表示する」／「実施済みも表示する」 with how many it would add. */
  also: { label: string; checked: boolean; count: number; onChange: (v: boolean) => void };
  cats: C[];
  onCats: (c: C[]) => void;
  /** The kinds to tick (the ward's SHEET_CATEGORIES unless the screen has its own, e.g. the radiology's X線・CT・MRI…). */
  categories?: readonly C[];
  /** 全チェック・全チェック解除・the bulk button (一括受け／一括実施). */
  check: { all: () => void; none: () => void; bulk: { label: string; count: number; disabled?: boolean; title?: string; onClick: () => void } };
  children?: ReactNode;
}

/** The band at the top: date, what else to show, the kinds, and the checks. */
export function SheetBand<C extends string = SheetCategory>({ day, range, onDay, today, also, cats, onCats, categories, check, children }: SheetBandProps<C>) {
  const fmtDay = (d: number) => formatShort(addDays(today, d));
  const kinds = (categories ?? SHEET_CATEGORIES) as readonly C[];
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
        {kinds.map((c) => (
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

/** The band of a patient: 患者ID・氏名・年齢・性別・部屋, then whatever the screen adds (受け持ち, buttons). With
 * `onOpen` the name opens the chart. */
export function PatientBand({ patient, room, children, onOpen }: { patient: Pick<Patient, "id" | "name" | "age" | "ageMonths" | "sex">; room: string; children?: ReactNode; onOpen?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule-soft bg-paper px-2 py-1 text-[12px]">
      <span>
        <span className="text-ink-faint">患者ID </span>
        <span className="nums">{patient.id}</span>
      </span>
      <b className="text-[13px]">
        <span className="font-normal text-ink-faint">氏名 </span>
        {onOpen ? (
          <button type="button" onClick={onOpen} title="カルテを開く" className="font-bold hover:text-ai hover:underline">
            {patient.name}
          </button>
        ) : (
          patient.name
        )}
      </b>
      <span>
        <span className="text-ink-faint">年齢 </span>
        {displayText(ageText(patient.age, patient.ageMonths))}
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
  /** The names of the three pairs when the screen's are not 指示開始・実施・指示受け (the radiology's 指示・予定・指示受け). */
  labels?: { start: readonly [string, string]; done: readonly [string, string]; take: readonly [string, string] };
  /** One line per order instead of the catalog's block (指示受け・実施入力). Left out: the block as before. */
  compact?: SheetRow;
}

/** The one-line form of an order and what the mouse does on it. */
export interface SheetRow {
  /** The time at the start of the line (the band's day is not repeated). */
  time: string;
  /** What is ordered, in one line (cut with …; all of it on hover and when opened). */
  gist: string;
  /** 指示者. */
  by?: string;
  /** Ticked: the line is coloured. */
  picked?: boolean;
  /** The 項目名：値 lines and the filled 日時／者 shown under the line. */
  open?: boolean;
  /** A press on the line (not on a button in it); Shift for a range. */
  onPress?: (e: { shiftKey: boolean }) => void;
  onDouble?: () => void;
  /** Right click, a long press, or the ContextMenu key / Shift+F10: where to open the menu. */
  onMenu?: (at: { x: number; y: number }) => void;
  /** Buttons shown while the pointer or the focus is on the line (always when opened). */
  actions?: ReactNode;
}

/** The time of an order on the line: hh:mm on the band's day, else the date too. */
export function rowTime(at: number, day: number, today: CalendarDate, timeKnown = true): string {
  const m = ((at % 1440) + 1440) % 1440;
  const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const d = Math.floor(at / 1440);
  const date = formatShort(addDays(today, d)).replace(/（.）/, "");
  if (!timeKnown) return d === day ? "時刻なし" : date;
  return d === day ? hhmm : `${date} ${hhmm}`;
}

/** Shift+press: the keys from the last pressed one to this one (in the order shown), both included. */
export function pickRange(order: string[], from: string | null, to: string): string[] {
  const a = from === null ? -1 : order.indexOf(from);
  const b = order.indexOf(to);
  if (a < 0 || b < 0) return [to];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}

const WARD_LABELS = { start: ["指示開始日時", "指示者"], done: ["実施日時", "実施者"], take: ["指示受け日時", "指示受け者"] } as const;

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

type Labels = NonNullable<SheetBlockProps["labels"]>;
const filled = (labels: Labels, stamps: SheetBlockProps["stamps"]) =>
  (["start", "done", "take"] as const).filter((k) => stamps[k].at || stamps[k].by).map((k) => ({ k, a: labels[k][0], b: labels[k][1], ...stamps[k] }));

const INSIDE = "button, input, select, textarea, a, label, [role=menu], [role=dialog]";

/** One order in the catalog's form (or, with `compact`, in one line). */
export function SheetBlock(props: SheetBlockProps) {
  const { check, title, tag, when, flags = [], stamps, fields, struck, children, status, labels = WARD_LABELS, compact } = props;
  // A long press opens the menu; the click that follows the finger's release does not tick the line.
  const longDone = useRef(false);
  const long = useLongPress<HTMLDivElement>(
    compact?.onMenu
      ? (at) => {
          longDone.current = true;
          compact.onMenu!(at);
        }
      : undefined,
  );
  if (compact) {
    const c = compact;
    const shown = filled(labels, stamps);
    const tip = [`${title}${tag ? ` ${tag.text}` : ""}　${when}`, ...fields.map((f) => `${f.label}：${f.value}`), ...shown.map((x) => `${x.a}：${x.at}　${x.b}：${x.by}`)].join("\n");
    const inside = (e: { target: EventTarget }) => !!(e.target as Element).closest?.(INSIDE);
    return (
      <div data-sheet-row className={`group border-b border-rule-soft text-[12px] ${struck ? "text-ink-soft" : ""} ${c.picked ? "bg-ai-soft/60" : ""}`}>
        <div
          tabIndex={0}
          title={displayText(tip)}
          aria-expanded={c.open}
          className="flex min-h-9 cursor-default items-center gap-2 px-1 select-none hover:bg-paper/70 focus-visible:outline-2 focus-visible:outline-ai"
          onMouseDown={(e: MouseEvent) => {
            if (e.shiftKey && !inside(e)) e.preventDefault();
          }}
          onClick={(e: MouseEvent) => {
            if (longDone.current) {
              longDone.current = false;
              return;
            }
            if (!inside(e)) c.onPress?.({ shiftKey: e.shiftKey });
          }}
          onDoubleClick={(e: MouseEvent) => {
            if (!inside(e)) c.onDouble?.();
          }}
          onContextMenu={(e: MouseEvent) => {
            if (!c.onMenu) return;
            e.preventDefault();
            e.stopPropagation();
            c.onMenu({ x: e.clientX, y: e.clientY });
          }}
          onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
            if (e.target !== e.currentTarget) return;
            if (c.onMenu && (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))) {
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              c.onMenu({ x: r.left + 40, y: r.bottom });
            } else if (e.key === "Enter") {
              e.preventDefault();
              c.onDouble?.();
            } else if (e.key === " ") {
              e.preventDefault();
              c.onPress?.({ shiftKey: e.shiftKey });
            }
          }}
          {...long}
        >
          <div className="flex w-8 shrink-0 justify-center">{check ? <BlockCheck checked={check.checked} disabled={check.disabled} title={check.title} label={check.label} onChange={check.onChange} /> : <span className="text-ink-faint">—</span>}</div>
          <b className={`nums w-[5.5rem] shrink-0 ${struck ? "line-through" : "text-ai"}`}>{c.time}</b>
          <b className={`shrink-0 text-[13px] ${struck ? "line-through" : "text-ai"}`}>{title}</b>
          {tag && <span className={`shrink-0 rounded px-1 text-[10px] font-bold ${TAG_CLASS[tag.tone]}`}>{displayText(tag.text)}</span>}
          <span className={`min-w-0 flex-1 truncate ${struck ? "line-through" : ""}`}>{displayText(c.gist)}</span>
          {flags.map((f) => (
            <span key={f.text} className={`shrink-0 rounded px-1 text-[10px] font-bold ${f.className}`}>
              {displayText(f.text)}
            </span>
          ))}
          {status && <span className="shrink-0">{status}</span>}
          {c.by && <span className="max-w-32 shrink-0 truncate text-[11px] text-ink-soft">{displayText(c.by)}</span>}
          {c.actions && <span className={`flex shrink-0 items-center gap-1.5 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100 ${c.open ? "opacity-100" : "opacity-0"}`}>{c.actions}</span>}
        </div>
        {c.open && (
          <div className="pb-1.5 pl-[3.25rem] pr-2">
            {shown.length > 0 && (
              <div className="mb-0.5 flex flex-wrap gap-x-4 text-[11px]">
                {shown.map((x) => (
                  <StampLine key={x.k} a={x.a} b={x.b} at={x.at} by={x.by} />
                ))}
              </div>
            )}
            <dl className={`grid grid-cols-[auto_1fr] gap-x-1 gap-y-0 ${struck ? "line-through" : ""}`}>
              {fields.map((f, i) => (
                <div key={`${f.label}-${i}`} className="contents">
                  <dt className="text-ink-soft after:content-['：']">{f.label}</dt>
                  <dd className="nums">{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {children && <div className="pl-9 empty:hidden">{children}</div>}
      </div>
    );
  }
  return (
    <div className={`flex gap-2 border-b border-rule-soft px-1 py-1.5 text-[12px] ${struck ? "text-ink-soft" : ""}`}>
      <div className="flex w-8 shrink-0 justify-center">
        {check ? <BlockCheck checked={check.checked} disabled={check.disabled} title={check.title} label={check.label} onChange={check.onChange} /> : <span className="pt-0.5 text-ink-faint">—</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <b className={`text-[13px] ${struck ? "line-through" : "text-ai"}`}>{title}</b>
            {tag && <span className={`rounded px-1 text-[10px] font-bold ${TAG_CLASS[tag.tone]}`}>{displayText(tag.text)}</span>}
            <b className={`nums ${struck ? "line-through" : "text-ai"}`}>{when}</b>
            {flags.map((f) => (
              <span key={f.text} className={`rounded px-1 text-[10px] font-bold ${f.className}`}>
                {displayText(f.text)}
              </span>
            ))}
            {status}
          </div>
          <div className="ml-auto flex flex-col gap-px text-[11px]">
            <StampLine a={labels.start[0]} b={labels.start[1]} at={stamps.start.at} by={stamps.start.by} />
            <StampLine a={labels.done[0]} b={labels.done[1]} at={stamps.done.at} by={stamps.done.by} />
            <StampLine a={labels.take[0]} b={labels.take[1]} at={stamps.take.at} by={stamps.take.by} />
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

/** The notes under both screens: how the form follows the catalog, what is this hospital's own, and the sources. Shown with 「使い方」. */
export function SheetNotes(props: { children?: ReactNode }) {
  void props;
  return (
    null
  );
}

/* Help migration source (references and dynamic wording):
<div >
      {children}
      <p>画面の形（上の日付の移動と種類のチェック、患者の帯、指示ごとの見出しと右の「指示開始・実施・指示受け」の日時と者、「項目名：値」の本文）は、富士通 HOPE/EGMAIN-GX のカタログの「指示受け」「実施入力」の画面に合わせています。オーダからコードで並べています（AI は使っていません）。</p>
      <Sources items={SHEET_SOURCES} />
    </div>
*/
