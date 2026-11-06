"use client";

import { checkDiseases } from "@/lib/billing/disease-check";
import { DiseaseCandidates, type DiseaseRequestProps } from "./billing/DiseaseCandidates";
import { displayText } from "@/lib/display-text";
import { OutpatientDesk, type OutpatientDeskProps } from "./billing/OutpatientDesk";
import { EmergencyDesk, type EmergencyDeskProps } from "./billing/EmergencyDesk";
import { pendingDraftCount } from "@/lib/billing/emergency-visit";
import { Loader2, ReceiptJapaneseYen, RefreshCw } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import type { ClaimIssue } from "@/lib/billing/model";
import type { PatientMonthPayload } from "@/lib/billing/payload";
import { insuranceRecords, insuranceSummary } from "@/lib/billing/registration";
import { reviewIssues, IJI_KINDS, ijiCounts, ijiRows, visitCounts, type IjiDesk, type IjiKind } from "@/lib/billing/worklist";
import { addDays, formatShort, isoDate, type CalendarDate } from "@/lib/dates";
import { diagnosisLabel, type Diagnosis } from "@/lib/diagnoses";
import type { Patient } from "@/lib/types";

const KIND_TONE: Record<IjiKind, string> = {
  保険の未登録: "border-shu/40 bg-shu-soft text-shu",
  会計がまだ: "border-yamabuki/40 bg-yamabuki-soft text-yamabuki",
  算定の要確認: "border-yamabuki/40 bg-yamabuki-soft text-yamabuki",
  病名漏れの候補: "border-yamabuki/40 bg-yamabuki-soft text-yamabuki",
  病名の未コード化: "border-fuji/40 bg-fuji-soft text-fuji",
};

/**
 * 医事課の仕事: every patient with what the 医事課 still has to do — 保険の未登録, 退院して会計がまだ,
 * 算定の要確認（今月分、算定の画面と同じ計算をサーバーで通す）, 未コード化の病名. Collected by code.
 */
export function IjiBoard({
  patients,
  dischargePlanOf,
  emergency,
  outpatient,
  charts = {},
  desk,
  diagnoses,
  today,
  nowTime,
  payload,
  onOpen,
  diseaseRequests,
  onDiseaseRequest,
}: DiseaseRequestProps & {
  patients: Patient[];
  /** The 退院 planned by a valid 退院 order (day from today and time), for the 会計 to prepare. */
  dischargePlanOf?: (patientId: string) => { day: number; time: string } | null;
  emergency?: EmergencyDeskProps;
  outpatient?: OutpatientDeskProps;
  charts?: Record<string, { drafts: unknown[] }>;
  desk: IjiDesk;
  diagnoses: Record<string, Diagnosis[]>;
  today: CalendarDate;
  nowTime: string;
  /** Every patient's month as the claim API takes it (with the registered insurance). */
  payload: () => PatientMonthPayload[];
  onOpen: (patientId: string, where: "billing" | "diagnoses") => void;
}) {
  const month = `${today.y}-${String(today.m).padStart(2, "0")}`;
  const [checks, setChecks] = useState<Record<string, ClaimIssue[]> | null>(null);
  const [unresolved, setUnresolved] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyTodo, setOnlyTodo] = useState(false);
  const [runs, setRuns] = useState(0);

  // The claims are computed when the screen opens and when asked again (not on every change of the ward).
  const request = useEffectEvent(() => ({ today: isoDate(today), nowTime, month, patients: payload() }));
  useEffect(() => {
    const ctl = new AbortController();
    const run = async () => {
      const body = request();
      if (!body.patients.length) return setChecks({});
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/receipt-check", { method: "POST", headers: { "content-type": "application/json" }, signal: ctl.signal, body: JSON.stringify(body) });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `エラー（${res.status}）`);
        setUnresolved((json.patients as {unresolved: number}[]).reduce((n, p) => n + p.unresolved, 0));
        setChecks(Object.fromEntries((json.patients as { id: string; issues: ClaimIssue[] }[]).map((p) => [p.id, reviewIssues(p.issues)])));
      } catch (e) {
        if (ctl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "算定の確かめができませんでした。");
      } finally {
        if (!ctl.signal.aborted) setBusy(false);
      }
    };
    run();
    return () => ctl.abort();
  }, [runs]);

  const diseaseCandidates = Object.fromEntries(payload().map(p => [p.patient.id, checkDiseases({ ...p, diagnoses: diagnoses[p.patient.id] ?? p.diagnoses, today: isoDate(today), nowTime, month, admittedOn: p.patient.admittedOn, dischargedOn: p.patient.dischargedOn })]));
  const rows = ijiRows(patients, desk, diagnoses, checks, diseaseCandidates);
  const counts = ijiCounts(
    rows,
    visitCounts(
      (outpatient?.visits ?? []).map(({ patient: p }) => ({ status: p.status, paid: !!outpatient?.book[`opd:${p.id}`] })),
      (emergency?.visits ?? []).map(({ patient: p }) => ({ admitted: !!p.admittedAs, paid: !!emergency?.book[`er:${p.id}`], insured: !!insuranceRecords(desk.insurance, `er:${p.id}`).length })),
      (outpatient?.visits ?? []).map(({ patient: p }) => !!desk.insurance[`opd:${p.id}`]?.length),
    ),
  );
  const shown = onlyTodo ? rows.filter((r) => r.todo.length) : rows;
  const byId = new Map(patients.map((p) => [p.id, p]));
  const day = (d: number) => formatShort(addDays(today, d));
  const link = "rounded border border-rule bg-sheet px-1.5 py-0.5 text-[11px] text-ai hover:border-ai";

  return (
    <section aria-label="医事課の仕事" className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper p-5">
      <h1 className="mb-1 flex items-center gap-1.5 text-lg font-bold">
        <ReceiptJapaneseYen size={18} />
        医事課の仕事
      </h1>


      <p className="mb-2 text-xs">請求内容の未解決 {unresolved ?? "…"}件（今月分）</p>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        {IJI_KINDS.map((k) => (
          <span key={k} className={`nums rounded-md border px-2 py-1 ${counts[k] ? KIND_TONE[k] : "border-rule bg-sheet text-ink-faint"}`}>
            {k} <b>{k === "算定の要確認" && !checks ? "…" : counts[k]}</b>
          </span>
        ))}
        <label className="ml-2 flex items-center gap-1 text-ink-soft">
          <input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} />
          やることがある患者だけ
        </label>
        <button type="button" onClick={() => setRuns((n) => n + 1)} disabled={busy} className="ml-auto flex items-center gap-1 rounded-md border border-rule bg-sheet px-2 py-1 text-ink-soft hover:text-ink disabled:opacity-50">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          算定を計算し直す
        </button>
      </div>
      {error && <p className="mb-3 rounded-md border border-shu/40 bg-shu-soft px-3 py-2 text-sm text-shu">{error}</p>}

      {outpatient && <OutpatientDesk {...outpatient} desk={desk} today={today} nowTime={nowTime} onOpen={onOpen} />}

      <table className="w-full border-collapse rounded-lg bg-sheet text-[12px]">
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className="px-2 py-1.5">患者</th>
            <th className="px-2">保険</th>
            <th className="px-2">退院・会計</th>
            <th className="px-2">算定の要確認（{Number(month.slice(5))}月分）</th>
            <th className="px-2">病名</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const p = byId.get(r.patientId)!;
            return (
              <tr key={r.patientId} className="border-b border-rule-soft align-top">
                <td className="px-2 py-1.5">
                  <button type="button" onClick={() => onOpen(p.id, "billing")} className="text-left font-bold text-ai underline-offset-2 hover:underline">
                    {p.room} {p.name}
                  </button>
                  {pendingDraftCount(charts, p.id) > 0 && <div className="text-[11px] text-ink-soft">下書き {pendingDraftCount(charts, p.id)}（医師の確定待ち）</div>}
                  <div className="nums text-[11px] text-ink-faint">
                    {p.id}・入院 {day(p.admittedOn)}・{p.attending}
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  {r.insurance ? (
                    <>
                      <div className="nums">{insuranceSummary(r.insurance.insurance)}</div>
                      <div className="nums text-[11px] text-ink-faint">
                        {r.insurance.action} {day(r.insurance.at.day)} {r.insurance.at.time} {displayText(r.insurance.by)}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-shu-soft px-1.5 py-0.5 font-bold text-shu">未登録</span>
                      <button type="button" onClick={() => onOpen(p.id, "billing")} className={link}>
                        登録する
                      </button>
                    </div>
                  )}
                </td>
                <td className="nums px-2 py-1.5">
                  {!r.discharge ? (
                    (() => { const plan = dischargePlanOf?.(p.id); return plan ? <span className="font-bold text-yamabuki">退院予定 {day(plan.day)} {plan.time}</span> : <span className="text-ink-faint">入院中</span>; })()
                  ) : r.settled ? (
                    <span className="text-wakatake">
                      退院 {day(r.discharge.day)}・会計済み（{r.settled.at.time} {displayText(r.settled.by)}）
                    </span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-yamabuki">
                        退院 {day(r.discharge.day)} {r.discharge.time}・会計がまだ
                      </span>
                      <button type="button" onClick={() => onOpen(p.id, "billing")} className={link}>
                        会計へ
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  {r.review === null ? (
                    <span className="text-ink-faint">{busy ? "計算中…" : "—"}</span>
                  ) : r.review.length === 0 ? (
                    <span className="text-ink-faint">なし</span>
                  ) : (
                    <div>
                      <ul className="space-y-0.5">
                        {r.review.slice(0, 3).map((i) => (
                          <li key={i.level + i.text} className="leading-snug">
                            <span className="mr-1 font-bold text-yamabuki">{i.level === "choose" ? "人が選ぶ" : "確かめる"}</span>
                            {displayText(i.text)}
                          </li>
                        ))}
                      </ul>
                      <button type="button" onClick={() => onOpen(p.id, "billing")} className={`mt-1 ${link}`}>
                        算定を開く{r.review.length > 3 ? `（ほか${r.review.length - 3}件）` : ""}
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  {r.diseaseCandidates.length > 0 && <details className="mb-2"><summary className="cursor-pointer font-bold text-yamabuki">病名漏れの候補 {r.diseaseCandidates.length}件</summary><DiseaseCandidates candidates={r.diseaseCandidates} patientId={p.id} diseaseRequests={diseaseRequests} onDiseaseRequest={onDiseaseRequest} /></details>}
                  {r.uncoded.length === 0 ? (
                    <span className="text-ink-faint">{(diagnoses[p.id] ?? []).length ? "すべてコードあり" : "病名なし"}</span>
                  ) : (
                    <div>
                      {r.uncoded.map((d) => (
                        <div key={d.id}>
                          <span className="mr-1 font-bold text-fuji">未コード化</span>
                          {diagnosisLabel(d)}
                        </div>
                      ))}
                      <button type="button" onClick={() => onOpen(p.id, "diagnoses")} className={`mt-1 ${link}`}>
                        病名を開く
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {emergency && <EmergencyDesk {...emergency} desk={desk} today={today} nowTime={nowTime} onOpen={onOpen} />}
      {shown.length === 0 && <p className="mt-3 text-xs text-ink-faint">やることがある患者はいません。</p>}
    </section>
  );
}

/* Help migration source (references and dynamic wording):
<p >
        保険の未登録・会計がまだ・算定の要確認・病名の未コード化がある患者を並べます。押すとその患者の算定か病名が開きます。
      </p>
*/
