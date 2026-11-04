"use client";

import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { findPhysio } from "@/lib/exams";
import { caseTitle, casesOf, pathResultItems, pathStatus, versionOf, type PathCase } from "@/lib/pathology";
import { derivedValues, fieldsOf, physioResultItems, physioRows, versionOf as physioVersion, type PhysioDesk } from "@/lib/physio-desk";
import type { Ack } from "@/lib/results";
import type { OrderEntry } from "@/lib/types";
import { useDeny } from "../RoleContext";

interface Props {
  patientId: string;
  patientName: string;
  /** This patient's orders (the physiological tests not reported yet). */
  entries: OrderEntry[];
  physio: PhysioDesk;
  pathology: PathCase[];
  acks: Record<string, Ack>;
  today: CalendarDate;
  /** Mark reports as read (the same 確認 as the results at the top of the chart). */
  onSeen: (keys: string[]) => void;
}

const dayText = (today: CalendarDate, d: number) => (d === 0 ? "今日" : formatShort(addDays(today, d)));

/** In the chart: the reports of 生理検査 and 病理, in full, with whether the doctor has read them. */
export function DeptReportsPanel({ patientId, patientName, entries, physio, pathology, acks, today, onSeen }: Props) {
  const locked = !!useDeny()("result.ack");
  const cases = casesOf(pathology, patientId);
  const items = pathResultItems(cases);
  const works = Object.values(physio)
    .filter((w) => w.patientId === patientId && w.report)
    .sort((a, b) => b.report!.day - a.report!.day || b.report!.time.localeCompare(a.report!.time));
  const phyItems = physioResultItems(physio);
  const pending = physioRows([{ patient: { id: patientId, name: patientName }, room: "", entries }], physio).filter((r) => r.status !== "報告済み");
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
        <h3 className="mb-1 font-bold">生理検査（レポート {works.length}件）</h3>
        {works.length === 0 && pending.length === 0 && <p className="text-ink-faint">生理検査はありません。</p>}
        <ul className="space-y-2">
          {works.map((w) => {
            const r = w.report!;
            const item = phyItems.find((i) => i.key.startsWith(`phy|${w.orderId}|`));
            const derived = derivedValues(w.test, r.values);
            return (
              <li key={w.orderId} className="rounded-md border border-rule bg-paper p-2">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <b>{findPhysio(w.test)?.name ?? w.test}</b>
                  <span className="nums text-ink-soft">
                    {dayText(today, r.day)} {r.time} {r.by}
                    {physioVersion(w) > 1 && `（第${physioVersion(w)}版：${r.reason ?? ""}）`}
                  </span>
                  {item && <span className="ml-auto">{seen(item.key, item.day)}</span>}
                </p>
                <p className="mt-0.5">
                  <span className="text-ink-soft">まとめ：</span>
                  <b>{r.conclusion}</b>
                </p>
                {fieldsOf(w.test).some((f) => r.values[f.key] !== undefined) && (
                  <table className="nums mt-0.5">
                    <tbody>
                      {fieldsOf(w.test)
                        .filter((f) => r.values[f.key] !== undefined)
                        .map((f) => (
                          <tr key={f.key}>
                            <td className="pr-3 text-ink-soft">{f.label}</td>
                            <td className="text-right">
                              {r.values[f.key]} {f.unit}
                            </td>
                          </tr>
                        ))}
                      {derived.map((d) => (
                        <tr key={d.label}>
                          <td className="pr-3 text-ink-soft">{d.label}</td>
                          <td className="text-right" title={d.formula}>
                            {d.value} {d.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p className="mt-0.5">
                  <span className="text-ink-soft">所見：</span>
                  {r.findings}
                </p>
              </li>
            );
          })}
        </ul>
        {pending.length > 0 && (
          <p className="mt-1 text-ink-soft">
            レポートがまだの検査：
            {pending.map((r) => `${r.testName}（${r.status}${r.work?.notDone ? `：${r.work.notDone.reason}` : ""}）`).join("、")}
          </p>
        )}
      </section>

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
