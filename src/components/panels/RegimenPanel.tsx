"use client";
import { displayText } from "@/lib/display-text";
import { INJECTION_TIME_OPTIONS } from "@/lib/inj-entry";
import { DayInput } from "../DayInput";
import { TimeInput } from "@/components/TimeInput";

import { useEffect, useRef, useState } from "react";
import { TabChoice } from "../TabChoice";
import type { Draft } from "@/lib/drafts";
import { findDrug } from "@/lib/master";
import {
  BSA_RULE,
  GFR_RULE,
  HOSPITAL_RULE,
  REDUCTIONS,
  REGIMENS,
  addMinutes,
  bsaDuBois,
  findRegimen,
  gfrForCalvert,
  planRegimen,
  regimenDrafts,
  type DoseLine,
  type RegimenRp,
  type Source,
  type Warn,
} from "@/lib/regimen";

export interface RegimenPatient {
  sex: "男" | "女";
  age: number;
  heightCm?: number;
  weightKg?: number;
  /** Latest serum creatinine (mg/dL) from the chart. */
  cre: number | null;
}

const DAY_WORD: Record<number, string> = { 0: "今日", 1: "明日", 2: "明後日" };
const num = (n: number) => String(Math.round(n * 100) / 100);
const minutesText = (m: number) => (m < 60 ? `${m}分` : m % 60 ? `${Math.floor(m / 60)}時間${m % 60}分` : `${m / 60}時間`);

function SourceLink({ s }: { s: Source }) {
  return (
    <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-ai">
      {s.label}
    </a>
  );
}

function Sources({ list }: { list: Source[] }) {
  if (!list.length) return null;
  return (
    null
  );
}

const WARN_CLASS: Record<Warn["level"], string> = { stop: "font-bold text-shu", warn: "font-bold text-yamabuki", info: "text-ink-soft" };

function WarnLine({ w }: { w: Warn }) {
  return (
    <p className={`text-[11px] ${WARN_CLASS[w.level]}`}>
      {w.level === "info" ? "・" : "！"}
      {displayText(w.text)}
      {w.source && (
        <span className="ml-1 font-normal text-ink-faint">
          （<SourceLink s={w.source} />）
        </span>
      )}
    </p>
  );
}

/** The drip rate of an Rp from its solvent and time (the drugs' own volume is left out, as on the order). */
function rateText(rp: RegimenRp): string | null {
  if (rp.route !== "点滴静注" || !rp.minutes || !rp.solvent) return null;
  const rate = Math.round((rp.solvent.ml / (rp.minutes / 60)) * 10) / 10;
  return `${rp.solvent.ml}mL ÷ ${minutesText(rp.minutes)} = ${rate}mL/時`;
}

/**
 * レジメンの欄：院内登録レジメンを選び、コース・day・開始・減量率を医師が選ぶ（最初から選ばれて
 * いるものはない）。体表面積・GFR・各薬の量・溶媒・時刻はコードが式つきで計算し、出典を出す。
 * 身長・体重・Cre はカルテの値。1日分を注射の下書きにし、ほかの下書きと同じ確認を通して確定する。
 */
export function RegimenPanel({ patient, onAdd, newId }: { patient: RegimenPatient; onAdd: (drafts: Draft[]) => void; newId: () => string }) {
  const [code, setCode] = useState<string | null>(null);
  const [course, setCourse] = useState<number | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [startDay, setStartDay] = useState<number | null>(null);
  const [time, setTime] = useState("");
  const [reductions, setReductions] = useState<Record<string, number>>({});
  const [made, setMade] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.querySelector<HTMLElement>("[role=radio]")?.focus();
  }, []);

  const regimen = code ? (findRegimen(code) ?? null) : null;
  const plan = regimen && day !== null ? planRegimen(regimen, day, patient, reductions) : null;
  const chooseRegimen = (c: string) => {
    if (c === code) return;
    const r = findRegimen(c)!;
    setCode(c);
    setCourse(null);
    // A regimen given on one day only has nothing to choose.
    setDay(r.days.length === 1 ? r.days[0] : null);
    setReductions({});
    setMade(null);
  };
  const choices = [
    !regimen && "レジメン",
    regimen && course === null && "コース",
    regimen && day === null && "day",
    startDay === null && "開始日",
    !time && "開始時刻",
  ].filter((x): x is string => !!x);
  const ready = choices.length === 0 && !!plan?.ready;
  const drafts = () => (ready && plan ? regimenDrafts(plan, { course: course!, start: { day: startDay!, time }, newId }) : []);
  const submit = () => {
    const d = drafts();
    if (!d.length) return;
    onAdd(d);
    setMade(`${regimen!.name} ${course}コース目 day${day} を ${d.length} 本の下書きにしました。右の下書きで確認して確定してください。`);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  const missingBody = [!patient.heightCm && "身長", !patient.weightKg && "体重", patient.cre === null && "Cre"].filter((x): x is string => !!x);
  const bsa = patient.heightCm && patient.weightKg ? bsaDuBois(patient.heightCm, patient.weightKg) : null;
  const gfr = gfrForCalvert(patient);
  const at = (rp: RegimenRp) => {
    if (startDay === null || !time) return `開始から ${rp.at}分`;
    const t = addMinutes({ day: startDay, time }, rp.at);
    return `${DAY_WORD[t.day] ?? `${t.day}日後`} ${t.time}`;
  };
  const lineOf = (rp: RegimenRp) => plan?.lines.filter((l) => l.rp === rp) ?? [];
  const field = "rounded border border-rule bg-paper px-1 py-0.5 outline-none focus:border-ai";
  const row = (label: string, children: React.ReactNode) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-16 shrink-0 text-ink-soft">{label}</span>
      {children}
    </div>
  );

  return (
    <div ref={root} onKeyDown={onKeyDown} className="space-y-3 text-[12px]">


      <section className="space-y-0.5 rounded-md border border-rule bg-paper p-2">
        <h3 className="text-[11px] font-bold text-ink-soft">カルテの値</h3>
        <p className="nums">
          {patient.age}歳 {patient.sex}性　身長 {patient.heightCm ? `${num(patient.heightCm)}cm` : "—"}　体重 {patient.weightKg ? `${num(patient.weightKg)}kg` : "—"}　Cre {patient.cre !== null ? `${num(patient.cre)}mg/dL` : "—"}
        </p>
        {missingBody.length > 0 && (
          <p className="font-bold text-shu">
            {missingBody.join("・")}がカルテにありません。
            {[!patient.heightCm || !patient.weightKg ? "体表面積（mg/m² の薬）" : "", !patient.weightKg || patient.cre === null ? "GFR（カルボプラチン）" : ""].filter(Boolean).join("と")}
            は計算しません。カルテに入れてから選び直してください。
          </p>
        )}
        {bsa && (
          <p className="nums text-ai">
            体表面積（{BSA_RULE.name}）{bsa.formula}
          </p>
        )}
        {gfr && (
          <p className="nums text-ai">
            CCr（Cockcroft-Gault）{gfr.formula}{gfr.capped && <b className="ml-1 text-yamabuki">→ GFR は上限の {GFR_RULE.capMlMin}mL/分で計算</b>}
          </p>
        )}

      </section>

      <section className="space-y-1.5">
        {row(
          "レジメン",
          <TabChoice label="レジメン" options={REGIMENS.map((r) => ({ value: r.code, label: r.name, title: `${r.disease}　${r.cycle}` }))} value={code} onChange={chooseRegimen} />,
        )}
        {regimen && (
          <p className="pl-[4.375rem] text-[11px] text-ink-soft">
            {regimen.disease}　{regimen.cycle}（院内登録レジメン）　<Sources list={regimen.sources} />
          </p>
        )}
        {regimen &&
          row(
            "コース",
            <>
              <TabChoice label="コース" options={Array.from({ length: regimen.maxCourses }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} value={course} onChange={(v) => setCourse(v)} />
              コース目
            </>,
          )}
        {regimen &&
          row(
            "day",
            <>
              <TabChoice label="day" options={regimen.days.map((d) => ({ value: d, label: `day${d}` }))} value={day} onChange={(v) => setDay(v)} />
              {regimen.days.length === 1 && <span className="text-[11px] text-ink-faint">このレジメンは day1 だけです</span>}
            </>,
          )}
        {row(
          "開始",
          <>
            <TabChoice
              label="開始日"
              options={[
                { value: 0, label: "今日" },
                { value: 1, label: "明日" },
              ]}
              value={startDay}
              onChange={(v) => setStartDay(v)}
            /><DayInput label="レジメンの開始日付" value={startDay} onChange={setStartDay} />
            <TimeInput options={INJECTION_TIME_OPTIONS} value={time} onChange={(e) => setTime(e.target.value)} aria-label="開始時刻（最初の Rp）" className={field} />
            <span className="text-[11px] text-ink-faint">最初の Rp の時刻。ほかの Rp の時刻はここから計算します</span>
          </>,
        )}
      </section>

      {plan && (
        <section className="space-y-1">
          <h3 className="text-[11px] font-bold text-ink-soft">
            量の計算（day{plan.day}）<span className="font-normal text-ink-faint">　まるめ・投与順・時刻・溶媒の量は{HOSPITAL_RULE}</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="nums w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-rule text-left text-[11px] text-ink-soft">
                  <th className="py-1 pr-2 font-normal">薬</th>
                  <th className="py-1 pr-2 font-normal">基準</th>
                  <th className="py-1 pr-2 text-right font-normal">計算値</th>
                  <th className="py-1 pr-2 font-normal">減量</th>
                  <th className="py-1 pr-2 text-right font-normal">まるめ</th>
                  <th className="py-1 text-right font-normal">最終</th>
                </tr>
              </thead>
              <tbody>
                {plan.lines.map((l) => (
                  <DoseRow key={l.drug.key} l={l} value={reductions[l.drug.key] ?? null} onReduce={(v) => setReductions((r) => ({ ...r, [l.drug.key]: v }))} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {plan && (
        <section className="space-y-1.5">
          <h3 className="text-[11px] font-bold text-ink-soft">投与の順番と時刻（1本ずつ下書きになります）</h3>
          <ol className="space-y-1.5">
            {plan.rps.map((rp, i) => {
              const lines = lineOf(rp);
              const solvent = rp.solvent ? findDrug(rp.solvent.drugCode) : undefined;
              const rate = rateText(rp);
              return (
                <li key={rp.key} className={`rounded-md border p-2 ${rp.role === "抗がん薬" ? "border-ai/50" : "border-rule"}`}>
                  <div className="nums flex flex-wrap items-baseline gap-x-2">
                    <b className="text-ai">{i + 1}</b>
                    <b>{at(rp)}</b>
                    <span className={`rounded px-1 text-[11px] ${rp.role === "抗がん薬" ? "bg-ai-soft text-ai" : "bg-paper text-ink-soft"}`}>{rp.role}</span>
                    <span>
                      {lines.map((l) => `${findDrug(l.drug.drugCode)?.name ?? l.drug.short} ${l.final !== null ? `${num(l.final)}mg` : "未計算"}`).join(" ＋ ")}
                      {solvent && ` ＋ ${solvent.name} ${rp.solvent!.ml}mL`}
                    </span>
                    <span className="text-ink-soft">
                      {rp.route}
                      {displayText(rp.minutes ? `　${minutesText(rp.minutes)}` : "")}
                    </span>
                    {rate && <span className="text-[11px] text-ai">{rate}</span>}
                  </div>
                  {plan.checks
                    .filter((c) => c.rpKey === rp.key)
                    .map((c) => (
                      <WarnLine key={c.warn.text} w={c.warn} />
                    ))}
                </li>
              );
            })}
          </ol>
          {regimen!.oral.filter((o) => o.day === plan.day).length > 0 && (
            <div className="rounded-md border border-dashed border-rule p-2">
              <h4 className="text-[11px] font-bold text-ink-soft">内服の前投薬（処方で出してください。この欄の下書きには入りません）</h4>
              {regimen!.oral
                .filter((o) => o.day === plan.day)
                .map((o) => (
                  <p key={o.name}>
                    <b>
                      {o.name} {o.dose}
                    </b>
                    　{displayText(o.text)}　<Sources list={[o.source]} />
                  </p>
                ))}
            </div>
          )}
        </section>
      )}

      {regimen && (
        <section className="space-y-0.5 rounded-md bg-paper p-2">
          <h3 className="text-[11px] font-bold text-ink-soft">このレジメンについて</h3>
          {regimen.notes.map((n) => (
            <p key={n.text} className="text-[11px] text-ink-soft">
              ・{displayText(n.text)}
              <span className="ml-1 text-ink-faint">
                （<SourceLink s={n.source} />）
              </span>
            </p>
          ))}
        </section>
      )}

      <div className="sticky bottom-0 border-t border-rule bg-sheet pt-3">
        <button type="button" disabled={!ready} onClick={submit} title="⌘Enter（Ctrl+Enter）でも押せます" className="w-full rounded-md bg-ai px-3 py-2 text-sm font-bold text-white disabled:opacity-40 pointer-coarse:py-3">
          保存する{ready && plan ? `（${plan.rps.length} 本）` : ""}
          <kbd className="ml-2 rounded border border-white/40 px-1 text-[10px] font-normal">⌘↵</kbd>
        </button>
        {choices.length > 0 && <p className="mt-1 text-[12px] text-yamabuki">未選択：{choices.join("・")}</p>}
        {plan && plan.missing.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {plan.missing.map((m) => (
              <p key={m} className="text-[12px] font-bold text-shu">
                {m}
              </p>
            ))}
          </div>
        )}
        {made && <p className="mt-1 text-[12px] text-wakatake">{made}</p>}
      </div>

    </div>
  );
}

function DoseRow({ l, value, onReduce }: { l: DoseLine; value: number | null; onReduce: (v: number) => void }) {
  const name = findDrug(l.drug.drugCode)?.name ?? l.drug.short;
  const chemo = l.drug.reducible;
  return (
    <>
      <tr className={`align-baseline ${chemo ? "" : "text-ink-soft"}`}>
        <td className="py-1 pr-2">
          <b className={chemo ? "text-ink" : ""}>{l.drug.short}</b>
          <span className="block text-[10px] text-ink-faint">{displayText(name)}</span>
        </td>
        <td className="py-1 pr-2 whitespace-nowrap">{l.base}</td>
        <td className="py-1 pr-2 text-right whitespace-nowrap">{l.raw !== null ? `${num(l.raw)}mg` : "—"}</td>
        <td className="py-1 pr-2">
          {chemo ? (
            <TabChoice label={`${l.drug.short} の減量率`} options={REDUCTIONS.map((r) => ({ value: r, label: `${r}%` }))} value={value} onChange={onReduce} />
          ) : (
            <span className="text-[11px] text-ink-faint">前投薬（減量しない）</span>
          )}
        </td>
        <td className="py-1 pr-2 text-right whitespace-nowrap">{l.rounded !== null ? `${num(l.rounded)}mg` : "—"}</td>
        <td className={`py-1 text-right whitespace-nowrap ${chemo ? "text-[13px] font-bold" : ""}`}>{l.final !== null ? `${num(l.final)}mg` : "—"}</td>
      </tr>
      <tr className="border-b border-rule-soft">
        <td colSpan={6} className="pb-1.5">
          {/* A fixed dose with no rounding has nothing to work out. */}
          {l.steps.length > 0 && (l.drug.basis !== "固定" || l.drug.roundMg > 0) && <p className="text-[11px] text-ai">{l.steps.join("　→　")}</p>}
          {l.drug.roundMg > 0 && <p className="text-[11px] text-ink-faint">まるめ：{l.drug.roundNote}</p>}
          {l.drug.note && <p className="text-[11px] text-ink-soft">{displayText(l.drug.note)}</p>}
          {l.warnings.map((w) => (
            <WarnLine key={w.text} w={w} />
          ))}
          <Sources list={l.drug.source} />
        </td>
      </tr>
    </>
  );
}

/* Help migration source (references and dynamic wording):
<span >
      出典：
      {list.map((s, i) => (
        <span key={s.url}>
          {i > 0 && "／"}
          <SourceLink s={s} />
        </span>
      ))}
    </span>
<p >
        レジメン・コース・day・開始・減量率は医師が選びます（最初から選ばれているものはありません）。量・溶媒・時刻はコードが式つきで計算します。← → で選び、Tab で次の項目へ、⌘Enter（Ctrl+Enter）で下書きにします。
      </p>
<span >（コードで計算）</span>
<span >（コードで計算）</span>
<p >
          {displayText(BSA_RULE.text)}（四捨五入は{BSA_RULE.rounding}）：<SourceLink s={BSA_RULE.source} />。{displayText(GFR_RULE.text)}：<SourceLink s={GFR_RULE.source} />。{GFR_RULE.capText}：<SourceLink s={GFR_RULE.capSource} />。
        </p>
<span >（コードで計算）</span>
<p >下書きは1本ずつ、ほかの注射と同じ確認（経路・単位・速度・時刻・重複）を通ります。G-CSF・内服薬・補液はこの欄では出しません。</p>
<span >（コードで計算）</span>
*/
