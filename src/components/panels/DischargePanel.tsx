"use client";
import { DayInput } from "../DayInput";

import { displayText } from "@/lib/display-text";
import { Mic, Printer, Square } from "lucide-react";
import { DenyNote, useDeny, useMe } from "../RoleContext";
import { SummaryApproval } from "../SummaryList";
import { confirmSummary, summaryState } from "@/lib/summary-approval";
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { HOSPITAL } from "@/lib/billing/facility";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { OUTCOMES, ROUTES, SECTIONS, SUMMARY_DEADLINE_DAYS, SUMMARY_DEADLINE_SOURCE, labelOf, collectFacts, dischargeChecks, createDischargeDraft, type DischargeDraft, type Facts, type SectionKey } from "@/lib/discharge";
import type { Diagnosis } from "@/lib/diagnoses";
import { useSpeech } from "@/lib/use-speech";
import type { HistoryEntry, OrderEntry, Patient } from "@/lib/types";
import { CLAUDE, auditLog } from "@/lib/audit";
import { ageSex } from "@/lib/person";

import type { Draft } from "@/lib/drafts";
import type { AdmissionRequest } from "@/lib/admission";

interface Props {
  history?: HistoryEntry[];
  orderDrafts?: Draft[];
  admissionRequest?: AdmissionRequest;
  patient: Patient;
  today: CalendarDate;
  nowTime: string;
  doctor: string;
  entries: OrderEntry[];
  diagnoses: Diagnosis[];
  consentsPending: string[];
  directive?: string;
  draft?: DischargeDraft;
  onSave: (d: DischargeDraft) => void;
  onConfirm: (d: DischargeDraft) => void;
  onIssueLetter: (d: DischargeDraft) => void;
  /** The patient's attending doctor (whose team approves), and the approver's 承認・差し戻し. */
  attending?: string;
  onApprove?: (d: DischargeDraft) => void;
  onReturn?: (d: DischargeDraft) => void;
}

const noSubscribe = () => () => {};

/** 退院時サマリー and 診療情報提供書: facts by code, the doctor's account placed by Claude, signed by the doctor. */
export function DischargePanel({ patient, today, nowTime, doctor, entries, history, orderDrafts = [], admissionRequest, diagnoses, consentsPending, directive, draft, onSave, onConfirm, onIssueLetter, attending = patient.attending, onApprove, onReturn }: Props) {
  const me = useMe();
  const [tab, setTab] = useState<"summary" | "letter">(draft?.letter.to ? "letter" : "summary");
  const [d, setD] = useState<DischargeDraft>(
    () => draft ?? createDischargeDraft(patient, history ?? patient.history, orderDrafts, today, admissionRequest),
  );
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unplaced, setUnplaced] = useState("");
  const speech = useSpeech((t) => setText((x) => (x ? `${x}${t}` : t)));
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const facts = collectFacts(patient, entries, diagnoses, today, d.dischargeDay);
  const checks = dischargeChecks(patient, entries, consentsPending);
  const deny = useDeny()("discharge");
  const locked = d.status === "確定" || !!deny;
  const setSection = (k: SectionKey, v: string) => setD((x) => ({ ...x, sections: { ...x.sections, [k]: v } }));

  const place = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/discharge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `エラー（${res.status}）`);
      const s = json.sections as Record<SectionKey | "unplaced", string>;
      auditLog({ role: "AI", actor: CLAUDE, action: "退院時サマリーの口述を欄に分けた", patient: patient.name, detail: `${text.length}字` });
      setD((x) => ({ ...x, sections: Object.fromEntries(SECTIONS.map(({ key }) => [key, [x.sections[key], s[key]].filter(Boolean).join("\n")])) as Record<SectionKey, string> }));
      setUnplaced(s.unplaced);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み取れませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const doc = (print?: boolean) => (tab === "summary" ? <SummaryDoc d={d} patient={patient} facts={facts} directive={directive} today={today} print={print} /> : <LetterDoc d={d} patient={patient} facts={facts} today={today} doctor={doctor} print={print} />);
  return (
    <div className="space-y-3 text-[13px]">
      <DenyNote action="discharge" />
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex rounded-md border border-rule p-0.5">
          {(
            [
              ["summary", "退院時サマリー"],
              ["letter", "診療情報提供書"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={`rounded px-3 py-0.5 text-xs ${tab === k ? "bg-ink font-bold text-white" : "text-ink-soft"}`}>
              {l}
            </button>
          ))}
        </div>
        <label className="text-xs text-ink-soft">
          退院日{" "}
          <DayInput label="サマリの退院日付" disabled={locked} today={today} value={d.dischargeDay} onChange={dischargeDay => setD({ ...d, dischargeDay })} />
        </label>
        <label className="text-xs text-ink-soft">
          退院先 <input disabled={locked} value={d.destination} onChange={(e) => setD({ ...d, destination: e.target.value })} className="w-28 rounded border border-rule bg-sheet px-1" />
        </label>
        <label className="text-xs text-ink-soft">
          転帰{" "}
          <select disabled={locked} value={d.outcome} onChange={(e) => setD({ ...d, outcome: e.target.value })} className="rounded border border-rule bg-sheet px-1">
            {OUTCOMES.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-soft">
          入院経路{" "}
          <select disabled={locked} value={d.route} onChange={(e) => setD({ ...d, route: e.target.value })} className="rounded border border-rule bg-sheet px-1">
            {ROUTES.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <span className={`rounded px-1.5 text-[11px] font-bold ${summaryState(d) === "承認済" ? "bg-wakatake-soft text-wakatake" : summaryState(d) === "差し戻し" ? "bg-shu-soft text-shu" : "bg-yamabuki-soft text-yamabuki"}`}>{summaryState(d)}</span>
        <span className="text-[11px] text-ink-faint" title={SUMMARY_DEADLINE_SOURCE}>
          作成の期限：退院日の翌日から{SUMMARY_DEADLINE_DAYS}日以内（{formatShort(addDays(today, d.dischargeDay + SUMMARY_DEADLINE_DAYS))}まで。診療録管理体制加算１の要件）
        </span>
      </div>

      {(d.status === "確定" || d.returned) && (
        <SummaryApproval
          record={d}
          attending={attending}
          fmtDay={(n) => formatShort(addDays(today, n))}
          onApprove={(x) => {
            const next = { ...d, ...x };
            setD(next);
            onApprove?.(next);
          }}
          onReturn={(x) => {
            const next = { ...d, ...x };
            setD(next);
            onReturn?.(next);
          }}
          nowTime={nowTime}
        />
      )}

      {checks.length > 0 && (
        <div className="rounded border border-yamabuki/50 bg-yamabuki-soft/50 p-2 text-xs">
          <b className="text-yamabuki">退院の前に確かめること（コード）</b>
          <ul className="mt-0.5 list-disc pl-5">
            {checks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {tab === "summary" && !locked && (
        <section className="space-y-2 rounded-md border border-rule bg-paper p-3">
          <h3 className="font-bold">経過を話す・打つ（Claude は文を欄に分けるだけ。足したり言い換えたりしません）</h3>
          <div className="flex gap-1.5">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="例：右下腿の発赤と発熱で入院。…入院後セファゾリンで治療を始めたが…退院後は外来で…" className="flex-1 rounded border border-rule bg-sheet px-2 py-1 outline-none focus:border-ai" />
            <div className="flex flex-col gap-1">
              {speech.supported && (
                <button type="button" onClick={speech.listening ? speech.stop : speech.start} className="rounded border border-rule px-2 py-1" title="話して入力">
                  {speech.listening ? <Square size={14} /> : <Mic size={14} />}
                </button>
              )}
              <button type="button" disabled={!text.trim() || busy} onClick={place} className="rounded bg-ai px-3 py-1 text-xs font-bold text-white disabled:opacity-40">
                {busy ? "…" : "欄に分ける"}
              </button>
            </div>
          </div>
          {error && <p className="text-shu">{error}</p>}
          {unplaced && <p className="text-xs text-yamabuki">欄が決められなかった文：「{unplaced}」（必要なら下の欄に入れてください）</p>}
          {SECTIONS.map(({ key, label }) => (
            <label key={key} className="block text-xs text-ink-soft">
              {label}

              <textarea value={d.sections[key]} onChange={(e) => setSection(key, e.target.value)} rows={key === "course" ? 4 : 2} className="mt-0.5 w-full rounded border border-rule bg-sheet px-2 py-1 text-[13px] text-ink" />
            </label>
          ))}
        </section>
      )}

      {tab === "letter" && (
        <section className="grid grid-cols-2 gap-2 rounded-md border border-rule bg-paper p-3 text-xs">
          {(
            [
              ["to", "紹介先の医療機関"],
              ["dept", "診療科"],
              ["doctor", "先生のお名前"],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="text-ink-soft">
              {l}
              <input value={d.letter[k]} onChange={(e) => setD({ ...d, letter: { ...d.letter, [k]: e.target.value } })} className="mt-0.5 w-full rounded border border-rule bg-sheet px-2 py-1 text-[13px] text-ink" />
            </label>
          ))}
          <label className="col-span-2 text-ink-soft">
            紹介の目的
            <input value={d.letter.purpose} onChange={(e) => setD({ ...d, letter: { ...d.letter, purpose: e.target.value } })} placeholder="例：退院後の経過観察と血液検査のお願い" className="mt-0.5 w-full rounded border border-rule bg-sheet px-2 py-1 text-[13px] text-ink" />
          </label>
          <label className="col-span-2 flex items-center gap-1 text-ink-soft">
            <input type="checkbox" checked={!!d.letter.attach} onChange={(e) => setD({ ...d, letter: { ...d.letter, attach: e.target.checked } })} className="accent-ai" />
            退院後の治療計画・検査結果・画像の情報を添付する（退院の月かその翌月なら B009 注8 退院時診療状況添付加算）
          </label>
          <p className="col-span-2 text-ink-faint">経過・検査・処方は退院時サマリーと同じもの（カルテから）を載せます。</p>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {!locked && (
          <button type="button" onClick={() => onSave(d)} className="rounded border border-rule px-3 py-1 text-xs">
            書いたところまで残す
          </button>
        )}
        {tab === "summary" && !locked && (
          <button
            type="button"
            disabled={!d.sections.course.trim()}
            onClick={() => {
              const x: DischargeDraft = confirmSummary(d, me.name, { day: 0, time: nowTime });
              setD(x);
              onConfirm(x);
            }}
            className="rounded bg-wakatake px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
          >
            内容を確かめて確定（{me.name}）
          </button>
        )}
        {tab === "letter" && (
          <button
            type="button"
            disabled={!!deny || !d.letter.to.trim() || !d.letter.purpose.trim() || !d.sections.course.trim()}
            title={!d.sections.course.trim() ? "退院時サマリーの経過を先に書いてください" : undefined}
            onClick={() => {
              const x: DischargeDraft = { ...d, letter: { ...d.letter, issuedAt: { day: 0, time: nowTime } } };
              setD(x);
              onIssueLetter(x);
            }}
            className="rounded bg-ai px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
          >
            {d.letter.issuedAt ? `発行済み（${d.letter.issuedAt.time}）・もう一度記録` : "紹介状を発行する（算定に入る）"}
          </button>
        )}
        <button type="button" onClick={() => window.print()} className="ml-auto flex items-center gap-1 rounded border border-ai px-3 py-1 text-xs font-bold text-ai">
          <Printer size={13} />
          印刷（A4縦）
        </button>
      </div>

      <div className="rounded-lg border border-rule bg-sheet p-5 shadow-sm">{doc()}</div>
      {mounted && createPortal(<div className="print-consent hidden print:block">{doc(true)}</div>, document.body)}
    </div>
  );
}

function Rows({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="mb-2 break-inside-avoid">
      <h3 className="font-bold">■ {title}</h3>
      {items.length ? (
        <ul className="pl-4">
          {items.map((x, i) => (
            <li key={`${i}-${x}`}>・{x}</li>
          ))}
        </ul>
      ) : (
        <p className="pl-4 text-ink-faint">なし</p>
      )}
    </section>
  );
}

function Labs({ facts, today }: { facts: Facts; today: CalendarDate }) {
  if (!facts.labs.length) return null;
  return (
    <section className="mb-2 break-inside-avoid">
      <h3 className="font-bold">■ 主な検査（入院時 → 最新）</h3>
      <table className="nums ml-4 text-[12px]">
        <tbody>
          {facts.labs.map((l) => (
            <tr key={l.code}>
              <td className="pr-3">{l.name}</td>
              <td className="pr-2 text-right">{l.first.value}</td>
              <td className="pr-2 text-ink-faint">（{formatShort(addDays(today, l.first.day))}）→</td>
              <td className="pr-2 text-right font-bold">{l.last.value}</td>
              <td className="pr-2 text-ink-faint">（{formatShort(addDays(today, l.last.day))}）</td>
              <td className="text-ink-faint">{l.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Prose({ title, text }: { title: string; text: string }) {
  return (
    <section className="mb-2 break-inside-avoid">
      <h3 className="font-bold">■ {title}</h3>
      <p className="whitespace-pre-wrap pl-4">{text || <span className="text-ink-faint">（未記入）</span>}</p>
    </section>
  );
}

function SummaryDoc({ d, patient: p, facts, directive, today, print }: { d: DischargeDraft; patient: Patient; facts: Facts; directive?: string; today: CalendarDate; print?: boolean }) {
  return (
    <article className={`text-[12.5px] leading-relaxed text-ink ${print ? "print:text-[10.5px]" : ""}`}>
      <header className="mb-3 border-b-2 border-ink pb-2">
        <div className="flex justify-between text-[11px] text-ink-soft">
          <span>{HOSPITAL.name}</span>
          <span>{d.status}{d.confirmedAt ? `　${formatShort(addDays(today, d.confirmedAt.day))} ${d.confirmedAt.time} ${d.confirmedBy}` : ""}</span>
        </div>
        <h2 className="mt-1 text-center text-lg font-bold">退院時サマリー</h2>
        <div className="mt-2 grid grid-cols-2 gap-x-4 text-[12px]">
          <span>
            患者：<b>{p.name}</b>（{ageSex(p)}）ID {p.id}
          </span>
          <span>
            {p.department}　主治医 {p.attending}
          </span>
          <span>
            入院 {facts.admitted} → 退院 {facts.discharge}（{facts.days}日間）
          </span>
          <span>退院先：{d.destination}</span>
          <span>入院経路：{labelOf(ROUTES, d.route)}</span>
          <span>転帰：{labelOf(OUTCOMES, d.outcome)}</span>
        </div>
      </header>
      <Rows title="入院時診断" items={[facts.admissionDiagnosis]} />
      <Rows title="退院時診断（病名の一覧から）" items={facts.diagnoses} />
      <Rows title="アレルギー・薬剤禁忌" items={facts.allergies} />
      <Rows title="感染症" items={facts.infections} />
      {SECTIONS.slice(0, 4).map((s) => (
        <Prose key={s.key} title={s.label} text={d.sections[s.key]} />
      ))}
      <Rows title="注射（期間）" items={facts.injections} />
      <Rows title="処置" items={facts.procedures} />
      <Rows title="培養" items={facts.cultures} />
      <Rows title="画像" items={facts.imaging} />
      <Labs facts={facts} today={today} />
      <Rows title="退院時処方" items={facts.prescriptions} />
      {SECTIONS.slice(4).map((s) => (
        <Prose key={s.key} title={s.label} text={d.sections[s.key]} />
      ))}
      {directive && <Rows title="事前指示" items={[directive]} />}

    </article>
  );
}

function LetterDoc({ d, patient: p, facts, today, doctor, print }: { d: DischargeDraft; patient: Patient; facts: Facts; today: CalendarDate; doctor: string; print?: boolean }) {
  return (
    <article className={`text-[12.5px] leading-relaxed text-ink ${print ? "print:text-[10.5px]" : ""}`}>
      <h2 className="mb-3 text-center text-lg font-bold">診療情報提供書</h2>
      <div className="mb-3 flex justify-between text-[12px]">
        <div>
          <p>
            {d.letter.to || "（紹介先の医療機関）"}　{displayText(d.letter.dept)}
          </p>
          <p>{displayText(d.letter.doctor || "　　　　")} 先生　御侍史</p>
        </div>
        <div className="text-right">
          <p>{formatShort(addDays(today, d.letter.issuedAt?.day ?? 0))}</p>
          <p>{HOSPITAL.name}</p>
          <p>
            {p.department}　{displayText(doctor)}
          </p>
        </div>
      </div>
      <p className="mb-2">
        患者：<b>{p.name}</b> 様（{ageSex(p)}）
      </p>
      <p className="mb-2">平素より大変お世話になっております。下記の患者さんをご紹介いたします。</p>
      <Rows title="紹介の目的" items={d.letter.purpose ? [d.letter.purpose] : []} />
      <Rows title="傷病名" items={facts.diagnoses.length ? facts.diagnoses : [facts.admissionDiagnosis]} />
      <Rows title="アレルギー・薬剤禁忌" items={facts.allergies} />
      <Rows title="感染症" items={facts.infections} />
      <Prose title="経過" text={[`${facts.admitted}〜${facts.discharge} 入院。`, d.sections.course].join("\n")} />
      <Labs facts={facts} today={today} />
      <Rows title="培養" items={facts.cultures} />
      <Rows title="現在の処方" items={facts.prescriptions} />
      {d.letter.attach && <Rows title="添付" items={["退院後の治療計画", "検査結果（上の推移）", "画像の所見（上の一覧）"]} />}
      <Prose title="今後の方針" text={d.sections.plan} />
      <p className="mt-3">ご高診のほど、よろしくお願い申し上げます。</p>
      <p className="mt-3 text-[10px] text-ink-faint">事実はカルテから集め、文は医師が確認・編集したものです。</p>
    </article>
  );
}

/* Help migration source (references and dynamic wording):
<span >コピー元：{d.sources[key]}</span>
<p >病名・検査・処方・処置・培養・画像はカルテからコードで集めたもの。初期の文は記事・入院申込・退院オーダからコピーし、医師が確認・編集するもの。</p>
*/
