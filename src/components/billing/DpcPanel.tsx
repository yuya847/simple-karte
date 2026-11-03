"use client";

import { AlertTriangle, Info, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { codeParts, FICTIONAL_COEFFICIENT, periodRanges } from "@/lib/billing/dpc";
import type { DpcMonthView } from "@/lib/billing/dpc-claim";
import { type BillingOptions, SHIKIBETSU_NAME } from "@/lib/billing/model";
import { patientMonthPayload } from "@/lib/billing/payload";
import { isoDate, type CalendarDate } from "@/lib/dates";
import type { Diagnosis } from "@/lib/diagnoses";
import type { DietOrder } from "@/lib/diet";
import type { HistoryEntry, Patient } from "@/lib/types";

interface Props {
  patient: Patient;
  entries: HistoryEntry[];
  diagnoses: Diagnosis[];
  today: CalendarDate;
  nowTime: string;
  month: string;
  options: BillingOptions;
  /** The diets, letters and 未実施 doses as the 算定 tab sends them (JSON). */
  extraJson: string;
}

type Transfer = "unknown" | "no" | "yes";

const pts = (n: number) => `${n.toLocaleString("ja-JP", { maximumFractionDigits: 4 })}点`;
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toLocaleString("ja-JP")}点`;

/** DPC（診断群分類別包括評価）for the month, next to the 出来高 claim. Computed by code on the server. */
export function DpcPanel({ patient, entries, diagnoses, today, nowTime, month, options, extraJson }: Props) {
  const [mainId, setMainId] = useState<string | undefined>(undefined);
  const [transfer, setTransfer] = useState<Transfer>("unknown");
  const [coefText, setCoefText] = useState(FICTIONAL_COEFFICIENT.toFixed(4));
  const coef = Number(coefText);
  const coefOk = Number.isFinite(coef) && coef >= 0.5 && coef <= 3;
  const [r, setR] = useState<DpcMonthView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!coefOk) return;
    const ctl = new AbortController();
    const extra = JSON.parse(extraJson) as { diets: DietOrder[]; letters: { day: number; to: string; dischargeDay?: number; attach?: boolean }[]; notGiven: string[] };
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/dpc", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: ctl.signal,
          body: JSON.stringify({
            today: isoDate(today),
            nowTime,
            month,
            ...patientMonthPayload(patient, entries, diagnoses, options, extra),
            dpc: { mainDiagnosisId: mainId, coefficient: coef, transfer: transfer === "unknown" ? null : transfer === "yes" },
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `エラー（${res.status}）`);
        setR(json as DpcMonthView);
      } catch (e) {
        if (ctl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "DPC を計算できませんでした。");
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    };
    run();
    return () => ctl.abort();
  }, [patient, entries, diagnoses, today, nowTime, month, options, extraJson, mainId, transfer, coef, coefOk]);

  const d = r?.outcome?.ok ? r.outcome.d : null;
  const [, mm] = month.split("-").map(Number);
  const issues = [...(r?.outcome && !r.outcome.ok ? r.outcome.issues : []), ...(d?.issues ?? []), ...(r?.issues ?? [])].filter((x, i, all) => all.findIndex((y) => y.text === x.text) === i);

  return (
    <div className="nums space-y-3 text-sm">
      <p className="rounded-md border border-ai/30 bg-ai-soft px-3 py-2 text-xs leading-relaxed text-ink">
        <b>DPC（診断群分類別包括評価）の試算</b>
        ：診断群分類（DPC コード）は、主治医が退院のときに決め（留意事項 第2の1(1)・(7)）、医事課が確かめます。この画面は、記録された病名・年齢・手術と処置から、厚生労働省の表どおりにコードで候補を出すだけです（AI は使っていません）。病院は架空で、医療機関別係数も架空の値です。
      </p>

      <fieldset className="rounded-md border border-rule bg-paper px-3 py-2">
        <legend className="px-1 text-xs font-bold text-ink-soft">医師・医事課が選ぶもの</legend>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <label className="flex items-center gap-1.5">
            医療資源を最も投入した傷病名
            <select value={mainId ?? ""} onChange={(e) => setMainId(e.target.value || undefined)} className="max-w-[22rem] rounded border border-rule bg-sheet px-1 py-0.5">
              <option value="">（まだ選んでいない：主病名のうち最も早いもので仮に計算）</option>
              {(r?.diagnoses ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}（{x.icd10}）{x.main ? "・主病名" : ""}
                </option>
              ))}
            </select>
          </label>
          {d?.cls.usesTransfer && (
            <label className="flex items-center gap-1.5">
              入院経路
              <select value={transfer} onChange={(e) => setTransfer(e.target.value as Transfer)} className="rounded border border-rule bg-sheet px-1 py-0.5">
                <option value="unknown">記録なし（転院以外として計算）</option>
                <option value="no">他の病院・診療所の病棟からの転院以外</option>
                <option value="yes">他の病院・診療所の病棟からの転院</option>
              </select>
            </label>
          )}
          <label className="flex items-center gap-1.5">
            医療機関別係数（架空の病院の値）
            <input
              type="number"
              step="0.0001"
              min="0.5"
              max="3"
              value={coefText}
              onChange={(e) => setCoefText(e.target.value)}
              className={`w-24 rounded border bg-sheet px-1 py-0.5 text-right ${coefOk ? "border-rule" : "border-shu"}`}
            />
          </label>
          {loading && <Loader2 size={14} className="animate-spin text-ink-faint" aria-label="計算中" />}
        </div>
      </fieldset>

      {error && <p className="rounded-md border border-shu/40 bg-shu-soft px-3 py-2 text-sm text-shu">{error}</p>}
      {r?.outcome && !r.outcome.ok && <p className="rounded-md border border-yamabuki/40 bg-yamabuki-soft px-3 py-2 text-sm text-ink">{r.outcome.reason}</p>}

      {r && d && (
        <>
          <section aria-label="DPC コード" className="rounded-md border border-rule bg-sheet p-3">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <div className="text-[10px] text-ink-faint">DPC コードの候補（{r.chosen?.by === "doctor" ? "医師が選んだ病名から" : "仮の病名から"}）</div>
                <div className="flex gap-1 font-mono">
                  {codeParts(d.code).map((p) => (
                    <span key={p.label} className="text-center">
                      <span className="block rounded border border-rule bg-paper px-1.5 py-0.5 text-lg font-bold tracking-wider">{p.digits}</span>
                      <span className="block text-[9px] text-ink-faint">{p.label}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-xs">
                <div className="font-bold">
                  {d.cls.code} {d.cls.name}
                  <span className="ml-2 font-normal text-ink-soft">（MDC {d.cls.code.slice(0, 2)} {d.cls.mdcName}）</span>
                </div>
                <div className="text-ink-soft">
                  {(
                    [
                      ["手術", d.row.label.surgery],
                      ["手術・処置等１", d.row.label.shochi1],
                      ["手術・処置等２", d.row.label.shochi2],
                      ["定義副傷病", d.row.label.fukushobyo],
                      ["重症度等", d.row.label.severity],
                    ] as const
                  )
                    .filter(([, v]) => v)
                    .map(([k, v]) => `${k} ${v}`)
                    .join("　")}
                </div>
                <div className={d.hokatsu ? "text-wakatake" : "text-shu"}>{d.hokatsu ? "包括の対象" : "包括の対象外（医科点数表で算定）"}</div>
              </div>
            </div>

            <table className="mt-3 w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-rule text-[10px] text-ink-faint">
                  <th className="w-14 py-1 text-left font-normal">桁</th>
                  <th className="w-36 py-1 text-left font-normal">項目</th>
                  <th className="w-16 py-1 text-left font-normal">値</th>
                  <th className="py-1 text-left font-normal">ツリー図の道筋（記録から）</th>
                </tr>
              </thead>
              <tbody>
                {d.steps.map((s) => (
                  <tr key={s.at} className="border-b border-rule-soft align-top">
                    <td className="py-1 text-ink-faint">{s.at}</td>
                    <td className="py-1">{s.axis}</td>
                    <td className="py-1 font-mono font-bold">{s.digits}</td>
                    <td className="py-1 leading-snug">{s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.alternatives.length > 0 && (
              <div className="mt-2 rounded border border-yamabuki/40 bg-yamabuki-soft px-2 py-1.5 text-xs">
                <div className="font-bold text-yamabuki">記録だけでは決まらないもの（医師・医事課が確かめる）</div>
                {d.alternatives.map((a) => (
                  <div key={a.code + a.because}>
                    {a.because} → <span className="font-mono font-bold">{a.code}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section aria-label="入院期間" className="rounded-md border border-rule bg-sheet p-3">
            <h3 className="mb-1 text-xs font-bold">
              入院期間と1日の点数
              <span className="ml-2 font-normal text-ink-soft">
                {r.now.period ? `今日は入院${r.now.hospitalDay}日目（${r.now.period === "超え" ? "入院日Ⅲを超えた日：出来高" : `入院期間${r.now.period}`}）` : `入院${r.now.hospitalDay}日目`}
              </span>
            </h3>
            {d.row.days ? (
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {periodRanges(d.row).map((p) => (
                    <tr key={p.period} className={`border-b border-rule-soft ${p.period === r.now.period ? "bg-ai-soft font-bold" : ""}`}>
                      <td className="w-28 py-1">{p.period === "超え" ? "入院日Ⅲを超えた日" : `入院期間${p.period}`}</td>
                      <td className="w-40 py-1 text-ink-soft">{p.to === null ? `${p.from}日目から` : `${p.from}〜${p.to}日目`}</td>
                      <td className="py-1">{p.points === null ? "医科点数表（出来高）で算定（留意事項 第3の1(5)）" : `${pts(p.points)}／日`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-ink-soft">このコードには点数の設定がありません。</p>
            )}
          </section>

          {r.pkg && (
            <section aria-label="この月の包括" className="rounded-md border border-rule bg-sheet p-3">
              <h3 className="mb-1 text-xs font-bold">
                {mm}月の包括：点数 × 医療機関別係数 {coef.toFixed(4)}（告示第96号 別表 1）
              </h3>
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {r.pkg.lines.map((l) => (
                    <tr key={l.from} className="border-b border-rule-soft">
                      <td className="w-28 py-1">{l.period === "超え" ? "入院日Ⅲ超え" : `入院期間${l.period}`}</td>
                      <td className="w-40 py-1 text-ink-soft">
                        入院{l.from}
                        {l.to !== l.from ? `〜${l.to}` : ""}日目（{l.days}日）
                      </td>
                      <td className="py-1">{l.points === null ? "出来高（下の表に入れています）" : `${pts(l.points)} × ${coef.toFixed(4)} = ${pts(l.perDay!)}／日 × ${l.days}日`}</td>
                      <td className="w-28 py-1 text-right">{l.points === null ? "—" : pts(l.subtotal)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3} className="py-1 text-right text-ink-soft">
                      合計 {pts(r.pkg.raw)} → 小数点以下第1位を四捨五入（留意事項 第3の1(1)）
                    </td>
                    <td className="py-1 text-right font-bold">{pts(r.pkg.total)}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          )}

          <section aria-label="出来高に残る部分" className="rounded-md border border-rule bg-sheet p-3">
            <h3 className="mb-1 text-xs font-bold">
              出来高で算定する部分
              <span className="ml-2 font-normal text-ink-soft">包括に含まれない・包括から除かれるもの（告示第96号 別表 2・3）</span>
            </h3>
            {r.outside.length === 0 ? (
              <p className="text-xs text-ink-soft">この月はありません。</p>
            ) : (
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-rule text-[10px] text-ink-faint">
                    <th className="w-20 py-1 text-left font-normal">識別</th>
                    <th className="py-1 text-left font-normal">内容（コード）と根拠</th>
                    <th className="w-14 py-1 text-right font-normal">点数</th>
                    <th className="w-10 py-1 text-right font-normal">回数</th>
                    <th className="w-16 py-1 text-right font-normal">計</th>
                  </tr>
                </thead>
                <tbody>
                  {r.outside.map((l, i) => (
                    <tr key={i} className="border-b border-rule-soft align-top">
                      <td className="py-1 text-ink-soft">{SHIKIBETSU_NAME[l.shikibetsu]}</td>
                      <td className="py-1">
                        {l.name}
                        <span className="ml-1.5 text-[10px] text-ink-faint">{l.code}</span>
                        <div className={`text-[10px] leading-snug ${l.review ? "text-yamabuki" : "text-ink-faint"}`}>{l.rule}</div>
                      </td>
                      <td className="py-1 text-right">{l.points.toLocaleString("ja-JP")}</td>
                      <td className="py-1 text-right">{l.count}</td>
                      <td className="py-1 text-right font-bold">{l.total.toLocaleString("ja-JP")}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={4} className="py-1 text-right text-ink-soft">
                      出来高で算定する部分の合計
                    </td>
                    <td className="py-1 text-right font-bold">{r.outsideTotal.toLocaleString("ja-JP")}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </section>

          <section aria-label="出来高との比べ" className="rounded-md border border-rule bg-paper p-3">
            <h3 className="mb-2 text-xs font-bold">{mm}月の比べ（入院時食事療養はどちらでも別に算定し、ここには入れていません）</h3>
            <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
              <Stat label="出来高（「算定」のタブ）" value={pts(r.ffsTotal)} sub={`うち包括に置き換わる ${pts(r.replaced)}`} />
              <Stat
                label="DPC（包括 + 出来高の部分）"
                value={r.dpcTotal === null ? "—" : pts(r.dpcTotal)}
                sub={r.pkg ? `${pts(r.pkg.total)} + ${pts(r.outsideTotal)}` : "包括にならない"}
                strong
              />
              {r.dpcTotal !== null && <Stat label="差（DPC − 出来高）" value={signed(r.dpcTotal - r.ffsTotal)} sub={`医療費で ${(r.dpcTotal - r.ffsTotal) * 10 > 0 ? "+" : ""}${((r.dpcTotal - r.ffsTotal) * 10).toLocaleString("ja-JP")}円（1点10円）`} />}
            </div>
          </section>
        </>
      )}

      {issues.length > 0 && (
        <ul className="space-y-1">
          {issues.map((i) => {
            const Icon = i.level === "review" ? AlertTriangle : Info;
            return (
              <li
                key={i.text}
                className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs ${i.level === "review" ? "border-yamabuki/40 bg-yamabuki-soft text-yamabuki" : "border-rule bg-paper text-ink-soft"}`}
              >
                <Icon size={13} className="mt-0.5 shrink-0" />
                <span className="shrink-0 font-bold">{i.level === "review" ? "確かめる" : "決まり"}</span>
                <span className="text-ink">{i.text}</span>
              </li>
            );
          })}
        </ul>
      )}

      {r && (
        <div className="space-y-0.5 text-[10px] text-ink-faint">
          {r.sources.map((s) => (
            <p key={s.url}>
              出典：
              <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-rule hover:text-ink">
                {s.label}
              </a>
            </p>
          ))}
          <p>この試作の DPC の表は、デモの患者の病名の分類（080010・040081・050130・110310・180010）だけを載せています。</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-ink-faint">{label}</div>
      <div className={strong ? "text-xl font-bold" : "text-base font-bold"}>{value}</div>
      {sub && <div className="text-[10px] text-ink-soft">{sub}</div>}
    </div>
  );
}
