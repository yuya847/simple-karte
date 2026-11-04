"use client";

// 外来の会計: one visit's points (from /api/opd-claim, read from the official masters on the server), the
// patient's share worked out by code from the registered insurance (billing/futan.ts), the 領収書 and the
// 診療明細書 to print, and 入金 (現金・カード) by 医事課 (roles.ts "settle"). Below: today's visits whose bill is
// still open (未収). Nothing is decided here: what the window cannot claim is listed as such.

import { AlertTriangle, Ban, CheckCircle2, Info, Loader2, Printer, ReceiptJapaneseYen, RefreshCw } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { auditLog } from "@/lib/audit";
import { FUTAN_SOURCES, outpatientShare, type OutpatientShare } from "@/lib/billing/futan";
import { assumedInsurance, coverageOf, rateLabel, type Insurance } from "@/lib/billing/insurance";
import type { ClaimAct, ClaimIssue, Shikibetsu } from "@/lib/billing/model";
import { OPD_CLAIM_SOURCES } from "@/lib/billing/opd-claim-sources";
import type { OpdClaim } from "@/lib/billing/opd-claim";
import { nextReceiptNo, PAY_METHODS, takings, type OpdSettleBook, type OpdSettlement, type PayMethod, type UnpaidRow } from "@/lib/billing/opd-settle";
import { ageBand, kindOptionOf, type InsuranceRecord } from "@/lib/billing/registration";
import { formatShort, isoDate, type CalendarDate } from "@/lib/dates";
import type { RxLine } from "@/lib/national/rx-lines";
import type { OpdPatient } from "@/lib/opd";
import { birthDateOf } from "@/lib/patient-contacts";
import type { OrderEntry } from "@/lib/types";
import { BigChoice } from "../BigChoice";
import { Fictional, Sources, usePrintSheet } from "../DeskParts";
import { DenyNote, useDeny, useMe } from "../RoleContext";

const yen = (n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`;
const pts = (n: number) => `${n.toLocaleString("ja-JP")}点`;

/** 領収証の区分 (the official form's columns for 外来). 処方箋料 sits under 投薬. */
const SECTION_OF: Partial<Record<Shikibetsu, string>> = { "11": "初・再診料", "12": "初・再診料", "13": "医学管理等", "21": "投薬", "22": "投薬", "24": "投薬", "27": "投薬", "31": "注射", "32": "注射", "33": "注射", "40": "処置", "60": "検査", "70": "画像診断", "80": "その他" };
const SECTION_ORDER = ["初・再診料", "医学管理等", "投薬", "注射", "処置", "検査", "画像診断", "その他"];
export function sectionOf(a: ClaimAct): string {
  if (a.shikibetsu === "80" && a.parts[0]?.lines[0]?.code.startsWith("120")) return "投薬";
  return SECTION_OF[a.shikibetsu] ?? "その他";
}
export function sections(acts: ClaimAct[]): { name: string; points: number }[] {
  const m = new Map<string, number>();
  for (const a of acts) m.set(sectionOf(a), (m.get(sectionOf(a)) ?? 0) + a.parts.reduce((s, p) => s + p.points, 0) * a.count);
  return SECTION_ORDER.filter((n) => m.has(n)).map((name) => ({ name, points: m.get(name)! }));
}

const ISSUE_STYLE: Record<ClaimIssue["level"], { label: string; cls: string; icon: typeof Info }> = {
  choose: { label: "人が選ぶ", cls: "border-yamabuki/40 bg-yamabuki-soft text-yamabuki", icon: AlertTriangle },
  review: { label: "確かめる", cls: "border-yamabuki/40 bg-yamabuki-soft text-yamabuki", icon: AlertTriangle },
  excluded: { label: "算定しない", cls: "border-rule bg-paper text-ink-soft", icon: Ban },
  info: { label: "決まり", cls: "border-rule bg-paper text-ink-soft", icon: Info },
};

interface Props {
  emergency?: import("@/lib/billing/emergency-visit").EmergencyContext;
  visit: OpdPatient;
  /** The visit's chart id ("opd:" + id): the key of the insurance and the settlement. */
  visitKey: string;
  entries: OrderEntry[];
  rx: { items?: RxLine[] }[];
  records?: InsuranceRecord[];
  today: CalendarDate;
  nowTime: string;
  settlement?: OpdSettlement;
  book: OpdSettleBook;
  unpaid: UnpaidRow[];
  onSettle?: (s: OpdSettlement) => void;
  onOpenVisit?: (opdId: string) => void;
  onOpenInsurance?: () => void;
  /** A claim already computed (shown at once; the server's answer replaces it). */
  initial?: OpdClaim;
}

/** 70歳に達する日の属する月の翌月以後, or 後期高齢者: the elder 外来 limits apply. */
export function shareContext(ins: Insurance, today: CalendarDate) {
  const band = ageBand(ins.birthDate, today);
  const [by, bm] = ins.birthDate.split("-").map(Number);
  return { month: `${today.y}-${String(today.m).padStart(2, "0")}`, elder: band === "70〜74歳" || band === "75歳以上" || ins.kind === "後期高齢者", turns75ThisMonth: today.y - by === 75 && today.m === bm };
}

export function OpdBillPanel({ emergency, visit, visitKey, entries, rx, records = [], today, nowTime, settlement, book, unpaid, onSettle, onOpenVisit, onOpenInsurance, initial }: Props) {
  const me = useMe();
  const denySettle = useDeny()("settle");
  const [claim, setClaim] = useState<OpdClaim | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState(0);
  const [method, setMethod] = useState<PayMethod | "">("");
  const [print, sheet] = usePrintSheet();

  const registered = records[records.length - 1]?.insurance;
  const insurance: Insurance & { assumed?: boolean } = registered ?? assumedInsurance(visit.age, today);
  const assumed = !registered;
  const birth = birthDateOf({ id: visitKey, age: visit.age }, today, registered?.birthDate);
  const rxItems = useMemo(() => rx.map((r) => ({ items: r.items ?? [] })), [rx]);
  const bodyJson = JSON.stringify({ emergency, today: isoDate(today), nowTime, visit: { id: visit.id, name: visit.name, age: visit.age, kind: visit.kind, department: visit.department }, entries, rx: rxItems });
  const request = useEffectEvent(() => bodyJson);
  useEffect(() => {
    const ctl = new AbortController();
    const run = async () => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/opd-claim", { method: "POST", headers: { "content-type": "application/json" }, signal: ctl.signal, body: request() });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `エラー（${res.status}）`);
        setClaim(json as OpdClaim);
      } catch (e) {
        if (ctl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "算定できませんでした。");
      } finally {
        if (!ctl.signal.aborted) setBusy(false);
      }
    };
    run();
    return () => ctl.abort();
    // The body by value: a new array with the same orders does not re-run the claim.
  }, [bodyJson, runs]);

  const share: OutpatientShare | null = useMemo(() => (claim ? outpatientShare(claim.totalPoints, insurance, shareContext(insurance, today)) : null), [claim, insurance, today]);
  const secs = claim ? sections(claim.acts) : [];
  const kindLabel = kindOptionOf({ coverage: insurance.coverage ?? "医保", kind: insurance.kind })?.label ?? insurance.kind;
  const date = formatShort(today);

  const receiptNode = (s: OpdSettlement | null) => (
    <ReceiptSheet visit={visit} date={date} sections={secs} share={share!} insuranceLabel={kindLabel} assumed={assumed} receiptNo={s?.receiptNo} method={s?.method} by={s?.by ?? me.name} time={s?.at.time ?? nowTime} />
  );
  const detailNode = () => <DetailSheet visit={visit} date={date} acts={claim!.acts} total={claim!.totalPoints} />;

  const settle = () => {
    if (emergency?.admittedAs || busy || error || denySettle || !onSettle || !claim || !share || !method) return;
    const s: OpdSettlement = { visitKind: visit.kind, visitId: visitKey, receiptNo: nextReceiptNo(book, today), points: claim.totalPoints, yen: share.patientYen, coverage: coverageOf(insurance), rateLabel: rateLabel(share.rate), method, by: me.name, at: { day: 0, time: nowTime } };
    auditLog({ role: me.role, actor: me.name, action: "確定（外来の会計・入金）", patient: visit.name, detail: `${s.receiptNo}　${pts(s.points)}　${kindLabel} ${s.rateLabel}　お支払い ${yen(s.yen)}（${s.method}）` });
    onSettle(s);
  };
  const t = takings(book);

  return (
    <div className="space-y-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-1.5 text-sm font-bold">
          <ReceiptJapaneseYen size={15} />
          外来の会計
          <Fictional />
        </h2>
        <span className="text-ink-soft">
          {visit.name}　{visit.age}歳　{visit.department}　{visit.kind}　{date}
        </span>
        {settlement ? (
          <span className="inline-flex items-center gap-1 rounded bg-wakatake-soft px-1.5 py-0.5 text-[11px] font-bold text-wakatake">
            <CheckCircle2 size={12} />
            会計済み　{settlement.receiptNo}　{yen(settlement.yen)}（{settlement.method}）　{settlement.at.time} {settlement.by}
          </span>
        ) : (
          <span className="rounded bg-yamabuki-soft px-1.5 py-0.5 text-[11px] font-bold text-yamabuki">未収</span>
        )}
        <button type="button" onClick={() => setRuns((n) => n + 1)} disabled={busy} className="ml-auto inline-flex items-center gap-1 rounded border border-rule bg-sheet px-2 py-0.5 text-[11px] text-ink-soft hover:text-ink disabled:opacity-50">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          計算し直す
        </button>
      </div>
      <p className="hint text-[11px] text-ink-faint">
        この受診のオーダ（検査・画像・注射・処置）と院外処方せんから点数をサーバーで出し（医科診療行為マスター）、患者基本情報の保険（負担割合・公費・限度額）から患者負担をコードで計算します。「領収書」「診療明細書」は A4 で印刷、「入金」で会計済みになります（医事課）。
      </p>
      {error && <p className="rounded-md border border-shu/40 bg-shu-soft px-3 py-2 text-sm text-shu">{error}</p>}
      {!claim && !error && (
        <p className="flex items-center gap-1 text-xs text-ink-soft">
          <Loader2 size={12} className="animate-spin" />
          算定しています…
        </p>
      )}

      {claim && share && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          {/* 明細 */}
          <section aria-label="算定の明細" className="rounded-lg border border-rule bg-sheet p-3">
            <h3 className="mb-1 text-xs font-bold text-ink-soft">算定の明細（{claim.month.replace("-", "年")}月{claim.day}日）</h3>
            <table className="w-full text-[12px]">
              <thead className="text-[11px] text-ink-faint">
                <tr>
                  <th className="pr-2 text-left font-normal">区分</th>
                  <th className="pr-2 text-left font-normal">項目</th>
                  <th className="text-right font-normal">点数</th>
                  <th className="pl-2 text-right font-normal">回数</th>
                </tr>
              </thead>
              <tbody>
                {claim.acts.map((a, i) => (
                  <tr key={i} className="border-t border-rule-soft align-top">
                    <td className="pr-2 text-ink-soft">{sectionOf(a)}</td>
                    <td className="pr-2">
                      {a.parts.map((p, j) => (
                        <div key={j}>
                          {p.lines.map((l) => (
                            <div key={l.code} className={l.record === "IY" ? "text-ink-soft" : ""}>
                              {l.name}
                              {l.record === "IY" && l.quantity !== undefined ? <span className="nums ml-1">{l.quantity}{l.unit ?? ""}</span> : null}
                            </div>
                          ))}
                        </div>
                      ))}
                      <div className="hint mt-0.5 text-[10px] leading-snug text-ink-faint">{a.basis}</div>
                    </td>
                    <td className="nums text-right">
                      {a.parts.map((p, j) => (
                        <div key={j}>{p.points}</div>
                      ))}
                    </td>
                    <td className="nums pl-2 text-right">{a.count}</td>
                  </tr>
                ))}
                <tr className="border-t border-rule font-bold">
                  <td colSpan={2} className="py-1">
                    合計
                  </td>
                  <td className="nums py-1 text-right">{pts(claim.totalPoints)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
            {claim.issues.length > 0 && (
              <ul className="mt-2 space-y-1">
                {claim.issues.map((x) => {
                  const s = ISSUE_STYLE[x.level];
                  const Icon = s.icon;
                  return (
                    <li key={x.text} className={`flex items-start gap-1.5 rounded border px-2 py-1 text-[11px] ${s.cls}`}>
                      <Icon size={12} className="mt-0.5 shrink-0" />
                      <span className="shrink-0 font-bold">{s.label}</span>
                      <span className="text-ink">{x.text}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <details className="mt-2 text-[11px] text-ink-soft">
              <summary className="cursor-pointer">この試作では算定しないもの（{claim.excluded.length}）</summary>
              <ul className="ml-4 list-disc">
                {claim.excluded.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </details>
            <p className="hint mt-1 text-[10px] text-ink-faint">点数の出どころ：{claim.sources.join("、")}</p>
          </section>

          {/* 患者負担 */}
          <div className="space-y-3">
            <section aria-label="患者負担" className="rounded-lg border border-rule bg-sheet p-3">
              <h3 className="mb-1 flex flex-wrap items-center gap-2 text-xs font-bold text-ink-soft">
                患者負担
                <span className="font-normal">
                  {kindLabel}
                  {coverageOf(insurance) === "医保" ? `（${insurance.relation}）${rateLabel(insurance.rate)}・区分 ${insurance.incomeClass}` : ""}
                </span>
                {assumed && <span className="rounded bg-yamabuki-soft px-1.5 py-0.5 text-[10px] text-yamabuki">保険が未登録：年齢からの仮の保険</span>}
                {onOpenInsurance && (
                  <button type="button" onClick={onOpenInsurance} className="ml-auto rounded border border-rule bg-paper px-1.5 py-0.5 text-[11px] text-ai hover:border-ai">
                    保険を見る・変える（患者基本情報）
                  </button>
                )}
              </h3>
              <table className="w-full text-sm">
                <tbody>
                  {secs.map((s) => (
                    <tr key={s.name} className="border-b border-rule-soft">
                      <th className="py-0.5 text-left font-normal text-ink-soft">{s.name}</th>
                      <td className="nums py-0.5 text-right">{pts(s.points)}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-rule">
                    <th className="py-0.5 text-left">合計点数</th>
                    <td className="nums py-0.5 text-right font-bold">{pts(share.points)}</td>
                  </tr>
                  <tr className="border-b border-rule-soft">
                    <th className="py-0.5 text-left font-normal text-ink-soft">医療費（1点10円）</th>
                    <td className="nums py-0.5 text-right">{yen(share.costYen)}</td>
                  </tr>
                  {share.coverage === "医保" && (
                    <tr className="border-b border-rule-soft">
                      <th className="py-0.5 text-left font-normal text-ink-soft">一部負担金（{rateLabel(share.rate)}、10円未満四捨五入）</th>
                      <td className={`nums py-0.5 text-right ${share.kogakuYen ? "text-ink-faint line-through" : ""}`}>{yen(share.ichibuYen)}</td>
                    </tr>
                  )}
                  {share.limit && (
                    <tr className="border-b border-rule-soft">
                      <th className="py-0.5 text-left font-normal text-ink-soft">
                        自己負担限度額（外来）
                        <div className="text-[11px] text-ink-faint">{share.limit.formula}</div>
                        <div className="hint text-[10px] text-ink-faint">{share.limit.source}</div>
                      </th>
                      <td className="nums py-0.5 text-right">{yen(share.limit.yen)}</td>
                    </tr>
                  )}
                  {share.kohi && (
                    <tr className="border-b border-rule-soft">
                      <th className="py-0.5 text-left font-normal text-ink-soft">
                        公費 {share.kohi.kohi.lawNo} {share.kohi.kohi.name}（患者 {share.kohi.kohi.rate}%{share.kohi.kohi.capYen !== null ? `・上限 ${yen(share.kohi.kohi.capYen)}` : ""}）
                      </th>
                      <td className="nums py-0.5 text-right">{yen(share.kohi.patientYen)}</td>
                    </tr>
                  )}
                  <tr>
                    <th className="py-1.5 text-left text-base">お支払い</th>
                    <td className="nums py-1.5 text-right text-xl font-bold">{yen(share.patientYen)}</td>
                  </tr>
                </tbody>
              </table>
              {share.kogakuYen > 0 && <p className="mt-1 rounded border border-wakatake/40 bg-wakatake-soft px-2 py-1 text-[11px] text-wakatake">高額療養費 {yen(share.kogakuYen)} は保険者から病院に払われます（窓口で差し引き済み・現物給付）。</p>}
              {share.notes.map((n) => (
                <p key={n} className="mt-1 rounded border border-yamabuki/40 bg-yamabuki-soft px-2 py-1 text-[11px] text-yamabuki">
                  {n}
                </p>
              ))}
            </section>

            {/* 印刷・入金 */}
            <section aria-label="領収書・入金" className="rounded-lg border border-rule bg-sheet p-3">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => print(receiptNode(settlement ?? null), { portrait: true })} className="inline-flex items-center gap-1 rounded-md border border-rule bg-paper px-2.5 py-1 text-[12px] hover:border-ai">
                  <Printer size={13} />
                  領収書
                </button>
                <button type="button" onClick={() => print(detailNode(), { portrait: true })} className="inline-flex items-center gap-1 rounded-md border border-rule bg-paper px-2.5 py-1 text-[12px] hover:border-ai">
                  <Printer size={13} />
                  診療明細書
                </button>
                {!settlement && (
                  <>
                    {/* お支払いの方法: the whole label is the button (36px or taller), coloured when chosen. */}
                    <BigChoice label="お支払いの方法" name="opd-pay-method" value={method} onChange={setMethod} disabled={!!denySettle} className="ml-auto" options={PAY_METHODS.map((m) => ({ value: m, label: m }))} />
                    <button type="button" onClick={settle} disabled={!!emergency?.admittedAs || busy || !!error || !!denySettle || !method || !onSettle} className="rounded-md bg-ai px-3 py-1 text-sm font-bold text-white disabled:opacity-40">
                      入金（{yen(share.patientYen)}）
                    </button>
                  </>
                )}
              </div>
              <DenyNote action="settle" className="mt-1" />
              {!settlement && !denySettle && !method && <p className="mt-1 text-[11px] text-ink-faint">お支払いの方法（現金・カード）を選ぶと入金できます。</p>}
              {assumed && <p className="mt-1 text-[11px] text-yamabuki">保険が未登録のまま入金すると、仮の保険の額で領収することになります。先に患者基本情報で保険を登録してください。</p>}
            </section>
          </div>
        </div>
      )}

      {/* 未収の一覧 */}
      <section aria-label="今日の外来の未収" className="rounded-lg border border-rule bg-paper/50 p-3">
        <h3 className="mb-1 flex flex-wrap items-center gap-2 text-xs font-bold text-ink-soft">
          今日の外来の未収（診察が終わって会計がまだ）
          <span className="nums font-normal">
            {unpaid.length}人　／　入金 {t.count}件 {yen(t.yen)}（現金 {yen(t.byMethod.現金)}・カード {yen(t.byMethod.カード)}）
          </span>
        </h3>
        {unpaid.length === 0 ? (
          <p className="text-[12px] text-ink-faint">未収はありません。</p>
        ) : (
          <ul className="divide-y divide-rule-soft text-[12px]">
            {unpaid.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center gap-x-3 py-1">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${r.visit.status === "会計待ち" ? "bg-yamabuki-soft text-yamabuki" : "bg-paper text-ink-soft"}`}>{r.visit.status}</span>
                <b>{r.visit.name}</b>
                <span className="text-ink-soft">
                  {r.visit.age}歳　{r.visit.department}　{r.visit.kind}
                </span>
                {r.key === visitKey ? (
                  <span className="text-[11px] text-ink-faint">（この患者）</span>
                ) : (
                  onOpenVisit && (
                    <button type="button" onClick={() => onOpenVisit(r.visit.id)} className="rounded border border-rule bg-sheet px-1.5 py-0.5 text-[11px] text-ai hover:border-ai">
                      会計へ
                    </button>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <Sources items={[...OPD_CLAIM_SOURCES, ...FUTAN_SOURCES]} />
      <p className="hint text-[10px] text-ink-faint">1点10円で患者負担を出すこと、誰が入金を記録するか（医事課）は架空の病院の取り決めです。領収書・明細書の様式は療養担当規則5条の2（領収証・明細書の交付）に沿い、院の様式は架空です。生年月日 {formatShort(birth)} は保険の登録がなければ年齢から作った架空の日付です。</p>
      {sheet}
    </div>
  );
}

/** 領収書 (A4 portrait). The official columns of the 領収証 for 外来, the insurance and what was paid. */
function ReceiptSheet({ visit, date, sections: secs, share, insuranceLabel, assumed, receiptNo, method, by, time }: { visit: OpdPatient; date: string; sections: { name: string; points: number }[]; share: OutpatientShare; insuranceLabel: string; assumed: boolean; receiptNo?: string; method?: PayMethod; by: string; time: string }) {
  return (
    <div className="mx-auto w-[170mm] text-[10pt]">
      <p className="text-center text-[16pt] font-bold">領収書</p>
      <p className="text-center text-[9pt]">架空総合病院（架空）　神奈川県架空市（架空）</p>
      <div className="mt-4 flex justify-between">
        <span className="text-[12pt]">
          {visit.name} 様　<span className="text-[9pt]">{visit.age}歳</span>
        </span>
        <span className="nums">
          {date}　{receiptNo ?? "（入金前の控え）"}
        </span>
      </div>
      <table className="mt-3 w-full border-collapse text-[10pt]">
        <thead>
          <tr>
            {secs.map((s) => (
              <th key={s.name} className="border border-ink px-1 py-0.5 text-[9pt] font-normal">
                {s.name}
              </th>
            ))}
            <th className="border border-ink px-1 py-0.5 text-[9pt] font-normal">合計</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            {secs.map((s) => (
              <td key={s.name} className="nums border border-ink px-1 py-1 text-right">
                {s.points.toLocaleString("ja-JP")}
              </td>
            ))}
            <td className="nums border border-ink px-1 py-1 text-right font-bold">{share.points.toLocaleString("ja-JP")}点</td>
          </tr>
        </tbody>
      </table>
      <table className="mt-3 w-full text-[10pt]">
        <tbody>
          <tr>
            <th className="w-[45mm] py-0.5 text-left font-normal">保険</th>
            <td className="py-0.5">
              {insuranceLabel}
              {share.coverage === "医保" ? `　負担割合 ${rateLabel(share.rate)}` : ""}
              {assumed ? "（未登録：年齢からの仮）" : ""}
            </td>
          </tr>
          {share.coverage === "医保" && (
            <tr>
              <th className="py-0.5 text-left font-normal">保険の一部負担金</th>
              <td className="nums py-0.5">{yen(share.ichibuYen)}</td>
            </tr>
          )}
          {share.limit && share.kogakuYen > 0 && (
            <tr>
              <th className="py-0.5 text-left font-normal">高額療養費（窓口で差し引き）</th>
              <td className="nums py-0.5">−{yen(share.kogakuYen)}</td>
            </tr>
          )}
          {share.kohi && (
            <tr>
              <th className="py-0.5 text-left font-normal">公費 {share.kohi.kohi.lawNo}（患者負担）</th>
              <td className="nums py-0.5">{yen(share.kohi.patientYen)}</td>
            </tr>
          )}
          <tr>
            <th className="py-1 text-left text-[12pt]">領収額</th>
            <td className="nums py-1 text-[14pt] font-bold">{yen(share.patientYen)}</td>
          </tr>
          <tr>
            <th className="py-0.5 text-left font-normal">お支払いの方法</th>
            <td className="py-0.5">{method ?? "—"}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-4 text-right text-[9pt]">
        {time}　担当 {by}
      </p>
      <p className="mt-3 text-[8pt]">この領収書は医療費控除の申告に使えます（再発行はしません）。点数は診療報酬点数表、負担割合は健康保険法・高齢者医療確保法によります。架空の病院の試作で、実在の医療機関・患者ではありません。</p>
    </div>
  );
}

/** 診療明細書 (A4 portrait): every item with its points and count, by 区分. */
function DetailSheet({ visit, date, acts, total }: { visit: OpdPatient; date: string; acts: ClaimAct[]; total: number }) {
  return (
    <div className="mx-auto w-[170mm] text-[10pt]">
      <p className="text-center text-[16pt] font-bold">診療明細書</p>
      <p className="text-center text-[9pt]">架空総合病院（架空）</p>
      <div className="mt-3 flex justify-between">
        <span className="text-[12pt]">{visit.name} 様</span>
        <span className="nums">
          {date}　{visit.department}（{visit.kind}）
        </span>
      </div>
      <table className="mt-3 w-full border-collapse text-[9.5pt]">
        <thead>
          <tr className="border-b border-ink">
            <th className="w-[26mm] py-0.5 text-left font-normal">区分</th>
            <th className="py-0.5 text-left font-normal">項目名</th>
            <th className="w-[18mm] py-0.5 text-right font-normal">点数</th>
            <th className="w-[12mm] py-0.5 text-right font-normal">回数</th>
          </tr>
        </thead>
        <tbody>
          {acts.map((a, i) =>
            a.parts.map((p, j) => (
              <tr key={`${i}-${j}`} className="border-b border-ink/30 align-top">
                <td className="py-0.5">{j === 0 ? sectionOf(a) : ""}</td>
                <td className="py-0.5">
                  {p.lines.map((l) => (
                    <div key={l.code}>
                      {l.name}
                      {l.record === "IY" && l.quantity !== undefined ? <span className="nums ml-1">{l.quantity}{l.unit ?? ""}</span> : null}
                    </div>
                  ))}
                </td>
                <td className="nums py-0.5 text-right">{p.points}</td>
                <td className="nums py-0.5 text-right">{j === 0 ? a.count : ""}</td>
              </tr>
            )),
          )}
          <tr className="font-bold">
            <td colSpan={2} className="py-1">
              合計
            </td>
            <td className="nums py-1 text-right">{total.toLocaleString("ja-JP")}</td>
            <td />
          </tr>
        </tbody>
      </table>
      <p className="mt-3 text-[8pt]">薬剤は名称と量、検査・画像・処置は項目名を点数表の名称で書いています。架空の病院の試作です。</p>
    </div>
  );
}
