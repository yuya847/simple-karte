"use client";

import { Check, ClipboardPen } from "lucide-react";
import { useState } from "react";
import { auditLog } from "@/lib/audit";
import { checkEntry, confirmReport, entryPlan, rangeText, toEnter, whenText, type DrawRow, type LabDesk } from "@/lib/lab-desk";
import { ageSex } from "@/lib/person";
import { hitLine, type PanicLimit } from "@/lib/results";
import type { WorkPatient } from "@/lib/worksheet";
import { DenyNote, useDeny, useMe } from "./RoleContext";

interface Props {
  rows: DrawRow[];
  people: WorkPatient[];
  limits: PanicLimit[];
  nowAbs: number;
  onDesk: (f: (d: LabDesk) => LabDesk) => void;
  /** A confirmed result had panic values (one line for the banner). */
  onPanic: (line: string) => void;
}

const fmt = (n: number) => n.toLocaleString("ja-JP", { maximumFractionDigits: 3 });

/** 結果の入力: the values of each received sample, checked by code as they are typed, then 確定. */
export function LabEntry({ rows, people, limits, nowAbs, onDesk, onPanic }: Props) {
  const me = useMe();
  const deny = useDeny()("lab.result");
  const [sel, setSel] = useState<string | null>(null);
  const [raw, setRaw] = useState<Record<string, Record<string, string>>>({});
  const received = toEnter(rows);
  const withItems = received.filter((r) => entryPlan(r.codes).analytes.length > 0);
  const without = received.filter((r) => entryPlan(r.codes).analytes.length === 0);
  const row = withItems.find((r) => r.code === sel) ?? withItems[0];
  return (
    <div className="mx-auto max-w-[1100px] space-y-2">
      <DenyNote action="lab.result" />
      {received.length === 0 ? (
        <p className="rounded-lg border border-rule bg-sheet p-4 text-ink-soft">受け付けた検体はありません。「検体の受付」でラベルを読むと、ここに並びます。</p>
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          <ul className="w-64 shrink-0 space-y-1">
            {withItems.map((r) => (
              <li key={r.code}>
                <button
                  type="button"
                  onClick={() => setSel(r.code)}
                  className={`w-full rounded border px-2 py-1 text-left text-[12px] ${r.code === row?.code ? "border-ai bg-ai-soft" : "border-rule bg-sheet hover:border-ai"}`}
                >
                  <span className="nums block text-ink-soft">
                    {whenText(r.at)}　<span className="text-ink-faint">{r.room}</span> <b className="text-ink">{r.name}</b>
                    {r.urgent && <span className="ml-1 rounded bg-shu px-1 text-[10px] font-bold text-white">至急</span>}
                  </span>
                  <span className="block truncate">{r.tests}</span>
                </button>
              </li>
            ))}
            {without.map((r) => (
              <li key={r.code} className="rounded border border-rule-soft px-2 py-1 text-[11px] text-ink-faint">
                {whenText(r.at)} {r.name}　{r.tests}：この画面で入れる項目なし（{entryPlan(r.codes).other.map((o) => `${o.name}は${o.why}`).join("、")}）
              </li>
            ))}
          </ul>
          {row && (
            <Form
              key={row.code}
              row={row}
              person={people.find((x) => x.patient.id === row.patientId)}
              raw={raw[row.code] ?? {}}
              onRaw={(v) => setRaw((all) => ({ ...all, [row.code]: v }))}
              limits={limits}
              locked={!!deny}
              onConfirm={(values, panicLine, n) => {
                onDesk((d) => confirmReport(d, row, values, me.name, nowAbs));
                auditLog({ role: me.role, actor: me.name, action: "確定（検査結果）", patient: row.name, detail: `${whenText(row.at)} ${n}項目${panicLine ? `　パニック値：${panicLine}` : ""}` });
                setSel(null);
                if (panicLine) onPanic(`${row.room} ${row.name}さん ${panicLine}`);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Form({
  row,
  person,
  raw,
  onRaw,
  limits,
  locked,
  onConfirm,
}: {
  row: DrawRow;
  person?: WorkPatient;
  raw: Record<string, string>;
  onRaw: (v: Record<string, string>) => void;
  limits: PanicLimit[];
  locked: boolean;
  onConfirm: (values: Record<string, number>, panicLine: string, n: number) => void;
}) {
  if (!person) return null;
  const p = person.patient;
  const plan = entryPlan(row.codes);
  const check = checkEntry(plan, raw, p, limits, row.at);
  const panicLine = check.panic.map(hitLine).join("、");
  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        // A barcode reader or a person presses Enter after each value: go to the next box.
        if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement)) return;
        e.preventDefault();
        const boxes = [...e.currentTarget.querySelectorAll<HTMLInputElement>("input[data-value]")];
        boxes[boxes.indexOf(e.target) + 1]?.focus();
      }}
      className="min-w-0 flex-1 rounded-lg border border-rule bg-sheet p-3"
    >
      <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0">
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          <ClipboardPen size={15} className="self-center text-ai" />
          <b className="text-[14px]">
            {row.room} {p.name}さん
          </b>
          <span className="text-ink-soft">{ageSex(p)}</span>
          <span className="nums text-ink-soft">
            採血 {whenText(row.at)}　受付 {row.reception?.time} {row.reception?.by}
          </span>
          <span className="nums font-mono text-[11px] text-ink-faint">{row.code}</span>
        </div>
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-rule text-left text-ink-soft">
              <th className="py-1 pr-2 font-normal">項目</th>
              <th className="py-1 pr-2 font-normal">値</th>
              <th className="py-1 pr-2 font-normal">単位</th>
              <th className="py-1 pr-2 font-normal">基準範囲（{p.sex}）</th>
              <th className="py-1 pr-2 font-normal">判定（コード）</th>
              <th className="py-1 font-normal">前回</th>
            </tr>
          </thead>
          <tbody>
            {check.rows.map((r, n) => (
              <tr key={r.analyte.code} className={`border-b border-rule-soft ${r.panic ? "bg-shu-soft" : ""}`}>
                <td className="py-0.5 pr-2 font-bold">{r.analyte.name}</td>
                <td className="py-0.5 pr-2">
                  <input
                    data-value
                    autoFocus={n === 0}
                    inputMode="decimal"
                    value={r.raw}
                    onChange={(e) => onRaw({ ...raw, [r.analyte.code]: e.target.value })}
                    aria-label={r.analyte.name}
                    className={`nums w-24 rounded border bg-paper px-1.5 py-0.5 text-right ${r.error ? "border-shu" : "border-rule"}`}
                  />
                </td>
                <td className="py-0.5 pr-2 text-ink-faint">{r.analyte.unit}</td>
                <td className="nums py-0.5 pr-2 text-ink-faint">
                  {rangeText(r.analyte, p.sex)}
                  {r.analyte.source && <span className="text-[10px]">（{r.analyte.source === "共用基準範囲" ? "共用" : "SRL"}）</span>}
                </td>
                <td className="py-0.5 pr-2">
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
                <td className="nums py-0.5 text-ink-soft">{r.prev ? `${fmt(r.prev.value)}（${r.prev.when}）` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {plan.other.length > 0 && <p className="mt-1 text-[11px] text-ink-faint">この画面で入れない項目：{plan.other.map((o) => `${o.name}（${o.why}）`).join("、")}</p>}
        <p className="mt-1 text-[11px] text-ink-faint">H／L は基準範囲（JCCLS 共用基準範囲 2022・SRL 総合検査案内）との比較、パニック値はこの架空の病院の値で、どちらもコードが判定します。前回値は見比べるために並べるだけです。</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {check.panic.length > 0 && <b className="text-shu">パニック値：{panicLine}。確定すると「結果とパニック値」で医師への連絡に進みます。</b>}
          <span className="ml-auto text-ink-soft">
            {check.errors ? `数でない値が ${check.errors}件　` : ""}
            {check.missing ? `あと ${check.missing}項目` : check.errors ? "" : "全部の項目がそろいました"}
          </span>
          <button
            type="button"
            disabled={!check.ready}
            onClick={() => onConfirm(check.values, panicLine, plan.analytes.length)}
            className="flex items-center gap-1 rounded bg-wakatake px-3 py-1 font-bold text-white disabled:opacity-40"
          >
            <Check size={13} />
            確定（{plan.analytes.length}項目）
          </button>
        </div>
      </fieldset>
    </form>
  );
}
