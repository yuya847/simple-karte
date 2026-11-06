"use client";

import { displayText } from "@/lib/display-text";
import { useState, type ComponentProps } from "react";
import { TrendingUp } from "lucide-react";
import { addDays, formatShort } from "@/lib/dates";
import { ANALYTES } from "@/lib/master";
import { flagOf } from "@/lib/lab-desk";
import { rangeText } from "@/lib/lab-table";
import { previousResult, resultVisits } from "@/lib/result-visits";
import { PANIC_LIMITS, partialReportLabel, cultureKeyOf, type ResultItem } from "@/lib/results";
import { ResultsInbox } from "./ResultsInbox";
import { ResultsPanel } from "./panels/ResultsPanel";

type Props = ComponentProps<typeof ResultsPanel> & Pick<ComponentProps<typeof ResultsInbox>, "items" | "calls" | "onSeen"> & { extra: ResultItem[]; onTimeline: () => void };

export function ResultBrowser({ items, calls, onSeen, extra, onTimeline, ...props }: Props) {
  const { patient, today } = props;
  const visits = resultVisits(patient, PANIC_LIMITS, extra, items.map((i) => i.key));
  const [selected, select] = useState<string | null>(null);
  const [kind, setKind] = useState("");
  const visit = visits.find((v) => v.key === selected);
  const when = (day: number, time?: string) => `${formatShort(addDays(today, day))} ${time || "時刻の記録なし"}`;
  const button = "rounded border border-rule bg-sheet px-3 py-1 text-sm hover:bg-paper";
  if (visit) {
    const lab = visit.lab;
    const culture = patient.cultures.find((c) => cultureKeyOf(patient.id, c) === visit.key);
    const image = patient.imaging.find((i) => `img|${i.id}` === visit.key);
    return <section className="space-y-3">
      <button type="button" className={button} onClick={() => select(null)}>検査結果一覧へ戻る</button>
      <h2 className="font-bold">{visit.kind}　{visit.item.title}</h2>
      <p className="text-sm">採取日時：{lab ? when(lab.day, lab.time) : culture ? when(culture.collectedOn) : "記録なし"}　報告日時：{lab ? lab.reportedAt ? when(lab.reportedAt.day, lab.reportedAt.time) : "記録なし" : when(visit.day, visit.time)}</p>
      {lab && <ResultsPanel patient={{ ...patient, labs: [lab], cultures: [] }} today={today} />}
      {lab ? <details><summary className="cursor-pointer text-sm">前回と比較</summary><div className="overflow-x-auto"><table className="w-auto table-auto self-start [&_th]:px-2 [&_td]:px-2 text-left text-sm"><thead><tr>{["項目", "値", "単位", "基準範囲", "H/L", "前回値", "前回との差"].map((s) => <th key={s} className="border-b border-rule p-2">{s}</th>)}</tr></thead><tbody>{Object.entries(lab.values).map(([code, value]) => {
        const a = ANALYTES.find((a) => a.code === code);
        const previous = previousResult(patient.labs, lab, code);
        const flag = a ? flagOf(a, patient.sex, value) : "";
        const delta = previous === undefined ? undefined : Math.round((value - previous) * 1000) / 1000;
        return <tr key={code} className={`border-b border-rule-soft ${flag ? "text-shu" : ""}`}>{[a?.name ?? code, value, a?.unit ?? "—", a ? rangeText(a, patient.sex) : "—", flag || "—", previous ?? "—", delta === undefined ? "—" : `${delta > 0 ? "+" : ""}${delta}`].map((v, i) => <td key={i} className={`p-2 ${[1, 5, 6].includes(i) ? "text-right nums" : ""}`}>{v}</td>)}</tr>;
      })}</tbody></table></div></details> : <p className="whitespace-pre-wrap text-sm">{displayText(image?.report ?? visit.item.detail)}</p>}
      {culture?.susceptibility && <ul className="text-sm">{culture.susceptibility.map((s) => <li key={s.drug}>{s.drug}：{s.result}（MIC {s.mic}）</li>)}</ul>}
      <p className="text-sm">コメント：{displayText(visit.item.corrected ?? (lab ? "記録なし" : visit.item.detail || "記録なし"))}</p>
      {visit.unseen ? <ResultsInbox today={today} items={[visit.item]} calls={calls} onSeen={onSeen} /> : <p className="text-sm text-ink-soft">確認済み</p>}
    </section>;
  }
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center gap-3"><h2 className="font-bold">検査結果一覧</h2><button type="button" className={`${button} inline-flex items-center gap-1`} onClick={onTimeline}><TrendingUp size={16} />時系列で表示</button></div>
    <ResultsInbox today={today} items={items} calls={calls} onSeen={onSeen} />
    <label className="text-sm">種類で絞る <select className="rounded border border-rule bg-sheet p-1" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">すべて</option>{[...new Set(visits.map((v) => v.kind))].map((k) => <option key={k}>{k}</option>)}</select></label>
    <div className="divide-y divide-rule rounded border border-rule">{visits.filter((v) => !kind || v.kind === kind).map((v) => <button key={v.key} type="button" onClick={() => select(v.key)} className="flex w-full flex-wrap items-center gap-3 px-3 py-2 text-left text-sm hover:bg-sheet"><span className="nums">{when(v.day, v.time)}</span><b>{v.kind}</b><span>{v.summary}</span>{v.lab && partialReportLabel(v.lab) && <span className="rounded bg-yamabuki-soft px-2 text-yamabuki">{partialReportLabel(v.lab)}</span>}{v.unseen && <span className="rounded bg-shu-soft px-2 text-shu">未確認</span>}</button>)}{visits.length === 0 && <p className="p-3 text-sm text-ink-soft">検査結果はありません。</p>}</div>
  </section>;
}
