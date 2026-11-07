"use client";
import { displayText } from "@/lib/display-text";
import { TimeInput } from "@/components/TimeInput";

import { Thermometer } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { ACVPU_LABEL, type Acvpu } from "@/lib/news2";
import type { StandingOrders } from "@/lib/standing";
import type { VitalSign } from "@/lib/types";
import { BULK_FIELDS, parseRow, rowWarnings, rowsWithErrors, toSave, type BulkField, type BulkRow } from "@/lib/vitals-bulk";
import { useMe } from "./RoleContext";
import { PickSelect, type Pick } from "./WardMap";

export interface BulkPatient {
  id: string;
  name: string;
  room: string;
  last?: VitalSign;
  standing?: StandingOrders;
}

type Scope = "mine" | "team" | "all";

const lastText = (v?: VitalSign) => (v ? `${v.day === 0 ? "" : v.day === -1 ? "昨日 " : `${-v.day}日前 `}${v.time}　${v.bt ?? "—"}℃ ${v.hr ?? "—"} ${v.sbp ?? "—"}/${v.dbp ?? "—"} RR${v.rr ?? "—"} ${v.spo2 ?? "—"}%` : "—");

/**
 * バイタルの一括入力: the shift's patients in one table; the values go to the same record as the chart's バイタル.
 * Code reads the numbers and shows only the warnings of rules already in the app (指示簿・NEWS2).
 */
export function VitalsBulk({ pick, patients, mine, team, nowTime, canType, onSave }: { pick: Pick; patients: BulkPatient[]; mine: string[]; team: string[]; nowTime: string; canType: boolean; onSave: (list: { patientId: string; vital: VitalSign }[]) => void }) {
  const me = useMe();
  const [scope, setScope] = useState<Scope>(mine.length ? "mine" : "team");
  const [rows, setRows] = useState<Record<string, BulkRow>>({});
  const [time, setTime] = useState(nowTime);
  const shown = patients.filter((p) => (scope === "all" ? true : scope === "mine" ? mine.includes(p.id) : team.includes(p.id)));
  const rowOf = (p: BulkPatient): BulkRow => rows[p.id] ?? { values: {}, o2: p.last?.o2 && p.last.o2 !== "室内気" ? p.last.o2 : "", avpu: "" };
  const set = (p: BulkPatient, patch: Partial<BulkRow>) => setRows((all) => ({ ...all, [p.id]: { ...rowOf(p), ...patch } }));
  const timeOk = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t) && t <= nowTime;
  // Only the rows shown and typed are saved (a row typed under another choice of patients is not).
  const visible: Record<string, BulkRow> = {};
  for (const p of shown) if (parseRow(rowOf(p)).filled) visible[p.id] = rowOf(p);
  const save = toSave(visible, time, me.name);
  const bad = rowsWithErrors(visible);
  const lateRow = Object.entries(visible).filter(([, r]) => r.time && !timeOk(r.time)).map(([id]) => id);
  const box = "w-14 rounded border border-rule bg-paper px-1 py-0.5 text-right text-[12px]";
  // 前回: the last values go into the row's empty boxes (what was typed stays).
  const copyLast = (p: BulkPatient) => {
    const v = p.last;
    if (!v) return;
    const r = rowOf(p);
    const values = { ...r.values };
    for (const f of BULK_FIELDS) if (!(values[f.key] ?? "").trim() && v[f.key] !== undefined) values[f.key] = String(v[f.key]);
    set(p, { values, avpu: r.avpu || v.avpu || "", o2: r.o2 || (v.o2 && v.o2 !== "室内気" ? v.o2 : "") });
  };
  // Enter or ↓: the same box of the next patient; ↑: of the one above.
  const move = (e: KeyboardEvent<HTMLInputElement>, row: number, key: BulkField) => {
    const step = e.key === "Enter" || e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!step || e.nativeEvent.isComposing) return;
    const next = e.currentTarget.closest("table")?.querySelector<HTMLInputElement>(`input[data-bulk-field="${key}"][data-bulk-row="${row + step}"]`);
    e.preventDefault();
    next?.focus();
    next?.select();
  };
  const counts = { mine: mine.length, team: team.length, all: patients.length };
  return (
    <section aria-label="バイタルの一括入力" className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper p-5">
      <header className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-1.5 text-lg font-bold">
          <Thermometer size={18} />
          バイタルの一括入力
        </h1>
        <PickSelect pick={pick} />
        <div role="radiogroup" aria-label="出す患者" className="flex rounded-md border border-rule p-0.5">
          {(
            [
              ["mine", "業務分担で自分の受け持ち"],
              ["team", "受け持ちのチーム"],
              ["all", "階の全員"],
            ] as [Scope, string][]
          ).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={scope === k} disabled={counts[k] === 0} onClick={() => setScope(k)} className={`rounded px-2.5 py-0.5 text-xs disabled:opacity-40 ${scope === k ? "bg-ink font-bold text-white" : "text-ink-soft"}`}>
              {l}（{counts[k]}人）
            </button>
          ))}
        </div>
        <label className="nums flex items-center gap-1 text-xs text-ink-soft">
          測った時刻
          <TimeInput value={time} onChange={(e) => setTime(e.target.value)} inputMode="numeric" aria-label="測った時刻" className="w-16 rounded border border-rule bg-sheet px-1.5 py-0.5 text-right text-[13px] text-ink" />
        </label>
      </header>

      <table className="nums w-full border-collapse rounded-lg bg-sheet text-[12px]">
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className="px-1.5 py-1.5">患者</th>
            <th className="px-1.5">前回</th>
            {BULK_FIELDS.map((f) => (
              <th key={f.key} className="px-1 text-right">
                {f.label}
                <span className="block text-[10px] font-normal">{f.unit}</span>
              </th>
            ))}
            <th className="px-1">酸素</th>
            <th className="px-1">意識</th>
            <th className="px-1">時刻</th>
            <th className="px-1.5">知らせ</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((p, row) => {
            const r = rowOf(p);
            const parsed = parseRow(r);
            const warns = parsed.vital ? rowWarnings(parsed.vital, p.standing) : [];
            return (
              <tr key={p.id} className={`border-b border-rule-soft align-top ${warns.length ? "bg-shu-soft/30" : ""}`}>
                <td className="whitespace-nowrap px-1.5 py-1">
                  {p.room} <b>{p.name}</b>
                </td>
                <td className="px-1.5 py-1 text-[11px] text-ink-faint">
                  {p.last && canType ? (
                    <button type="button" onClick={() => copyLast(p)} aria-label={`${p.name}の前回の値を写す`} title="前回の値を空欄に写す" className="nums rounded px-1 py-0.5 text-left text-ink-soft hover:bg-ai-soft hover:text-ai">
                      {displayText(lastText(p.last))}
                    </button>
                  ) : (
                    displayText(lastText(p.last))
                  )}
                </td>
                {BULK_FIELDS.map((f) => (
                  <td key={f.key} className="px-1 py-1 text-right">
                    <input value={r.values[f.key] ?? ""} disabled={!canType} onChange={(e) => set(p, { values: { ...r.values, [f.key]: e.target.value } })} onKeyDown={(e) => move(e, row, f.key)} data-bulk-row={row} data-bulk-field={f.key} inputMode="decimal" aria-label={`${p.name}の${f.label}`} className={box} />
                  </td>
                ))}
                <td className="px-1 py-1">
                  <input value={r.o2} disabled={!canType} onChange={(e) => set(p, { o2: e.target.value })} placeholder="室内気" aria-label={`${p.name}の酸素`} className="w-24 rounded border border-rule bg-paper px-1 py-0.5 text-[12px]" />
                </td>
                <td className="px-1 py-1">
                  <select value={r.avpu} disabled={!canType} onChange={(e) => set(p, { avpu: e.target.value as Acvpu | "" })} aria-label={`${p.name}の意識`} className="rounded border border-rule bg-paper px-0.5 py-0.5 text-[12px]">
                    <option value="">—</option>
                    {(Object.keys(ACVPU_LABEL) as Acvpu[]).map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <TimeInput value={r.time ?? ""} disabled={!canType} onChange={(e) => set(p, { time: e.target.value })} placeholder={time} inputMode="numeric" aria-label={`${p.name}の測った時刻`} className="w-14 rounded border border-rule bg-paper px-1 py-0.5 text-right text-[12px]" />
                </td>
                <td className="px-1.5 py-1 text-[11px]">
                  {parsed.errors.map((x) => (
                    <div key={x} className="text-shu">
                      {x}
                    </div>
                  ))}
                  {r.time && !timeOk(r.time) && !parsed.errors.length && <div className="text-shu">いまより前の時刻にしてください</div>}
                  {warns.map((w) => (
                    <div key={w.text} className={w.basis === "指示簿" ? "font-bold text-shu" : "text-yamabuki"}>
                      {displayText(w.text)}
                    </div>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {canType && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
          <button
            type="button"
            disabled={!save.length || bad.length > 0 || lateRow.length > 0 || !timeOk(time)}
            onClick={() => {
              onSave(save);
              setRows((all) => Object.fromEntries(Object.entries(all).filter(([id]) => !save.some((s) => s.patientId === id))));
            }}
            className="rounded-md bg-ai px-4 py-1.5 font-bold text-white disabled:opacity-40"
          >
            入れた {save.length}人分を確定（{me.name}）
          </button>
          {bad.length > 0 && <span className="text-shu">直すところのある行が {bad.length}行あります</span>}
          {!timeOk(time) && <span className="text-shu">測った時刻は「14:20」のように、いまより前にしてください</span>}
        </div>
      )}

    </section>
  );
}

/* Help migration source (references and dynamic wording):
<p >測った患者の行だけ入れます（空の行は記録しません）。時刻が違う患者は、行の右の時刻に入れます。確定すると、カルテのバイタルと同じ記録に入ります。</p>
<ul >
        <li>知らせの根拠：{BULK_SOURCES.calls}。</li>
        <li>{BULK_SOURCES.news2}。どう動くかは病棟の取り決めと医師の判断です。</li>
        <li>数のほかに確かめるのは、SpO2 が100より上・血圧の下が上より高い・片方だけ・時刻の形（打ち間違いを拾うためで、医学の基準ではありません）。</li>
      </ul>
*/
