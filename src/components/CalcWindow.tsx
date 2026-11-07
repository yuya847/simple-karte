"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, ClipboardPaste, RotateCcw } from "lucide-react";
import { CALC_GROUPS, CALCS, prefillOf, resolveValues, type CalcDef, type Ctx, type Field, type Filled, type Outcome, type Values } from "@/lib/calc/catalog";
import type { CalendarDate } from "@/lib/dates";
import { abs } from "@/lib/flowsheet";
import type { IcuRecords } from "@/lib/icu/types";
import type { HistoryEntry, Patient } from "@/lib/types";
import { useWindowEntry } from "@/lib/window-entry";

/** 最後に開いた計算（この端末だけ）。 */
const LAST_KEY = "simple-karte:calc:last";
function loadLast(): string {
  try {
    const v = window.localStorage.getItem(LAST_KEY);
    return v && CALCS.some((c) => c.key === v) ? v : CALCS[0].key;
  } catch {
    return CALCS[0].key;
  }
}
function saveLast(key: string) {
  try {
    window.localStorage.setItem(LAST_KEY, key);
  } catch {
    // 覚えられないだけで、計算はそのまま使える。
  }
}

type Overrides = Record<string, Record<string, string>>;

interface Props {
  patient: Patient;
  entries: HistoryEntry[];
  today: CalendarDate;
  nowTime: string;
  /** ICU 記録（今より後の時間表を除いたもの）。ICU にいない患者は空。 */
  icu: IcuRecords;
  /** 記事に1行を入れる。書けない職種には渡さない。 */
  onInsert?: (line: string) => void;
  /** 一覧の「抗菌薬の量」から、その道具を開く。 */
  onOpenTool: (key: "abx-renal") => void;
}

interface Row {
  def: CalcDef;
  filled: Record<string, Filled | null>;
  notes: Record<string, string>;
  values: Values;
  out: Outcome;
}

/**
 * 計算：左に一覧、右に選んだ計算。欄の初期値はカルテから入り、押して入れ直せる。結果はその場で出し直し、
 * 「記事に入れる」で1行を今日の記事の O) に入れる。式と出典は「使い方」。
 */
export function CalcWindow({ patient, entries, today, nowTime, icu, onInsert, onOpenTool }: Props) {
  const [selected, setSelected] = useState(loadLast);
  const [overrides, setOverrides] = useWindowEntry<Overrides>("calc-overrides", {});
  const ctx: Ctx = useMemo(() => ({ patient, nowAbs: abs(0, nowTime), today, icu, icuId: patient.id.startsWith("er:") ? patient.id.slice(3) : patient.id, entries }), [patient, nowTime, today, icu, entries]);
  const prefills = useMemo(() => Object.fromEntries(CALCS.map((def) => [def.key, { filled: prefillOf(def, ctx), notes: def.notes?.(ctx) ?? {} }])), [ctx]);
  const rows: Row[] = CALCS.map((def) => {
    const { filled, notes } = prefills[def.key];
    const values = resolveValues(def, filled, overrides[def.key]);
    return { def, filled, notes, values, out: def.compute(values, ctx) };
  });
  const row = rows.find((r) => r.def.key === selected) ?? rows[0];
  const choose = (key: string) => {
    setSelected(key);
    saveLast(key);
  };
  const set = (field: string, value: string) =>
    setOverrides((all) => {
      const mine = { ...(all[row.def.key] ?? {}) };
      if (value === (row.filled[field]?.value ?? "")) delete mine[field];
      else mine[field] = value;
      return { ...all, [row.def.key]: mine };
    });
  const reset = (field: string) =>
    setOverrides((all) => {
      const mine = { ...(all[row.def.key] ?? {}) };
      delete mine[field];
      return { ...all, [row.def.key]: mine };
    });

  return (
    <div aria-label="計算" className="flex min-h-[520px] items-start text-[13px]">
      <nav aria-label="計算の一覧" className="scroll-thin sticky -top-3 -mt-3 max-h-[calc(100vh-140px)] w-44 shrink-0 self-start overflow-y-auto border-r border-rule pr-2 pt-2">
        {CALC_GROUPS.map((g) => (
          <div key={g} className="mb-1">
            <p className="px-2 pb-0.5 pt-2 text-[10px] text-ink-faint">{g}</p>
            {rows.filter((r) => r.def.group === g).map((r) => {
              const on = r.def.key === row.def.key;
              const first = r.out.results[0];
              const summary = first && first.value !== null && !first.faint ? first.value : "";
              return (
                <button key={r.def.key} type="button" aria-current={on || undefined} onClick={() => choose(r.def.key)} className={`flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1 text-left ${on ? "bg-ai text-white" : "text-ink hover:bg-paper"}`}>
                  <span className="truncate">{r.def.name}</span>
                  <span className={`nums shrink-0 text-[12px] ${on ? "text-white" : "text-ink-soft"}`}>{summary}</span>
                </button>
              );
            })}
            {g === "薬" && (
              <button type="button" onClick={() => onOpenTool("abx-renal")} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-ink hover:bg-paper">
                <span>抗菌薬の量</span>
                <ArrowUpRight size={13} className="shrink-0 text-ink-faint" />
              </button>
            )}
          </div>
        ))}
      </nav>
      <section aria-label={row.def.name} className="min-w-0 flex-1 pl-4">
        <div className="sticky -top-3 z-10 -mt-3 bg-sheet pb-1 pt-3">
          <h3 className="text-[15px] font-bold">{row.def.name}</h3>
          <ResultCard out={row.out} onInsert={onInsert} />
        </div>
        <div className="mt-1">
          {fieldRows(row.def.fields.filter((f) => !f.show || f.show(row.values))).map((fs) => (
            <div key={fs[0].key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-rule-soft py-1.5">
              {fs.map((f, i) => (
                <FieldInput key={f.key} field={f} first={i === 0} value={row.values[f.key] ?? ""} filled={row.filled[f.key] ?? null} note={row.notes[f.key]} overridden={!!overrides[row.def.key] && f.key in overrides[row.def.key]} onChange={(v) => set(f.key, v)} onReset={() => reset(f.key)} />
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/** 同じ row の欄をまとめる（並びは定義の順）。 */
function fieldRows(fields: Field[]): Field[][] {
  const out: Field[][] = [];
  for (const f of fields) {
    const last = out.at(-1);
    if (f.row && last && last[0].row === f.row) last.push(f);
    else out.push([f]);
  }
  return out;
}

function ResultCard({ out, onInsert }: { out: Outcome; onInsert?: (line: string) => void }) {
  return (
    <div className="mt-2 rounded-md border border-rule bg-sheet px-3 py-2.5">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        {out.results.map((r, i) => (
          <div key={i} className="min-w-0">
            {r.label && <p className="text-[11px] text-ink-soft">{r.label}</p>}
            <p className={`nums leading-none ${r.faint ? "text-ink-faint" : "text-ink"}`}>
              <b className="text-[30px] font-bold">{r.value ?? "—"}</b>
              {r.unit && <span className="ml-1 text-[12px] text-ink-soft">{r.unit}</span>}
            </p>
          </div>
        ))}
        <button
          type="button"
          disabled={!onInsert || !out.line}
          title={out.line ?? undefined}
          onClick={() => out.line && onInsert?.(out.line)}
          className="ml-auto inline-flex min-h-8 items-center gap-1.5 rounded-md bg-ai px-3 text-[12px] font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ClipboardPaste size={14} />
          記事に入れる
        </button>
      </div>
      {(!!out.parts?.length || !!out.missing?.length) && (
        <p className="mt-2 flex flex-wrap gap-1 text-[11px]">
          {out.parts?.map((p) => (
            <span key={p} className="nums rounded bg-paper px-1.5 py-0.5 text-ink-soft">{p}</span>
          ))}
          {!!out.missing?.length && <span className="rounded bg-yamabuki-soft px-1.5 py-0.5 text-yamabuki">未選択 {out.missing.join("・")}</span>}
        </p>
      )}
    </div>
  );
}

function FieldInput({ field, first, value, filled, note, overridden, onChange, onReset }: { field: Field; first: boolean; value: string; filled: Filled | null; note?: string; overridden: boolean; onChange: (v: string) => void; onReset: () => void }) {
  const label = <span className={first ? "w-36 shrink-0 text-ink-soft" : "text-ink-soft"}>{field.label}</span>;
  // 「入力」の札は、カルテの値を入れ直したときだけ（初期値のない欄は押し直すだけ）。
  const source = overridden && filled ? (
    <button type="button" onClick={onReset} title={`カルテの値（${filled.value}）に戻す`} className="inline-flex items-center gap-0.5 rounded border border-fuji px-1 text-[10px] leading-4 text-fuji hover:bg-fuji-soft">
      <RotateCcw size={10} />
      入力
    </button>
  ) : (!overridden && filled?.from) || note ? (
    <span className="text-[11px] text-ink-faint">{(!overridden && filled?.from) || note}</span>
  ) : null;
  if (field.kind === "num")
    return (
      <span className="flex items-center gap-1.5">
        <label className="contents">
          {label}
          <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" autoComplete="off" aria-label={field.label} className="nums w-20 rounded border border-rule bg-sheet px-2 py-1 text-right focus:border-ai focus:outline-none" />
        </label>
        {field.unit && <span className="text-[11px] text-ink-faint">{field.unit}</span>}
        {source}
      </span>
    );
  const yn = field.options.every((o) => o.value === "あり" || o.value === "なし");
  return (
    <span className={first ? "flex w-full min-w-0 items-start gap-1.5" : "flex min-w-0 items-center gap-1.5"}>
      <span className={first ? "w-36 shrink-0 pt-1 text-ink-soft" : "text-ink-soft"}>{field.label}</span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        <span role="radiogroup" aria-label={field.label} className="contents">
          {field.options.map((o) => {
            const on = value === o.value;
            const prefix = field.numbered ? o.value : !yn && o.points !== undefined ? String(o.points) : null;
            return (
              <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(on ? "" : o.value)} className={`inline-flex min-h-7 items-center gap-1 rounded-md border px-2.5 py-0.5 text-[12px] ${on ? "border-ai bg-ai text-white" : "border-rule bg-sheet text-ink hover:border-ai"}`}>
                {prefix !== null && <b className={`nums ${on ? "text-white" : "text-ink-soft"}`}>{prefix}</b>}
                {o.label}
                {yn && (o.points ?? 0) > 1 && <span className={`nums text-[10px] ${on ? "text-white" : "text-ink-faint"}`}>+{o.points}</span>}
              </button>
            );
          })}
        </span>
        {source}
      </span>
    </span>
  );
}
