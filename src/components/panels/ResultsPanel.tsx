"use client";

import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { ANALYTES, rangeFor } from "@/lib/master";
import type { Patient } from "@/lib/types";

/** Lab results by date, plus culture reports. Values are shown, never judged. */
export function ResultsPanel({ patient, today }: { patient: Patient; today: CalendarDate }) {
  const results = [...patient.labs].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
  const rows = ANALYTES.filter((a) => results.some((r) => a.code in r.values));

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-bold">検体検査</h3>
        {results.length === 0 ? (
          <p className="text-sm text-ink-faint">結果なし</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="nums w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-rule text-xs text-ink-faint">
                  <th className="py-1 pr-3 text-left font-normal">項目</th>
                  <th className="py-1 pr-3 text-left font-normal">単位</th>
                  <th className="py-1 pr-3 text-left font-normal" title="共用＝JCCLS 共用基準範囲（2022）、SRL＝SRL 総合検査案内 2026-2027。＊は判断値あり">基準範囲</th>
                  {results.map((r) => (
                    <th key={`${r.day}-${r.time}-${r.id ?? ""}`} className="py-1 pl-3 text-right font-normal" title={r.corrected ? `訂正（第${r.corrected.version}版）${r.corrected.at.time} ${r.corrected.by}　理由：${r.corrected.reason}` : undefined}>
                      {formatShort(addDays(today, r.day))}
                      <br />
                      {r.time}
                      {r.corrected && (
                        <>
                          <br />
                          <span className="font-bold text-yamabuki">訂正 第{r.corrected.version}版</span>
                        </>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.code} className="border-b border-rule-soft">
                    <td className="py-1 pr-3 font-bold">{a.name}</td>
                    <td className="py-1 pr-3 text-xs text-ink-faint">{a.unit}</td>
                    <td className="py-1 pr-3 text-[11px] text-ink-faint" title={a.judgment ? `判断値：${a.judgment}` : undefined}>
                      {(() => {
                        const rg = rangeFor(a, patient.sex);
                        const t = rg.low !== undefined && rg.high !== undefined ? `${rg.low}〜${rg.high}` : rg.high !== undefined ? `${rg.high}以下` : rg.low !== undefined ? `${rg.low}以上` : "—";
                        return `${t}${a.source ? `（${a.source === "共用基準範囲" ? "共用" : "SRL"}）` : ""}${a.judgment ? " ＊" : ""}`;
                      })()}
                    </td>
                    {results.map((r) => {
                      const v = r.values[a.code];
                      const rg = rangeFor(a, patient.sex);
                      const flag = v === undefined ? "" : rg.high !== undefined && v > rg.high ? "H" : rg.low !== undefined && v < rg.low ? "L" : "";
                      return (
                        <td key={`${r.day}-${r.time}-${r.id ?? ""}`} className={`py-1 pl-3 text-right ${flag === "H" ? "text-shu" : flag === "L" ? "text-ai" : ""}`}>
                          {v === undefined ? "—" : v.toLocaleString("ja-JP")}
                          <span className="inline-block w-3 text-[10px]">{flag}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-ink-faint">H／L は一般的な成人の基準範囲との比較（架空の病院の設定）。</p>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold">細菌検査</h3>
        {patient.cultures.length === 0 ? (
          <p className="text-sm text-ink-faint">提出なし</p>
        ) : (
          <ul className="space-y-3">
            {patient.cultures.map((c, i) => (
              <li key={i} className="rounded-md border border-rule-soft bg-paper/60 p-3 text-[13px]">
                <div className="nums mb-1 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                  <span>採取 {formatShort(addDays(today, c.collectedOn))}</span>
                  <b className="text-ink">{c.specimen}培養</b>
                  {c.sets && <span>{c.sets}</span>}
                  <span className="ml-auto rounded border border-rule px-1">{c.status}</span>
                </div>
                {c.log && c.log.length > 0 && (
                  <ol className="nums mb-1 text-[11px] text-ink-soft">
                    {c.log.map((l, n) => (
                      <li key={n}>
                        {formatShort(addDays(today, l.day))} {l.time} {l.by}　{l.text}
                      </li>
                    ))}
                  </ol>
                )}
                {c.gram && <div>グラム染色：{c.gram}</div>}
                {c.organism && <div className="font-bold">同定：{c.organism}</div>}
                {c.susceptibility && (
                  <table className="nums mt-2 text-xs">
                    <thead>
                      <tr className="text-ink-faint">
                        <th className="pr-4 text-left font-normal">薬剤</th>
                        <th className="pr-4 text-right font-normal">MIC（μg/mL）</th>
                        <th className="text-left font-normal">判定</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.susceptibility.map((s) => (
                        <tr key={s.drug}>
                          <td className="pr-4">{s.drug}</td>
                          <td className="pr-4 text-right">{s.mic}</td>
                          <td className={s.result === "R" ? "text-shu" : ""}>{s.result}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
