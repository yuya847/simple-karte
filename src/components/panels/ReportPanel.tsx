"use client";

// One report in full: what the department wrote under its headings (所見・診断・推奨 …), who reported it and when,
// the link to the pictures, and the doctor's 確認 (who, when). Reading alone does not mark it as seen.

import { ScanLine } from "lucide-react";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { readStateOf, type Report } from "@/lib/reports";
import type { Ack } from "@/lib/results";
import { DenyNote, useDeny } from "../RoleContext";

export const KIND_CHIP: Record<Report["kind"], string> = {
  画像: "bg-fuji-soft text-fuji",
  病理: "bg-shu-soft text-shu",
  内視鏡: "bg-wakatake-soft text-wakatake",
  生理: "bg-ai-soft text-ai",
};

export const dayText = (today: CalendarDate, d: number) => (d === 0 ? "今日" : d === 1 ? "明日" : formatShort(addDays(today, d)));

interface Props {
  report: Report;
  acks: Record<string, Ack>;
  today: CalendarDate;
  /** Mark as seen (the same 確認 as the results at the top of the chart). */
  onSeen?: (keys: string[]) => void;
  /** Open the pictures in the PACS viewer. */
  onOpenImage?: (studyId: string) => void;
  /** Without the title line (the row above already shows it). */
  bare?: boolean;
}

/** The 確認 of a report: the button, or who confirmed it and when, or 前の記録. */
export function ReadMark({ report, acks, onSeen }: Pick<Props, "report" | "acks" | "onSeen">) {
  const locked = !!useDeny()("result.ack");
  const s = readStateOf(report, acks);
  if (s.state === "確認済み")
    return (
      <span className="text-wakatake">
        確認 {s.ack.at.time} {s.ack.by}
      </span>
    );
  if (s.state === "前の記録") return <span className="text-ink-faint">前の記録</span>;
  if (!onSeen) return <span className="font-bold text-shu">未読</span>;
  return (
    <button type="button" disabled={locked} onClick={() => onSeen([report.key])} className="rounded border border-ai px-1.5 text-[11px] text-ai hover:bg-ai-soft disabled:opacity-40 pointer-coarse:py-1">
      確認した
    </button>
  );
}

export function ReportPanel({ report: r, acks, today, onSeen, onOpenImage, bare }: Props) {
  return (
    <article aria-label={`${r.kind}のレポート：${r.title}`} className="space-y-1.5 text-[12px]">
      {!bare && (
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className={`rounded px-1 text-[11px] font-bold ${KIND_CHIP[r.kind]}`}>{r.kind}</span>
          <b className="text-[13px]">{r.title}</b>
          {r.region && !r.title.includes(r.region) && <span className="text-ink-soft">{r.region}</span>}
          {r.important && <span className="rounded bg-shu px-1 text-[11px] font-bold text-white">重要な所見</span>}
        </p>
      )}
      <dl className="nums grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-0.5 text-ink-soft">
        {r.examAt && (
          <>
            <dt>検査</dt>
            <dd>
              {dayText(today, r.examAt.day)} {r.examAt.time}
            </dd>
          </>
        )}
        <dt>報告</dt>
        <dd>
          {dayText(today, r.at.day)} {r.at.time}　{r.by}
          {r.version > 1 && <span className="ml-1 rounded bg-yamabuki px-1 text-[11px] font-bold text-white">第{r.version}版（訂正）</span>}
          {r.version > 1 && r.reason && <span className="ml-1">理由：{r.reason}</span>}
        </dd>
      </dl>
      <div className="space-y-1.5 rounded-md border border-rule bg-sheet p-2">
        {r.sections.map((s) => (
          <section key={s.label}>
            <h4 className="text-[11px] font-bold text-ink-soft">{s.label}</h4>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{s.text}</p>
          </section>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ReadMark report={r} acks={acks} onSeen={onSeen} />
        {r.imageOf && onOpenImage && (
          <button type="button" onClick={() => onOpenImage(r.imageOf!)} className="flex items-center gap-1 rounded border border-ai/50 px-2 py-0.5 text-[11px] font-bold text-ai hover:bg-ai-soft pointer-coarse:py-1.5">
            <ScanLine size={12} />
            画像を開く（PACS）
          </button>
        )}
      </div>
      {onSeen && <DenyNote action="result.ack" />}
    </article>
  );
}
