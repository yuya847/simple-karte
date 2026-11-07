"use client";

// レポート一覧: the patient's reports newest first (kind, 検査日, 部位, 報告医, unread or not, the first line of
// the text), each opening in full under its row; and the ward's list, by patient, for the nurse and the doctor
// to see which of their patients have reports not yet confirmed. Nothing here is summarised by AI: the one
// line is the first line of the report, cut out as it is.

import { displayText } from "@/lib/display-text";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import type { CalendarDate } from "@/lib/dates";
import type { OpenAt } from "@/lib/open-at";
import { readStateOf, summaryOf, unreadReports, type Report, type WardReportRow } from "@/lib/reports";
import type { Ack } from "@/lib/results";
import { dayText, KindChip, ReportPanel, StageChip } from "./panels/ReportPanel";
import { usePressMenu } from "./PressMenu";
import { useDeny } from "./RoleContext";

// The report to open when the chart's レポート一覧 opens next (a row of the ward's list double-clicked, or its menu's 「カルテで開く」).
let openNext: string | null = null;

interface RowsProps {
  reports: Report[];
  acks: Record<string, Ack>;
  today: CalendarDate;
  onSeen?: (keys: string[]) => void;
  onOpenImage?: (studyId: string) => void;
  /** Open this report's row at first (e.g. the one pressed elsewhere). */
  openKey?: string | null;
  /** The ward's list: a row's double-click (and its menu) opens the report in the patient's chart. */
  onOpenChart?: (key: string) => void;
}

/** The rows of reports; a press opens the report in full under the row; the right-click (a long press) offers 確認した・カルテで開く・画像を開く. */
export function ReportRows({ reports, acks, today, onSeen, onOpenImage, openKey = null, onOpenChart }: RowsProps) {
  const [open, setOpen] = useState<string | null>(openKey);
  const { bind, menu } = usePressMenu();
  const denied = useDeny()("result.ack");
  if (reports.length === 0) return <p className="py-2 text-[12px] text-ink-faint">レポートはありません。</p>;
  const actions = (r: Report) => {
    const state = readStateOf(r, acks).state;
    return [
      { label: "確認した", onClick: () => onSeen?.([r.key]), disabled: denied ?? (state === "確認済み" ? "確認済みです" : state === "前の記録" ? "前の記録です" : onSeen ? null : "ここでは確認しません") },
      ...(onOpenChart ? [{ label: "カルテで開く", onClick: () => onOpenChart(r.key) }] : []),
      { label: "画像を開く", onClick: () => r.imageOf && onOpenImage?.(r.imageOf), disabled: !r.imageOf ? "画像のないレポートです" : onOpenImage ? null : "カルテから開きます" },
    ];
  };
  return (
    <ul className="divide-y divide-rule-soft">
      {reports.map((r) => {
        const s = readStateOf(r, acks);
        const unread = s.state === "未読";
        const isOpen = open === r.key;
        const when = r.examAt ?? r.at;
        return (
          <li key={r.key} data-unread={unread || undefined} className={unread ? "bg-shu-soft/30" : ""}>
            <button
              type="button"
              aria-expanded={isOpen}
              {...bind(`${r.kind} ${r.title}`, () => actions(r))}
              onClick={() => setOpen(isOpen ? null : r.key)}
              onDoubleClick={onOpenChart ? () => onOpenChart(r.key) : undefined}
              className="flex w-full items-start gap-2 px-2 py-1.5 text-left text-[12px] hover:bg-sheet pointer-coarse:py-2.5"
            >
              {isOpen ? <ChevronDown size={14} className="mt-0.5 shrink-0 text-ink-faint" /> : <ChevronRight size={14} className="mt-0.5 shrink-0 text-ink-faint" />}
              <span className="relative mt-0.5 shrink-0 text-ink-soft">
                <FileText size={14} />
                {unread && <span aria-hidden className="absolute -right-1 -top-1 h-2 w-2 rounded-full border border-paper bg-shu" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <KindChip kind={r.kind} />
                  <span className="nums text-ink-soft">
                    {displayText(dayText(today, when.day))} {when.time}
                  </span>
                  <b className={unread ? "text-ink" : "text-ink-soft"}>{r.title}</b>
                  {r.region && !r.title.includes(r.region) && <span className="text-ink-soft">{r.region}</span>}
                  <span className="text-ink-faint">{displayText(r.by)}</span>
                  <StageChip stage={r.stage} />
                  {r.version > 1 && <span className="rounded bg-yamabuki px-1 text-[11px] font-bold text-white">訂正</span>}
                  {r.important && <span className="rounded bg-shu px-1 text-[11px] font-bold text-white">重要な所見</span>}
                  <span className={`ml-auto nums text-[11px] ${unread ? "font-bold text-shu" : s.state === "確認済み" ? "text-wakatake" : "text-ink-faint"}`}>{displayText(s.state === "確認済み" ? `確認 ${s.ack.at.time} ${s.ack.by}` : s.state)}</span>
                </span>
                <span className="block truncate text-ink-soft">{summaryOf(r)}</span>
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-rule-soft bg-paper px-3 py-2 pl-9">
                <ReportPanel report={r} acks={acks} today={today} onSeen={onSeen} onOpenImage={onOpenImage} bare />
              </div>
            )}
          </li>
        );
      })}
      {menu}
    </ul>
  );
}

/** The sources the headings and the 確認 follow, and what this fictional hospital decided. Shown with 「使い方」. */
export function ReportNotes() {
  return (
    null
  );
}

interface ListProps {
  reports: Report[];
  acks: Record<string, Ack>;
  today: CalendarDate;
  onSeen?: (keys: string[]) => void;
  onOpenImage?: (studyId: string) => void;
}

/** In the chart: every report of the patient, with 「未読だけ」 (the one asked for from the ward's list opens at first). */
export function ReportList({ reports, acks, today, onSeen, onOpenImage }: ListProps) {
  const unread = unreadReports(reports, acks);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [first] = useState(() => (reports.some((r) => r.key === openNext) ? openNext : null));
  useEffect(() => {
    openNext = null;
  }, []);
  const shown = onlyUnread ? unread : reports;
  return (
    <div className="space-y-2 text-[12px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <b>
          レポート {reports.length}件
          {unread.length > 0 && <span className="ml-1 text-shu">（未読 {unread.length}件）</span>}
        </b>
        <label className="flex cursor-pointer items-center gap-1 text-ink-soft">
          <input type="checkbox" checked={onlyUnread} onChange={() => setOnlyUnread((v) => !v)} className="accent-ai" />
          未読だけ
        </label>
        {onSeen && unread.length > 1 && (
          <button type="button" onClick={() => onSeen(unread.map((r) => r.key))} className="ml-auto rounded border border-ai px-2 py-0.5 text-[11px] text-ai hover:bg-ai-soft">
            未読をすべて確認した
          </button>
        )}
      </div>

      <div className="rounded-md border border-rule bg-sheet">
        <ReportRows reports={shown} acks={acks} today={today} onSeen={onSeen} onOpenImage={onOpenImage} openKey={first} />
      </div>
      <ReportNotes />
    </div>
  );
}

interface WardProps {
  rows: WardReportRow[];
  /** Whether a patient is this person's (受け持ち). */
  mine: (patientId: string) => boolean;
  acks: Record<string, Ack>;
  today: CalendarDate;
  onSeen?: (patientId: string, keys: string[]) => void;
  /** The chart (the patient's name), or the chart with its レポート一覧 (a report's double-click or menu). */
  onOpen: (patientId: string, where?: OpenAt) => void;
  /** The report's images (PACS) in the patient's chart. */
  onOpenImage?: (patientId: string, studyId: string) => void;
}

/** 病棟の画面「レポート」: by patient, those with unread reports first; 受け持ちだけ and 未読だけ to narrow. */
export function WardReportList({ rows, mine, acks, today, onSeen, onOpen, onOpenImage }: WardProps) {
  const [onlyMine, setOnlyMine] = useState(true);
  const [onlyUnread, setOnlyUnread] = useState(true);
  const shown = rows
    .filter((r) => !onlyMine || mine(r.patientId))
    .map((r) => ({ ...r, reports: onlyUnread ? unreadReports(r.reports, acks) : r.reports }))
    .filter((r) => r.reports.length > 0);
  const unreadAll = rows.filter((r) => !onlyMine || mine(r.patientId)).reduce((n, r) => n + r.unread, 0);
  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-paper">
      <div className="mx-auto max-w-5xl space-y-3 px-6 py-4 text-sm">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h1 className="text-lg font-bold">レポート</h1>
          <span className="text-[12px] text-ink-soft">
            {onlyMine ? "受け持ちの患者" : "病棟の患者"}：未読 <b className={unreadAll ? "text-shu" : ""}>{unreadAll}</b>件
          </span>
          <label className="flex cursor-pointer items-center gap-1 text-[12px] text-ink-soft">
            <input type="checkbox" checked={onlyMine} onChange={() => setOnlyMine((v) => !v)} className="accent-ai" />
            受け持ちだけ
          </label>
          <label className="flex cursor-pointer items-center gap-1 text-[12px] text-ink-soft">
            <input type="checkbox" checked={onlyUnread} onChange={() => setOnlyUnread((v) => !v)} className="accent-ai" />
            未読だけ
          </label>
        </header>

        {shown.length === 0 && <p className="rounded-md border border-rule bg-sheet px-3 py-4 text-center text-[12px] text-ink-faint">{onlyUnread ? "未読のレポートはありません。" : "レポートはありません。"}</p>}
        {shown.map((r) => (
          <section key={r.patientId} className="rounded-md border border-rule bg-sheet">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule-soft px-3 py-1.5">
              <button type="button" onClick={() => onOpen(r.patientId)} className="flex items-baseline gap-3 rounded text-left hover:text-ai hover:underline">
                <span className="nums text-ink-soft">{r.room}</span>
                <b>{r.name}</b>
              </button>
              {mine(r.patientId) && <span className="rounded border border-ai/50 px-1 text-[11px] text-ai">受け持ち</span>}
              {r.unread > 0 ? <span className="nums rounded-full bg-shu px-1.5 text-[11px] font-bold text-white">未読 {r.unread}</span> : <span className="text-[11px] text-ink-faint">未読なし</span>}
            </div>
            <ReportRows
              reports={r.reports}
              acks={acks}
              today={today}
              onSeen={onSeen ? (keys) => onSeen(r.patientId, keys) : undefined}
              onOpenImage={onOpenImage && ((id) => onOpenImage(r.patientId, id))}
              onOpenChart={(key) => {
                openNext = key;
                onOpen(r.patientId, "report-list");
              }}
            />
          </section>
        ))}
        <ReportNotes />
      </div>
    </div>
  );
}

/* Help migration source (references and dynamic wording):
<div >
      <p>
        出典：
        <a href={REPORT_SOURCES.items.url} target="_blank" rel="noreferrer" >
          {REPORT_SOURCES.items.label}
        </a>
      </p>
      <p>
        出典：
        <a href={REPORT_SOURCES.check.url} target="_blank" rel="noreferrer" >
          {REPORT_SOURCES.check.label}
        </a>
      </p>
      <p>{REPORT_RULES.headings}</p>
      <p>{REPORT_RULES.unread}</p>
      <p>{REPORT_RULES.summary}</p>
    </div>
<p >読影・病理・内視鏡・生理検査のレポートを新しい順に。行を押すと本文が開き、「確認した」で誰がいつ読んだかが残ります。「画像を開く」で PACS の画像へ。一言は本文の1行目です。</p>
<p >読影・病理・内視鏡・生理検査のレポートを患者ごとに、未読の多い順に並べます。行を押すと本文が読め、医師は「確認した」で既読にします（看護師は読むだけ）。「カルテを開く」でその患者のカルテへ。</p>
*/
