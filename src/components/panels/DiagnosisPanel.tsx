"use client";

import { Search, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { UNCODED, diagnosisLabel, type Diagnosis, type Modifier, type Outcome } from "@/lib/diagnoses";
import type { DayOffset } from "@/lib/types";

interface Hit {
  code: string;
  name: string;
  kana: string;
  icd10: string;
  noStandalone?: boolean;
  notClaimable?: boolean;
  position?: "prefix" | "suffix";
}

// Frequently used modifiers (codes from the official 修飾語マスター).
const QUICK: (Modifier & { position: "prefix" | "suffix" })[] = [
  { code: "2056", name: "右", position: "prefix" },
  { code: "2049", name: "左", position: "prefix" },
  { code: "2058", name: "両側", position: "prefix" },
  { code: "4012", name: "急性", position: "prefix" },
  { code: "4043", name: "慢性", position: "prefix" },
  { code: "8002", name: "の疑い", position: "suffix" },
];

const OUTCOMES: Outcome[] = ["継続", "治癒", "死亡", "中止"];

interface Props {
  diagnoses: Diagnosis[];
  admittedOn: DayOffset;
  today: CalendarDate;
  onChange: (next: Diagnosis[]) => void;
  newId: () => string;
}

/** Register diagnoses from the official 傷病名マスター, with modifiers, start day and outcome. */
export function DiagnosisPanel({ diagnoses, admittedOn, today, onChange, newId }: Props) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ diseases: Hit[]; modifiers: Hit[] }>({ diseases: [], modifiers: [] });
  const [picked, setPicked] = useState<Hit | null>(null);
  const [prefixes, setPrefixes] = useState<Modifier[]>([]);
  const [suffixes, setSuffixes] = useState<Modifier[]>([]);
  const [start, setStart] = useState<DayOffset>(0);
  const [main, setMain] = useState(false);

  useEffect(() => {
    const s = q.trim();
    if (!s) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/byomei?q=${encodeURIComponent(s)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then(setHits)
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const days: DayOffset[] = [];
  for (let d = 0; d >= Math.min(admittedOn, 0); d--) days.push(d);

  const addModifier = (m: Modifier & { position?: "prefix" | "suffix" }) => {
    if (m.position === "suffix") setSuffixes((s) => (s.some((x) => x.code === m.code) ? s : [...s, { code: m.code, name: m.name }]));
    else setPrefixes((s) => (s.some((x) => x.code === m.code) ? s : [...s, { code: m.code, name: m.name }]));
  };

  const add = () => {
    if (!picked) return;
    onChange([
      ...diagnoses,
      { id: newId(), code: picked.code, name: picked.name, icd10: picked.icd10, prefixes, suffixes, main, start, outcome: "継続" },
    ]);
    setPicked(null);
    setPrefixes([]);
    setSuffixes([]);
    setMain(false);
    setQ("");
    setHits({ diseases: [], modifiers: [] });
  };

  const update = (id: string, patch: Partial<Diagnosis>) => onChange(diagnoses.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-sm font-bold">登録している病名</h3>
        {diagnoses.length === 0 ? (
          <p className="text-sm text-ink-faint">まだありません</p>
        ) : (
          <table className="nums w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-rule text-left text-[11px] text-ink-faint">
                <th className="py-1 font-normal">主</th>
                <th className="py-1 font-normal">病名</th>
                <th className="py-1 font-normal">ICD-10</th>
                <th className="py-1 font-normal">開始</th>
                <th className="py-1 font-normal">転帰</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {diagnoses.map((d) => (
                <tr key={d.id} className="border-b border-rule-soft align-top">
                  <td className="py-1.5">
                    <button type="button" onClick={() => update(d.id, { main: !d.main })} title="主病名" aria-pressed={d.main} className={d.main ? "text-yamabuki" : "text-ink-faint/50 hover:text-ink-faint"}>
                      <Star size={15} fill={d.main ? "currentColor" : "none"} />
                    </button>
                  </td>
                  <td className="py-1.5">
                    <span className={d.outcome !== "継続" ? "text-ink-faint" : "font-bold"}>{diagnosisLabel(d)}</span>
                    <div className="text-[10px] text-ink-faint">
                      {d.code === UNCODED ? (
                        <button type="button" onClick={() => setQ(d.name)} className="font-bold text-yamabuki hover:underline">
                          未コード化傷病名（マスターから選び直す）
                        </button>
                      ) : (
                        <>コード {[...d.prefixes.map((m) => m.code), d.code, ...d.suffixes.map((m) => m.code)].join(" ")}</>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 text-[12px]">{d.icd10 ?? "—"}</td>
                  <td className="whitespace-nowrap py-1.5 text-[12px]">{formatShort(addDays(today, d.start))}</td>
                  <td className="py-1.5">
                    <select
                      value={d.outcome}
                      onChange={(e) => {
                        const o = e.target.value as Outcome;
                        update(d.id, { outcome: o, outcomeDay: o === "継続" ? undefined : 0 });
                      }}
                      className="rounded border border-rule bg-sheet px-1 py-0.5 text-[12px]"
                      aria-label={`${diagnosisLabel(d)} の転帰`}
                    >
                      {OUTCOMES.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                    {d.outcomeDay !== undefined && <div className="text-[10px] text-ink-faint">{formatShort(addDays(today, d.outcomeDay))}</div>}
                  </td>
                  <td className="py-1.5 text-right">
                    <button type="button" onClick={() => onChange(diagnoses.filter((x) => x.id !== d.id))} title="削除" className="text-ink-faint hover:text-shu">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-lg border border-rule p-3">
        <h3 className="mb-2 text-sm font-bold">病名を追加（傷病名マスターから）</h3>
        <label className="flex items-center gap-2 rounded-md border border-rule bg-sheet px-2 py-1.5">
          <Search size={14} className="text-ink-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="病名・読み（例：かたいほうそうえん、MRSA）"
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </label>

        {q.trim() && hits.diseases.length > 0 && (
          <ul className="mt-2 max-h-48 overflow-y-auto rounded-md border border-rule-soft">
            {hits.diseases.map((h) => (
              <li key={h.code}>
                <button
                  type="button"
                  onClick={() => setPicked(h)}
                  className={`nums flex w-full items-baseline gap-2 px-2 py-1 text-left text-[13px] ${picked?.code === h.code ? "bg-ai text-white" : "hover:bg-paper"}`}
                >
                  <span className="font-bold">{h.name}</span>
                  <span className={`text-[11px] ${picked?.code === h.code ? "text-white/80" : "text-ink-faint"}`}>
                    {h.icd10}　{h.code}
                    {h.notClaimable ? "　保険請求外" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {q.trim() && hits.modifiers.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
            <span className="text-ink-faint">修飾語：</span>
            {hits.modifiers.slice(0, 10).map((m) => (
              <button key={m.code} type="button" onClick={() => addModifier(m)} className="rounded border border-rule px-1.5 hover:border-ai">
                {m.name}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-1 text-[11px]">
          <span className="text-ink-faint">よく使う修飾語：</span>
          {QUICK.map((m) => (
            <button key={m.code} type="button" onClick={() => addModifier(m)} className="rounded border border-rule px-1.5 hover:border-ai">
              {m.name}
            </button>
          ))}
        </div>

        <div className="mt-3 rounded-md bg-paper px-3 py-2 text-[13px]">
          <div className="text-[11px] text-ink-faint">登録する病名</div>
          <div className="font-bold">
            {picked ? diagnosisLabel({ name: picked.name, prefixes, suffixes }) : <span className="font-normal text-ink-faint">上の一覧から選んでください</span>}
          </div>
          {(prefixes.length > 0 || suffixes.length > 0) && (
            <button type="button" onClick={() => (setPrefixes([]), setSuffixes([]))} className="text-[11px] text-ink-soft hover:text-shu">
              修飾語を外す
            </button>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
            <label className="flex items-center gap-1">
              開始日
              <select value={start} onChange={(e) => setStart(Number(e.target.value))} className="rounded border border-rule bg-sheet px-1 py-0.5">
                {days.map((d) => (
                  <option key={d} value={d}>
                    {formatShort(addDays(today, d))}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={main} onChange={() => setMain(!main)} className="accent-ai" />
              主病名
            </label>
            <button type="button" disabled={!picked} onClick={add} className="ml-auto rounded-md bg-ai px-4 py-1.5 text-sm font-bold text-white disabled:bg-ai/40">
              登録
            </button>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-ink-faint">病名と修飾語は、厚生労働省の傷病名マスター・修飾語マスターの名称とコードをそのまま使います。</p>
      </section>
    </div>
  );
}
