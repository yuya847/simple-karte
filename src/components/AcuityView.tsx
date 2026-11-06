"use client";

import { displayText } from "@/lib/display-text";
import { useState } from "react";
import { B_ITEMS, FICTIONAL_AMBULANCE_PER_YEAR, WARD_STANDARD, bFor, bNeeded, evaluateDay, responseCoefficient, type BKey, type BRecord, type DayEval } from "@/lib/acuity";
import { STAFF } from "@/lib/roles";
import { HOSPITAL } from "@/lib/billing/facility";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { abs } from "@/lib/flowsheet";
import type { WorkPatient } from "@/lib/worksheet";

interface Props {
  people: WorkPatient[];
  today: CalendarDate;
  nowTime: string;
  records: BRecord[];
  ambulance: Record<string, boolean>;
  /** All three meals of the day are 絶食 (B11 is then 全介助・実施なし). */
  fasting: (patientId: string, day: number) => boolean;
  onSave: (r: BRecord) => void;
}

/** The ward's 重症度、医療・看護必要度: this month by patient and day, details, and B entry. */
export function AcuityView({ people, today, nowTime, records, ambulance, fasting, onSave }: Props) {
  const nowAbs = abs(0, nowTime);
  const first = -(today.d - 1); // the 1st of this month as a day offset
  const days = Array.from({ length: -first + 1 }, (_, i) => first + i);
  const [sel, setSel] = useState<{ pid: string; day: number }>({ pid: people[0]?.patient.id ?? "", day: 0 });
  const evals: Record<string, Record<number, DayEval>> = {};
  let denom = 0;
  let numer = 0;
  for (const x of people) {
    evals[x.patient.id] = {};
    for (const d of days) {
      if (d < x.patient.admittedOn) continue;
      const e = evaluateDay(x.entries, records, x.patient.id, d, { admittedOn: x.patient.admittedOn, ambulance: !!ambulance[x.patient.id], nowAbs });
      evals[x.patient.id][d] = e;
      denom++;
      if (e.meets) numer++;
    }
  }
  const coef = responseCoefficient(FICTIONAL_AMBULANCE_PER_YEAR, HOSPITAL.beds.general);
  const rate = denom ? numer / denom : 0;
  const person = people.find((x) => x.patient.id === sel.pid);
  const cur = evals[sel.pid]?.[sel.day];
  return (
    <main className="scroll-thin mx-auto w-full max-w-6xl flex-1 overflow-auto px-5 py-4 text-[13px]">
      <header className="mb-3 flex flex-wrap items-baseline gap-3">
        <h1 className="text-lg font-bold">重症度、医療・看護必要度</h1>
        <span className="text-ink-soft">
          {WARD_STANDARD.base}・{WARD_STANDARD.method}（令和8年度。該当：A2点以上かつB3点以上／A3点以上／C1点以上）
        </span>
      </header>
      <div className="mb-3 flex flex-wrap gap-4 rounded-md border border-rule bg-sheet p-3">
        <div>
          <div className="text-[11px] text-ink-faint">今月の該当（受け持ち{people.length}人）</div>
          <b className="text-lg">{(rate * 100).toFixed(1)}%</b>
          <span className="ml-1 text-ink-soft">
            （{numer}／{denom} 日）
          </span>
        </div>
        <div>
          <div className="text-[11px] text-ink-faint">救急患者応需係数（年{FICTIONAL_AMBULANCE_PER_YEAR.toLocaleString()}件 ÷ {HOSPITAL.beds.general}床 × 0.005）</div>
          <b className="text-lg">＋{(coef * 100).toFixed(1)}%</b>
        </div>
        <div>
          <div className="text-[11px] text-ink-faint">割合指数（基準 {WARD_STANDARD.threshold * 100}% 以上）</div>
          <b className={`text-lg ${rate + coef >= WARD_STANDARD.threshold ? "text-wakatake" : "text-shu"}`}>{((rate + coef) * 100).toFixed(1)}%</b>
        </div>
        <p className="w-full text-[10px] text-ink-faint">
          この試作では受け持ちの患者だけで数えています（本当は病棟の全員の延べ日数。退院日は延べ患者数に入れない）。基準の割合は直近3か月で見ます。A・C項目はオーダから、B項目は看護師の入力から、コードで判定します。
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="nums border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-paper px-2 text-left font-normal text-ink-faint">患者</th>
              {days.map((d) => (
                <th key={d} className={`px-1 font-normal ${d === 0 ? "text-ai" : "text-ink-faint"}`}>
                  {addDays(today, d).d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((x) => (
              <tr key={x.patient.id} className="border-t border-rule-soft">
                <td className="sticky left-0 whitespace-nowrap bg-paper px-2 py-1">
                  {x.room} {x.patient.name}
                </td>
                {days.map((d) => {
                  const e = evals[x.patient.id][d];
                  if (!e) return <td key={d} />;
                  const need = bNeeded(records, x.patient.id, x.patient.admittedOn, d) && !e.bMeasured;
                  const active = sel.pid === x.patient.id && sel.day === d;
                  return (
                    <td key={d} className="p-0.5">
                      <button
                        type="button"
                        onClick={() => setSel({ pid: x.patient.id, day: d })}
                        title={`A${e.aScore} B${e.bScore} C${e.cScore}${e.meets ? " 該当" : ""}${need ? "（B の測定が要る日）" : ""}`}
                        className={`h-9 w-11 rounded border text-[10px] leading-tight ${active ? "border-ai ring-2 ring-ai/40" : "border-rule"} ${e.meets ? "bg-wakatake-soft" : "bg-sheet"}`}
                      >
                        <div>
                          A{e.aScore} B{e.bScore}
                        </div>
                        <div>
                          C{e.cScore} {e.meets ? "●" : ""}
                          {need ? <span className="text-yamabuki">!</span> : ""}
                        </div>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[10px] text-ink-faint">● 該当　! B の測定が要る日（入院1〜4日目は毎日、その後は7日ごとに1回以上。令和8年度）。測定しない日は直近の評価を使います。</p>

      {person && cur && (
        <Detail
          key={`${sel.pid}-${sel.day}`}
          person={person}
          today={today}
          e={cur}
          record={bFor(records, sel.pid, sel.day)}
          fasting={fasting(sel.pid, sel.day)}
          onSave={(state, assist) => onSave({ patientId: sel.pid, day: sel.day, state, assist, by: STAFF.看護師.name })}
        />
      )}
    </main>
  );
}

function Detail({ person, today, e, record, fasting, onSave }: { person: WorkPatient; today: CalendarDate; e: DayEval; record?: BRecord; fasting: boolean; onSave: (s: Record<BKey, number>, a: Partial<Record<BKey, 0 | 1>>) => void }) {
  const [state, setState] = useState<Record<BKey, number>>(record?.state ?? { b8: 0, b9: 0, b10: 0, b11: 0, b12: 0, b13: 0, b14: 0 });
  const [assist, setAssist] = useState<Partial<Record<BKey, 0 | 1>>>(record?.assist ?? {});
  const carried = record && record.day !== e.day;
  return (
    <section className="mt-4 grid gap-4 rounded-md border border-rule bg-sheet p-4 md:grid-cols-2">
      <div>
        <h3 className="font-bold">
          {person.patient.name}　{formatShort(addDays(today, e.day))}（入院{e.day - person.patient.admittedOn + 1}日目）
        </h3>
        <h4 className="mt-2 text-xs font-bold text-ink-soft">A項目（オーダからコードで判定）　{e.aScore}点</h4>
        {e.a.length ? (
          <ul className="text-xs">
            {e.a.map((h) => (
              <li key={h.no}>
                {displayText(h.no)} {h.name}：{h.points}点 <span className="text-ink-faint">— {h.why}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-faint">該当なし</p>
        )}
        <h4 className="mt-2 text-xs font-bold text-ink-soft">C項目　{e.cScore}点</h4>
        {e.c.length ? (
          <ul className="text-xs">
            {e.c.map((h) => (
              <li key={h.no}>
                {displayText(h.no)} {h.name} <span className="text-ink-faint">— {h.why}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-faint">該当なし</p>
        )}
        <p className={`mt-3 font-bold ${e.meets ? "text-wakatake" : "text-ink-soft"}`}>{e.meets ? "該当" : "非該当"}（A{e.aScore}・B{e.bScore}・C{e.cScore}）</p>
      </div>
      <div>
        <h4 className="text-xs font-bold text-ink-soft">
          B項目（看護師が入れる）{carried ? `　いまは ${formatShort(addDays(today, record!.day))} の評価を使っています` : record ? "" : "　記録なし（最も自立度の高い評価）"}
        </h4>
        <table className="mt-1 text-xs">
          <tbody>
            {B_ITEMS.map((it) => (
              <tr key={it.key}>
                <td className="pr-2">
                  {displayText(it.no)} {it.name}
                </td>
                <td className="pr-2">
                  <select value={state[it.key]} onChange={(ev) => setState({ ...state, [it.key]: Number(ev.target.value) })} className="rounded border border-rule bg-paper px-1">
                    {it.states.map((s) => (
                      <option key={s.label} value={s.points}>
                        {s.label}（{s.points}）
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {it.assist && (
                    <select value={assist[it.key] ?? 0} onChange={(ev) => setAssist({ ...assist, [it.key]: Number(ev.target.value) as 0 | 1 })} className="rounded border border-rule bg-paper px-1" aria-label={`${it.name}の介助の実施`}>
                      <option value={0}>介助 実施なし（0）</option>
                      <option value={1}>介助 実施あり（1）</option>
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {fasting && (
          <button type="button" onClick={() => (setState({ ...state, b11: 2 }), setAssist({ ...assist, b11: 0 }))} className="mt-1 text-xs text-ai underline">
            この日は絶食：B11 を「全介助・実施なし」にする（評価の手引き）
          </button>
        )}
        <button type="button" onClick={() => onSave(state, assist)} className="mt-2 block rounded bg-ai px-3 py-1 text-xs font-bold text-white">
          この日の B項目を確定
        </button>
      </div>
    </section>
  );
}
