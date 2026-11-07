"use client";
import { labNumber } from "@/lib/lab-number";

import { displayText } from "@/lib/display-text";
import { History, PencilLine } from "lucide-react";
import { useState } from "react";
import { CORRECTION_REASONS, changeLine, changesOf, checkCorrection, checkEntry, correctionReason, entryPlan, flagOf, versionOf, versionsOf, whenText, type CorrectionCheck, type CorrectionReason, type DrawRow } from "@/lib/lab-desk";
import { ageSex } from "@/lib/person";
import { hitLine, type PanicCall, type PanicLimit } from "@/lib/results";
import type { WorkPatient } from "@/lib/worksheet";
import { TabChoice } from "./TabChoice";



/**
 * 結果の訂正: a confirmed result is changed with a reason. The version it replaces stays (who, when,
 * why). Code compares the values, says what changes and whether the panic values change.
 */
export function LabCorrect({
  row,
  person,
  limits,
  locked,
  call,
  onConfirm,
}: {
  row: DrawRow;
  person?: WorkPatient;
  limits: PanicLimit[];
  locked: boolean;
  /** The panic call made for the version in force, if any. */
  call?: PanicCall;
  onConfirm: (values: Record<string, number>, reason: string, check: CorrectionCheck) => void;
}) {
  const report = row.report!;
  const [raw, setRaw] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(report.values).map(([k, v]) => [k, String(v)])));
  const [kind, setKind] = useState<CorrectionReason | null>(null);
  const [note, setNote] = useState("");
  if (!person) return null;
  const p = person.patient;
  const fullPlan = entryPlan(row.codes);
  const plan = { ...fullPlan, analytes: fullPlan.analytes.filter((a) => a.code in report.values) };
  const entry = checkEntry(plan, raw, p, limits, row.at);
  const reason = correctionReason(kind, note);
  const check = checkCorrection(report, entry, reason, limits);
  const changed = new Set(check.changes.map((c) => c.code));
  const lost = check.panicBefore.filter((h) => !check.panicAfter.some((x) => x.code === h.code));
  return (
    <form onSubmit={(e) => e.preventDefault()} className="min-w-0 flex-1 rounded-lg border border-yamabuki/50 bg-sheet p-3">
      <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0">
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          <PencilLine size={15} className="self-center text-yamabuki" />
          <b className="text-[14px]">
            結果の訂正　{row.room} {p.name}さん
          </b>
          <span className="text-ink-soft">{ageSex(p)}</span>
          <span className="nums text-ink-soft">
            採血 {displayText(whenText(row.at))}　第{versionOf(report)}版 {report.reported.time} {displayText(report.by)}
          </span>
          <span className="nums font-mono text-[11px] text-ink-faint">{row.code}</span>
        </div>
        <table className="w-auto table-auto self-start border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-rule text-left text-ink-soft">
              <th className="py-1 pr-2 font-normal">項目</th>
              <th className="py-1 pr-2 font-normal">いまの値</th>
              <th className="py-1 pr-2 font-normal">訂正後</th>
              <th className="py-1 pr-2 font-normal">単位</th>
              <th className="py-1 font-normal">判定（コード）</th>
            </tr>
          </thead>
          <tbody>
            {entry.rows.map((r) => {
              const now = report.values[r.analyte.code];
              const flagNow = now === undefined ? "" : flagOf(r.analyte, p.sex, now);
              return (
                <tr key={r.analyte.code} className={`border-b border-rule-soft ${changed.has(r.analyte.code) ? "bg-yamabuki-soft/60" : ""}`}>
                  <td className="py-0.5 pr-2 font-bold">{r.analyte.name}</td>
                  <td className="nums py-0.5 pr-2 text-ink-soft">
                    {now === undefined ? "—" : labNumber(r.analyte.code, now)}
                    {flagNow && <span className="ml-0.5 text-[10px]">{flagNow}</span>}
                  </td>
                  <td className="py-0.5 pr-2">
                    <input
                      inputMode="decimal"
                      value={r.raw}
                      onChange={(e) => setRaw({ ...raw, [r.analyte.code]: e.target.value })}
                      aria-label={`${r.analyte.name}（訂正後）`}
                      className={`nums w-24 rounded border bg-paper px-1.5 py-0.5 text-right ${r.error ? "border-shu" : changed.has(r.analyte.code) ? "border-yamabuki" : "border-rule"}`}
                    />
                  </td>
                  <td className="py-0.5 pr-2 text-ink-faint">{r.analyte.unit}</td>
                  <td className="py-0.5">
                    {r.error ? (
                      <span className="text-shu">{r.error}</span>
                    ) : r.panic ? (
                      <b className="text-shu">パニック値（{r.panic.side === "低" ? `${r.panic.limit}以下` : `${r.panic.limit}以上`}）</b>
                    ) : r.flag ? (
                      <b className={r.flag === "H" ? "text-shu" : "text-ai"}>{r.flag}</b>
                    ) : r.value !== null ? (
                      <span className="text-ink-faint">範囲内</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-2 space-y-1.5 text-[12px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">訂正の理由</span>
            <TabChoice label="訂正の理由" options={CORRECTION_REASONS.map((r) => ({ value: r, label: r }))} value={kind} onChange={setKind} />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={kind === "その他" ? "理由を書く（必須）" : "くわしく（任意）例：K と Na の欄を取り違えた"}
              aria-label="訂正の理由（くわしく）"
              className="min-w-0 flex-1 rounded border border-rule bg-paper px-1.5 py-0.5"
            />
          </div>
          {check.changes.length > 0 && <p className="nums">変える値：{changeLine(check.changes)}</p>}
          {lost.length > 0 && (
            <p className="font-bold text-yamabuki">
              訂正するとパニック値でなくなります（{lost.map((h) => h.name).join("・")}）。
              {call ? `前の値は ${call.at.time} に ${call.to} へ報告済みです。訂正したことも伝えてください。` : "前の値のパニック値の連絡は一覧から外れます。"}
            </p>
          )}
          {check.panicAfter.length > 0 && (
            <p className="font-bold text-shu">訂正後の値はパニック値です（{check.panicAfter.map(hitLine).join("、")}）。確定すると、訂正した値で医師にもう一度連絡します（「結果とパニック値」に出ます）。</p>
          )}
        </div>

        <ol className="nums mt-2 space-y-0.5 rounded border border-rule-soft bg-paper px-2 py-1 text-[11px] text-ink-soft">
          <li className="flex items-center gap-1 font-bold">
            <History size={12} />
            版の履歴
          </li>
          {versionsOf(report).map((v, i, all) => (
            <li key={i} className={i === all.length - 1 ? "text-ink" : ""}>
              第{i + 1}版　{v.reported.time} {displayText(v.by)}
              {displayText(v.reason ? `　理由：${v.reason}` : "　確定")}
              {i > 0 && `　（${changeLine(changesOf(all[i - 1].values, v.values))}）`}
            </li>
          ))}
        </ol>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {check.missing.length > 0 && <span className="text-ink-soft">あと：{check.missing.join("・")}</span>}
          <button
            type="button"
            disabled={!check.ready}
            onClick={() => onConfirm(entry.values, reason, check)}
            className="ml-auto flex items-center gap-1 rounded bg-yamabuki px-3 py-1 font-bold text-white disabled:opacity-40"
          >
            <PencilLine size={13} />
            訂正を確定（第{versionOf(report) + 1}版）
          </button>
        </div>
      </fieldset>
    </form>
  );
}
