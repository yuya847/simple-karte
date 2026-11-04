"use client";

import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { caseTitle, casesOf, pathResultItems, pathStatus, versionOf, type PathCase } from "@/lib/pathology";
import type { Ack } from "@/lib/results";
import { useDeny } from "../RoleContext";

interface Props {
  patientId: string;
  pathology: PathCase[];
  acks: Record<string, Ack>;
  today: CalendarDate;
  /** Mark reports as read (the same 確認 as the results at the top of the chart). */
  onSeen: (keys: string[]) => void;
}

const dayText = (today: CalendarDate, d: number) => (d === 0 ? "今日" : formatShort(addDays(today, d)));

/** In the chart: the reports of 病理, in full, with whether the doctor has read them. */
export function DeptReportsPanel({ patientId, pathology, acks, today, onSeen }: Props) {
  const locked = !!useDeny()("result.ack");
  const cases = casesOf(pathology, patientId);
  const items = pathResultItems(cases);
  const seen = (k: string, day: number) => {
    const a = acks[k];
    if (a) return <span className="text-wakatake">確認 {a.at.time} {a.by}</span>;
    if (day < 0) return <span className="text-ink-faint">前の記録</span>;
    return (
      <button type="button" disabled={locked} onClick={() => onSeen([k])} className="rounded border border-ai px-1.5 text-[11px] text-ai disabled:opacity-40">
        確認した
      </button>
    );
  };
  return (
    <div className="space-y-3 text-[12px]">
      <section>
        <h3 className="mb-1 font-bold">病理（{cases.length}件）</h3>
        {cases.length === 0 && <p className="text-ink-faint">病理の依頼はありません。</p>}
        <ul className="space-y-2">
          {cases.map((c) => {
            const item = items.find((i) => i.key.startsWith(`path|${c.id}|`));
            return (
              <li key={c.id} className="rounded-md border border-rule bg-paper p-2">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <b>{caseTitle(c)}</b>
                  <span className="nums font-mono text-ink-soft">{c.received?.number ?? ""}</span>
                  <span className="text-ink-soft">{pathStatus(c)}</span>
                  {item && (
                    <span className="ml-auto">{seen(item.key, item.day)}</span>
                  )}
                </p>
                {c.report ? (
                  <div className="mt-1 space-y-0.5">
                    {c.report.important && <p className="font-bold text-shu">重要な所見</p>}
                    <p>
                      <span className="text-ink-soft">病理診断：</span>
                      <b>{c.report.diagnosis}</b>
                    </p>
                    {c.report.findings && (
                      <p>
                        <span className="text-ink-soft">所見：</span>
                        {c.report.findings}
                      </p>
                    )}
                    {c.report.comment && (
                      <p>
                        <span className="text-ink-soft">コメント：</span>
                        {c.report.comment}
                      </p>
                    )}
                    <p className="nums text-ink-soft">
                      {dayText(today, c.report.day)} {c.report.time} {c.report.by}
                      {versionOf(c) > 1 && `（第${versionOf(c)}版：${c.report.reason ?? ""}）`}
                      {c.called && `　直接伝えた：${c.called.time} → ${c.called.to}`}
                    </p>
                  </div>
                ) : (
                  <p className="text-ink-soft">
                    依頼 {dayText(today, c.ordered.day)} {c.ordered.time} {c.ordered.by}。{c.question}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
