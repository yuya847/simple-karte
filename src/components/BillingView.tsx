"use client";

import { displayText } from "@/lib/display-text";
import type { DietOrder } from "@/lib/diet";
import { AlertTriangle, Ban, CheckCircle2, Info, ListChecks, Loader2 } from "lucide-react";
import { BillPanel } from "./billing/BillPanel";
import { InsurancePanel } from "./billing/InsurancePanel";
import { DpcPanel, type Transfer } from "./billing/DpcPanel";
import { ReceiptPanel } from "./billing/ReceiptPanel";
import { DenyNote, useDeny, useMe } from "./RoleContext";
import { auditLog } from "@/lib/audit";
import type { Insurance } from "@/lib/billing/insurance";
import { FICTIONAL_COEFFICIENT } from "@/lib/billing/dpc";
import type { DpcMonthView } from "@/lib/billing/dpc-claim";
import { inpatientBill } from "@/lib/billing/inpatient-bill";
import { patientMonthPayload, type PatientMonthPayload } from "@/lib/billing/payload";
import type { InsuranceRecord } from "@/lib/billing/registration";
import type { Settlement } from "@/lib/billing/worklist";
import { useEffect, useMemo, useState } from "react";
import { addDays, formatShort, isoDate, type CalendarDate } from "@/lib/dates";
import type { Diagnosis } from "@/lib/diagnoses";
import { type BillingOptions, type ClaimAct, type ClaimIssue, type ClaimResult, SHIKIBETSU_NAME, type Shikibetsu } from "@/lib/billing/model";
import type { HistoryEntry, Patient } from "@/lib/types";

interface Props {
  patient: Patient;
  entries: HistoryEntry[];
  diagnoses: Diagnosis[];
  today: CalendarDate;
  nowTime: string;
  options: BillingOptions;
  onOptions: (next: BillingOptions) => void;
  /** Every patient of the ward, for the month's receipt files. */
  wardPayload: () => PatientMonthPayload[];
  diets?: DietOrder[];
  letters?: { day: number; to: string; dischargeDay?: number; attach?: boolean }[];
  /** Injection doses recorded as 未実施 on the ward ("orderId|minutes"). */
  notGiven?: string[];
  /** The insurance 医事課 registered for this patient (every version; the last is in force). */
  insurance?: InsuranceRecord[];
  onRegister?: (r: InsuranceRecord) => void;
  /** 退院時の会計, once recorded. */
  settlement?: Settlement;
  onSettle?: (s: Settlement) => void;
}

type Tab = "insurance" | "claim" | "bill" | "receipt" | "dpc";
const TABS: { key: Tab; label: string }[] = [
  { key: "insurance", label: "保険" },
  { key: "claim", label: "算定" },
  { key: "bill", label: "会計" },
  { key: "receipt", label: "レセプト" },
  { key: "dpc", label: "DPC" },
];

/** Months of this admission up to this month, as "YYYY-MM". */
function admissionMonths(today: CalendarDate, admittedOn: number): string[] {
  const out: string[] = [];
  for (let d = admittedOn; d <= 0; d++) {
    const c = addDays(today, d);
    const key = `${c.y}-${String(c.m).padStart(2, "0")}`;
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

const daysInMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

const ISSUE_STYLE: Record<ClaimIssue["level"], { label: string; cls: string; icon: typeof Info }> = {
  choose: {
    label: "人が選ぶ",
    cls: "border-yamabuki/40 bg-yamabuki-soft text-yamabuki",
    icon: AlertTriangle,
  },
  review: {
    label: "確かめる",
    cls: "border-yamabuki/40 bg-yamabuki-soft text-yamabuki",
    icon: AlertTriangle,
  },
  excluded: {
    label: "算定しない",
    cls: "border-rule bg-paper text-ink-soft",
    icon: Ban,
  },
  info: {
    label: "決まり",
    cls: "border-rule bg-paper text-ink-soft",
    icon: Info,
  },
};

const yen = (n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`;

/** The month's inpatient 出来高 claim: every line with its code, points, days and the rule it rests on. */
export function BillingView({ patient, entries, diagnoses, today, nowTime, options, onOptions, wardPayload, diets, letters, notGiven, insurance: records = [], onRegister, settlement, onSettle }: Props) {
  const me = useMe();
  const deny = useDeny();
  const registered = records[records.length - 1];
  // 医事課 starts on 保険 while the patient has none registered; everyone else on 算定.
  const [tab, setTab] = useState<Tab>(() => (!registered && !deny("insurance") ? "insurance" : "claim"));
  const [mainId, setMainId] = useState<string | undefined>(undefined);
  const [transfer, setTransfer] = useState<Transfer>("unknown");
  const [coefText, setCoefText] = useState(FICTIONAL_COEFFICIENT.toFixed(4));
  const coef = Number(coefText);
  const coefOk = Number.isFinite(coef) && coef >= 0.5 && coef <= 3;
  const [dpc, setDpc] = useState<DpcMonthView | null>(null);
  const [insurance, setInsurance] = useState<(Insurance & { assumed?: boolean }) | null>(null);
  const [receiptLines, setReceiptLines] = useState<string[]>([]);
  const months = useMemo(() => admissionMonths(today, patient.admittedOn), [today, patient.admittedOn]);
  const [month, setMonth] = useState(months[months.length - 1]);
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Diets, letters and the registered insurance by value, so a new array with the same content does not re-run the claim.
  const extraJson = JSON.stringify({ diets: (diets ?? []).filter((d) => d.patientId === patient.id), letters: letters ?? [], notGiven: notGiven ?? [], insurance: registered?.insurance });
  useEffect(() => {
    if (!coefOk) return;
    const ctl = new AbortController();
    const extra = JSON.parse(extraJson) as { diets: DietOrder[]; letters: { day: number; to: string; dischargeDay?: number; attach?: boolean }[]; notGiven: string[]; insurance?: Insurance };
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = { today: isoDate(today), nowTime, month, ...patientMonthPayload(patient, entries, diagnoses, options, extra) };
        const [json, dpcJson] = await Promise.all([
          ["/api/claim", payload],
          ["/api/dpc", { ...payload, dpc: { mainDiagnosisId: mainId, coefficient: coef, transfer: transfer === "unknown" ? null : transfer === "yes" } }],
        ].map(async ([url, body]) => {
          const res = await fetch(url as string, {
            method: "POST", headers: { "content-type": "application/json" }, signal: ctl.signal,
            body: JSON.stringify(body),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? `エラー（${res.status}）`);
          return data;
        }));
        if (ctl.signal.aborted) return;
        setDpc(dpcJson as DpcMonthView);
        setResult(json.result as ClaimResult);
        setInsurance(json.insurance);
        setReceiptLines(json.receipt.lines as string[]);
      } catch (e) {
        if (ctl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "算定できませんでした。");
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    };
    run();
    return () => ctl.abort();
  }, [month, options, entries, diagnoses, patient, today, nowTime, extraJson, mainId, transfer, coef, coefOk]);

  const accounting = result && insurance && dpc ? inpatientBill(result, insurance, dpc) : null;
  const ready = !loading && !error && coefOk;
  const bill = ready ? accounting?.bill ?? null : null;

  const groups = useMemo(() => {
    const g = new Map<Shikibetsu, ClaimAct[]>();
    for (const a of result?.acts ?? []) g.set(a.shikibetsu, [...(g.get(a.shikibetsu) ?? []), a]);
    return [...g.entries()];
  }, [result]);

  const nDays = daysInMonth(month);
  const [, mm] = month.split("-").map(Number);
  const set = (patch: Partial<BillingOptions>) => onOptions({ ...options, ...patch });
  const firstDayOfMonth = (d: number) => addDays(today, d);

  return (
    <section aria-label="算定" className="flex min-h-0 flex-col border-l border-rule bg-sheet">
      <div className="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-2.5">
        <div role="tablist" aria-label="医事" className="flex rounded-md border border-rule bg-paper p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`rounded px-3 py-1 text-sm ${tab === t.key ? "bg-sheet font-bold text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
            >
              {t.label}
              {t.key === "insurance" && !registered && <span className="ml-1 rounded bg-shu-soft px-1 text-[10px] font-normal text-shu">未登録</span>}
            </button>
          ))}
        </div>
        <span className="text-xs text-ink-faint">入院</span>
        <div role="tablist" aria-label="請求する月" className="flex gap-1">
          {months.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={m === month}
              onClick={() => { if (m !== month) { setLoading(true); setMonth(m); } }}
              className={`nums rounded-md border px-2.5 py-1 text-xs ${m === month ? "border-ai bg-ai text-white" : "border-rule bg-paper text-ink-soft hover:text-ink"}`}
            >
              {Number(m.slice(0, 4))}年{Number(m.slice(5))}月
            </button>
          ))}
        </div>
        {loading && <Loader2 size={14} className="animate-spin text-ink-faint" aria-label="計算中" />}
        <p className="hint ml-auto text-[11px] text-ink-faint">
          点数は厚生労働省のマスターと支払基金の電子点数表からコードで計算しています（AI は使っていません）。
        </p>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-auto px-4 py-3">
        {error && <p className="mb-3 rounded-md border border-shu/40 bg-shu-soft px-3 py-2 text-sm text-shu">{error}</p>}

        {tab === "insurance" && <InsurancePanel patient={patient} records={records} today={today} nowTime={nowTime} onRegister={(r) => onRegister?.(r)} />}
        {tab === "bill" && patient.dischargedAt && (
          <div className="mb-3 rounded-md border border-rule bg-paper px-3 py-2 text-xs">
            {settlement ? (
              <p className="nums flex items-center gap-1.5 text-wakatake">
                <CheckCircle2 size={13} />
                退院時の会計：済み（{formatShort(addDays(today, settlement.at.day))} {settlement.at.time} {displayText(settlement.by)}
                {settlement.yen !== null ? `、${Number(settlement.month.slice(5))}月分 ${yen(settlement.yen)}` : ""}）
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="nums font-bold text-yamabuki">
                  退院済み（{formatShort(addDays(today, patient.dischargedAt.day))} {patient.dischargedAt.time}）・会計がまだです。
                </span>
                <button
                  type="button"
                  disabled={!!deny("settle") || !bill || loading}
                  onClick={() => {
                    if (!bill) return;
                    const s: Settlement = { month, yen: bill.totalYen, by: me.name, at: { day: 0, time: nowTime } };
                    auditLog({ role: me.role, actor: me.name, action: "退院時の会計を記録した", patient: patient.name, detail: `${Number(month.slice(5))}月分 ${yen(bill.totalYen)}` });
                    onSettle?.(s);
                  }}
                  className="rounded-md bg-ai px-2.5 py-1 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  会計を済ませた{bill ? `（お支払い ${yen(bill.totalYen)}）` : ""}
                </button>
                <span className="text-[11px] text-ink-faint">お金のやりとりはこの試作にはありません。窓口で受け取ったことを記録します。</span>
                <DenyNote action="settle" className="w-full" />
              </div>
            )}
          </div>
        )}
        {tab === "bill" && !coefOk && <p className="mb-3 text-sm text-shu">DPC タブの医療機関別係数を 0.5〜3 で入力してください。</p>}
        {tab === "bill" && result && bill && insurance && accounting && <>
          <div className="nums mb-3 rounded-md border border-rule bg-paper px-3 py-2 text-sm">
            <p className="font-bold">{accounting.useDpc ? "DPC（包括 ＋ 出来高）" : "出来高"}</p>
            <p className="text-xs">包括 {(accounting.useDpc ? dpc!.pkg!.total : 0).toLocaleString("ja-JP")} 点・出来高に残る分 {(accounting.useDpc ? dpc!.outsideTotal : result.totalPoints).toLocaleString("ja-JP")} 点</p>
            {accounting.reason && <p className="text-xs text-ink-soft">{displayText(accounting.reason)}</p>}
            {accounting.receiptDiffers && <p className="text-xs text-yamabuki">レセプト出力は出来高の {result.totalPoints.toLocaleString("ja-JP")} 点のため、会計の点数・金額と異なります。</p>}
          </div>
          <BillPanel claim={result} bill={bill} insurance={insurance} month={month} />
        </>}
        {tab === "receipt" && result && (
          <ReceiptPanel lines={receiptLines} month={month} today={isoDate(today)} nowTime={nowTime} wardPayload={wardPayload} />
        )}
        {tab === "dpc" && <DpcPanel month={month} mainId={mainId} setMainId={(value) => { if (value !== mainId) { setLoading(true); setMainId(value); } }} transfer={transfer} setTransfer={(value) => { if (value !== transfer) { setLoading(true); setTransfer(value); } }} coefText={coefText} setCoefText={(value) => { if (Number(value) !== coef) setLoading(true); setCoefText(value); }} r={ready ? dpc : null} error={error} loading={loading} />}
        {tab === "claim" && (
          <>

        {!registered && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-yamabuki/40 bg-yamabuki-soft px-3 py-2 text-xs text-yamabuki">
            <AlertTriangle size={13} />
            保険が未登録です。年齢から仮の保険で計算しています。
            <button type="button" onClick={() => setTab("insurance")} className="rounded border border-yamabuki/50 bg-sheet px-2 py-0.5 font-bold">
              保険を登録する
            </button>
          </div>
        )}
        {patient.dischargedAt && !settlement && (
          <div className="nums mb-3 flex flex-wrap items-center gap-2 rounded-md border border-yamabuki/40 bg-yamabuki-soft px-3 py-2 text-xs text-yamabuki">
            <AlertTriangle size={13} />
            退院済み（{formatShort(addDays(today, patient.dischargedAt.day))} {patient.dischargedAt.time}）・会計がまだです。
            <button type="button" onClick={() => setTab("bill")} className="rounded border border-yamabuki/50 bg-sheet px-2 py-0.5 font-bold">
              会計へ
            </button>
          </div>
        )}

        {result && (
          <div className="nums mb-3 flex flex-wrap items-end gap-x-8 gap-y-2">
            <Stat label="入院日数（この月）" value={`${result.days}日`} sub={result.from ? `${mm}/${result.from}〜${mm}/${result.to}` : "なし"} />
            <Stat label="合計点数" value={`${result.totalPoints.toLocaleString("ja-JP")}点`} sub={`医療費 ${yen(result.totalPoints * 10)}（1点10円）`} strong />
            <Stat label="入院時食事療養" value={yen(result.meals.ryoyoYen)} sub={`うち標準負担額 ${yen(result.meals.futanYen)}`} />
          </div>
        )}

        <fieldset className="mb-3 rounded-md border border-rule bg-paper px-3 py-2">
          <legend className="px-1 text-xs font-bold text-ink-soft">患者の状態で決まる加算（人が確かめて入れます。コードは決めません）</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
            <label className="flex items-center gap-1.5">
              救急医療管理加算
              <select
                value={options.kyukyu}
                onChange={(e) => set({ kyukyu: e.target.value as BillingOptions["kyukyu"] })}
                className="rounded border border-rule bg-sheet px-1 py-0.5"
              >
                <option value="">なし</option>
                <option value="1">1（1,050点）</option>
                <option value="2">2（420点）</option>
              </select>
            </label>
            <Check label="認知症ケア加算３（自立度Ⅲ以上）" checked={options.ninchisho} onChange={(v) => set({ ninchisho: v })} />
            <Check label="せん妄ハイリスク患者ケア加算" checked={options.senmou} onChange={(v) => set({ senmou: v })} />
            <label className="flex items-center gap-1.5">
              協力対象施設入所者入院加算
              <select
                value={options.kyoryoku}
                onChange={(e) =>
                  set({
                    kyoryoku: e.target.value as BillingOptions["kyoryoku"],
                  })
                }
                className="rounded border border-rule bg-sheet px-1 py-0.5"
              >
                <option value="">なし</option>
                <option value="1">往診あり（600点）</option>
                <option value="2">それ以外（200点）</option>
              </select>
            </label>
            <Check label="特別食（食事オーダーがないときだけ使う）" checked={options.specialDiet} onChange={(v) => set({ specialDiet: v })} />
            <label className="flex items-center gap-1.5">
              薬剤管理指導料（今日）
              <select
                value={options.yakuzaiShido.find((y) => y.day === 0)?.kind ?? ""}
                onChange={(e) => {
                  const rest = options.yakuzaiShido.filter((y) => y.day !== 0);
                  const v = e.target.value;
                  set({
                    yakuzaiShido: v ? [...rest, { day: 0, kind: v as "1" | "2" }] : rest,
                  });
                }}
                className="rounded border border-rule bg-sheet px-1 py-0.5"
              >
                <option value="">なし</option>
                <option value="1">1 安全管理を要する薬（380点）</option>
                <option value="2">2 それ以外（325点）</option>
              </select>
            </label>
          </div>
        </fieldset>

        {result && result.issues.length > 0 && (() => {
          const row = (i: (typeof result.issues)[number]) => {
            const s = ISSUE_STYLE[i.level];
            const Icon = s.icon;
            return (
              <li key={i.level + i.text} className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs ${s.cls}`}>
                <Icon size={13} className="mt-0.5 shrink-0" />
                <span className="shrink-0 font-bold">{s.label}</span>
                <span className="text-ink">{displayText(i.text)}</span>
              </li>
            );
          };
          const sorted = [...result.issues].sort((a, b) => Object.keys(ISSUE_STYLE).indexOf(a.level) - Object.keys(ISSUE_STYLE).indexOf(b.level));
          // Only what someone must check stays open; the rules applied (決まり) fold into one line.
          const rules = sorted.filter((i) => i.level === "info");
          return (
            <div className="mb-3 space-y-1">
              <ul className="space-y-1">{sorted.filter((i) => i.level !== "info").map(row)}</ul>
              {rules.length > 0 && (
                <details className="text-xs text-ink-soft">
                  <summary className="cursor-pointer select-none">算定の決まりで外したもの・分けたもの（{rules.length}件）</summary>
                  <ul className="mt-1 space-y-1">{rules.map(row)}</ul>
                </details>
              )}
            </div>
          );
        })()}

        {result && (
          <table className="nums w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-sheet">
              <tr className="border-b border-rule text-[10px] text-ink-faint">
                <th className="w-10 py-1 text-left font-normal">識別</th>
                <th className="py-1 text-left font-normal">内容（コード）と根拠</th>
                <th className="w-14 py-1 text-right font-normal">点数</th>
                <th className="w-10 py-1 text-right font-normal">回数</th>
                {Array.from({ length: nDays }, (_, i) => {
                  const dow = new Date(Date.UTC(Number(month.slice(0, 4)), mm - 1, i + 1)).getUTCDay();
                  return (
                    <th key={i} className={`w-[18px] py-1 text-center font-normal ${dow === 0 ? "text-shu" : dow === 6 ? "text-ai" : ""}`}>
                      {i + 1}
                    </th>
                  );
                })}
              </tr>
            </thead>
            {groups.map(([sk, acts]) => {
              const subtotal = acts.reduce((s, a) => s + a.parts.reduce((t, p) => t + p.points, 0) * a.count, 0);
              const isYen = sk === "97";
              return (
                <tbody key={sk}>
                  <tr className="border-b border-rule-soft bg-paper">
                    <td className="py-1 font-bold text-ink-soft">{sk}</td>
                    <td className="py-1 font-bold text-ink-soft" colSpan={3}>
                      {SHIKIBETSU_NAME[sk]}
                      <span className="ml-3 font-normal text-ink-faint">小計 {isYen ? yen(subtotal) : `${subtotal.toLocaleString("ja-JP")}点`}</span>
                    </td>
                    <td colSpan={nDays} />
                  </tr>
                  {acts.map((a, i) => (
                    <tr key={i} className="border-b border-rule-soft align-top">
                      <td />
                      <td className="py-1 pr-2">
                        {a.parts.map((p, pi) => (
                          <div key={pi} className={pi > 0 ? "mt-0.5" : ""}>
                            {p.lines.map((l, li) => (
                              <div key={li} className="leading-snug">
                                {l.name}
                                {l.record === "IY" && l.quantity !== undefined && (
                                  <span className="text-ink-soft">
                                    {" "}
                                    {l.quantity}
                                    {l.unit}
                                  </span>
                                )}
                                {l.record === "SI" && l.quantity !== undefined && <span className="text-ink-soft"> ×{l.quantity}</span>}
                                {l.record === "TO" && (
                                  <span className="text-ink-soft">
                                    {l.unitPrice !== undefined && ` ${l.unitPrice}円/${l.unit ?? ""}`}
                                    {l.quantity !== undefined && ` ${l.quantity.toLocaleString("ja-JP")}${l.unit ?? ""}`}
                                    {l.product && <span className="block text-[10px]">{l.product}</span>}
                                  </span>
                                )}
                                <span className="ml-1.5 text-[10px] text-ink-faint">{l.code}</span>
                                {l.comments?.map((c) => (
                                  <div key={c.code} className="ml-3 text-[10px] text-fuji">
                                    コメント {c.label}
                                    <span className="ml-1 text-ink-faint">{c.code}</span>
                                  </div>
                                ))}
                              </div>
                            ))}
                            {a.parts.length > 1 && <div className="text-right text-[10px] text-ink-faint">{p.yen ? yen(p.points) : `${p.points}点`}</div>}
                          </div>
                        ))}
                        <div className="mt-0.5 text-[10px] leading-snug text-ink-faint">{a.basis}</div>
                      </td>
                      <td className="py-1 text-right font-bold">
                        {isYen ? yen(a.parts.reduce((s, p) => s + p.points, 0)) : a.parts.reduce((s, p) => s + p.points, 0).toLocaleString("ja-JP")}
                      </td>
                      <td className="py-1 text-right">{a.count}</td>
                      {Array.from({ length: nDays }, (_, d) => (
                        <td key={d} className={`py-1 text-center ${a.days[d + 1] ? "text-ink" : "text-rule"}`}>
                          {a.days[d + 1] ?? "·"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        )}

        {result && (
          <div className="mt-3 space-y-0.5 text-[10px] text-ink-faint">
            <p className="flex items-center gap-1">
              <ListChecks size={11} />
              施設基準はこの病院（届出は実在の一般病院の公開情報にならった想定）。入院日 {formatShort(firstDayOfMonth(patient.admittedOn))}。
            </p>
            {result.sources.map((s) => (
              <p key={s} className="hint">出典：{s}</p>
            ))}
          </div>
        )}
          </>
        )}
      </div>
    </section>
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

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
