"use client";

import { displayText } from "@/lib/display-text";
import { Activity, Check, Droplet, KeyRound, Package, MessageSquareWarning, NotebookText, Pill, Printer, ScanText, Syringe, Tablets } from "lucide-react";
import { createPortal, flushSync } from "react-dom";
import { DrugLabel } from "./Labels";
import { DrugInfoSheet, MedBagFace, NotebookSticker } from "./HomeRxPrint";
import { bagLine, bagsOf } from "@/lib/discharge-rx";
import { DRUG_INFO_SOURCE, drugInfoOf } from "@/lib/drug-info";
import { labelFor } from "@/lib/mar";
import { txText } from "@/lib/procedures";
import { estimatedCcr } from "@/lib/clinical";
import { latestCre } from "@/lib/exams";
import { ageSex } from "@/lib/person";
import type { OrderEntry } from "@/lib/types";
import { TdmView } from "./TdmView";
import { DrugMarks } from "./DrugMarks";
import { NarcoticDesk } from "./NarcoticDesk";
import { ShidoPanel, type ShidoEntry } from "./ShidoPanel";
import { BroughtReportSheet } from "./BroughtReportSheet";
import { isNarcotic } from "@/lib/drug-class";
import { recordBrought } from "@/lib/narcotic-book";
import type { NarcoticBook } from "@/lib/narcotic-book";
import { drugCodesOf } from "@/lib/drug-class";
import { SourceLinks } from "./DraftCard";
import { type InteractionFinding, orderInteractions } from "@/lib/interactions";
import type { TdmReport } from "@/lib/tdm";
import { isExtraInjection } from "@/lib/pharmacy-work";
import { readNotebook } from "@/lib/notebook";
import { useState } from "react";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { abs } from "@/lib/flowsheet";
import { orderLines, oralName } from "@/lib/format";
import { alreadyOrdered, auditItems, daysOfCount, dispenseBlock, matchOral, queryOpen, type BroughtReport, type BroughtRow, type Query } from "@/lib/pharmacy";
import type { DayOffset } from "@/lib/types";
import { buildWorksheet, shiftWindow, timeLabel, type WorkPatient } from "@/lib/worksheet";
import { auditLog } from "@/lib/audit";
import { STEP_LABEL, TIMING_LABEL, oralKey, oralToDispense, packetsOf, qtyFormula, qtyText, recordStep, sameHands, slotRange, stepBlock, type OralPatient, type OralRecord, type OralRp, type OralStepName, type Packet } from "@/lib/oral-dispense";
import { STAFF } from "@/lib/roles";

export type ShidoRecord = ShidoEntry;

export interface PharmacyProps {
  expiryNotice?: import("react").ReactNode;
  onClose?: () => void;
  initialTab?: Tab;
  patientId?: string;
  people: WorkPatient[];
  today: CalendarDate;
  nowTime: string;
  audited: Record<string, string>;
  onAudit: (entryId: string) => void;
  queries: Query[];
  onAsk: (q: Omit<Query, "id" | "askedAt" | "by" | "status">) => void;
  reports: BroughtReport[];
  onReport: (r: Omit<BroughtReport, "id" | "at" | "by" | "status">) => void;
  shido: Record<string, ShidoRecord[]>;
  onShido: (patientId: string, rec: Omit<ShidoRecord, "at" | "day">) => void;
  dispensed: Record<string, string>;
  /** 血液製剤の払出 by 輸血部門 (by transfusion order id): lot numbers, time, who. */
  txIssued: Record<string, { lot: string; at: string; by: string }>;
  /** 病棟薬剤業務日誌: the pharmacist's own words today. */
  journal: { text: string; at: string }[];
  onJournal: (text: string) => void;
  /** 退院時の薬: 調剤・鑑査・説明 and the pharmacist's wording, by patient. */
  homeRx: Record<string, HomeRxRecord>;
  /** Patients discharged today (their 退院時の薬 can still be handed over and recorded). */
  dischargedPeople?: WorkPatient[];
  onHomeRx: (patientId: string, patch: Partial<HomeRxRecord>) => void;
  onDispense: (key: string) => void;
  /** 内服の調剤: 調剤・鑑査・払出 by Rp and the days counted (oral-dispense.ts oralKey). */
  oralRx: Record<string, OralRecord>;
  onOralRx: (key: string, rec: OralRecord) => void;
  tdm: TdmReport[];
  onTdm: (r: Omit<TdmReport, "id" | "at" | "by" | "status">) => void;
  /** 麻薬の管理 (narcotic-book.ts): 受払簿・施用票・返納・廃棄・事故. */
  narcoticPatientNames?: Record<string, string>;
  narcBook: NarcoticBook;
  onNarcBook: (f: (b: NarcoticBook) => NarcoticBook) => void;
  newId: () => string;
}

export type Tab = "audit" | "brought" | "shido" | "dispense" | "oral" | "home" | "narcotic" | "blood" | "tdm" | "journal";
const TABS: { key: Tab; label: string; icon: typeof Pill }[] = [
  { key: "audit", label: "処方監査・疑義照会", icon: MessageSquareWarning },
  { key: "brought", label: "持参薬鑑別", icon: ScanText },
  { key: "shido", label: "服薬指導", icon: Pill },
  { key: "dispense", label: "注射払出・ラベル", icon: Syringe },
  { key: "oral", label: "内服の調剤", icon: Tablets },
  { key: "home", label: "退院時の薬", icon: Package },
  { key: "narcotic", label: "麻薬", icon: KeyRound },
  { key: "blood", label: "血液製剤", icon: Droplet },
  { key: "tdm", label: "TDM", icon: Activity },
  { key: "journal", label: "業務日誌", icon: NotebookText },
];

/** How to use each tab (the pharmacist's day), shown at the top (can be folded). */


const PHARMACIST = STAFF.薬剤師.name;

/** Pharmacy ward workflows; authored records and deterministic checks. */
export function PharmacyView(props: PharmacyProps) {
  const p = props.patientId ? { ...props, people: props.people.filter((x) => x.patient.id === props.patientId), reports: props.reports.filter((r) => r.patientId === props.patientId), tdm: props.tdm.filter((r) => r.patientId === props.patientId) } : props;
  const [tab, setTab] = useState<Tab>(p.initialTab ?? "audit");
  return (
    <div role={p.onClose ? "dialog" : undefined} aria-label={p.onClose ? "患者の薬剤業務" : undefined} data-help-section={`department:pharmacy:${tab}`} className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-rule bg-sheet px-5 py-2">
        <h1 className="text-base font-bold">薬剤部（病棟）</h1>
        {(tab === "audit" || tab === "oral") && p.expiryNotice}
        {p.onClose && <button type="button" onClick={p.onClose} className="rounded border border-rule px-3 py-1 text-sm">カルテに戻る</button>}
        <div role="tablist" className="flex flex-wrap rounded-md border border-rule p-0.5 text-sm">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1 rounded px-2.5 py-0.5 ${tab === key ? "bg-ink font-bold text-white" : "text-ink-soft hover:text-ink"}`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper p-5">
        <div className="mx-auto max-w-[1100px]">
          {tab === "audit" && <Audit {...p} />}
          {tab === "brought" && <Brought {...p} people={p.patientId ? p.people.filter((x) => x.patient.id === p.patientId) : p.people} />}
          {tab === "shido" && <Shido {...p} />}
          {tab === "dispense" && <Dispense {...p} />}
          {tab === "oral" && <Oral {...p} />}
          {tab === "home" && <Home {...p} />}
          {tab === "narcotic" && <NarcoticDesk people={p.people} patientNames={p.narcoticPatientNames} today={p.today} nowTime={p.nowTime} book={p.narcBook} onBook={p.onNarcBook} newId={p.newId} onAudit={p.onAudit} blockOf={(id) => dispenseBlock(id, p.people, p.queries, p.audited)} />}
          {tab === "blood" && <Blood {...p} />}
          {tab === "tdm" && <TdmView today={p.today} people={p.patientId ? p.people.filter((x) => x.patient.id === p.patientId) : p.people} nowTime={p.nowTime} reports={p.tdm} onReport={p.onTdm} />}
          {tab === "journal" && <Journal {...p} />}
        </div>
      </div>
    </div>
  );
}

const card = "rounded-lg border border-rule bg-sheet";

// ---------------------------------------------------------------------------

function Audit({ people, today, nowTime, audited, onAudit, queries, onAsk }: PharmacyProps) {
  const nowAbs = abs(0, nowTime);
  const [onlyPending, setOnlyPending] = useState(false);
  const items = auditItems(people, -1440, nowAbs).filter((it) => !onlyPending || !audited[it.entry.id]);
  const [asking, setAsking] = useState<string | null>(null);
  const [text, setText] = useState("");
  return (
    <section className="space-y-2">
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />未監査だけ</label>
      {items.length === 0 && <p className="text-ink-faint">{onlyPending ? "未監査のオーダはありません。" : "新しいオーダはありません。"}</p>}
      {/* One card per prescription (same patient, time and doctor): the drugs of one order are read together. */}
      {groupBy(items, (it) => `${it.patient.id}|${it.entry.day}|${it.entry.time}|${it.entry.author}`).map((group) => {
        const head = group[0];
        const entries = people.find((x) => x.patient.id === head.patient.id)?.entries ?? [];
        return (
          <article key={head.entry.id} className={`${card} divide-y divide-rule-soft px-4 py-1.5 text-[13px]`}>
            <div className="flex flex-wrap items-baseline gap-2 py-1">
              <span className="text-xs text-ink-faint">
                {formatShort(addDays(today, head.entry.day))} {head.entry.time}　{displayText(head.entry.author)}
              </span>
              <b>
                {head.room}　{head.patient.name}
              </b>
              <span className="text-xs text-ink-soft">{head.patient.age}歳　{head.patient.weightKg}kg　推定CCr {estimatedCcr(head.patient, latestCre(head.patient)?.value)?.toFixed(0) ?? "—"} mL/分　アレルギー：{head.patient.allergies.join("、") || "なし"}</span>
              {(() => {
                const rest = group.filter((g) => !audited[g.entry.id] && !queries.some((q) => q.orderId === g.entry.id && q.status === "回答待ち"));
                return rest.length > 1 ? (
                  <button type="button" onClick={() => rest.forEach((g) => onAudit(g.entry.id))} className="ml-auto rounded border border-wakatake px-2 py-0.5 text-xs text-wakatake hover:bg-wakatake hover:text-white">
                    まとめて監査済にする（{rest.length}）
                  </button>
                ) : null;
              })()}
            </div>
            {group.map((it) => {
        const { main, detail } = orderLines(it.entry.order, today);
        const qs = queries.filter((q) => q.orderId === it.entry.id);
        const open = qs.find((q) => queryOpen(q, people.find((x) => x.patient.id === it.patient.id)?.entries ?? []));
        const changed = !open && qs.some((q) => q.status === "変更");
        return (
          <div key={it.entry.id} className="py-1.5">
            <div className="flex flex-wrap items-start gap-2">
            <div className={`min-w-0 flex-1 ${it.entry.status === "中止" ? "text-ink-faint line-through" : "font-bold"}`}>
              {main}
              <DrugMarks codes={drugCodesOf(it.entry.order)} />
            </div>
              <span className="ml-auto flex items-center gap-2 text-xs">
                {open ? (
                  <span className="rounded bg-yamabuki-soft px-1.5 py-0.5 font-bold text-yamabuki">疑義照会 {open.status === "回答待ち" ? "回答待ち" : "変更待ち（前のオーダが有効）"}</span>
                ) : changed ? (
                  <span className="rounded bg-tab px-1.5 py-0.5 text-ink-soft">疑義照会で変更（このオーダは中止済み）</span>
                ) : audited[it.entry.id] ? (
                  <span className="flex items-center gap-0.5 text-wakatake">
                    <Check size={13} />
                    監査済 {audited[it.entry.id]}
                  </span>
                ) : (
                  <>
                    <button type="button" onClick={() => onAudit(it.entry.id)} className="rounded border border-wakatake px-2 py-0.5 text-wakatake hover:bg-wakatake hover:text-white">
                      監査済にする
                    </button>
                    <button type="button" onClick={() => setAsking(it.entry.id)} className="rounded border border-yamabuki px-2 py-0.5 text-yamabuki hover:bg-yamabuki hover:text-white">
                      疑義照会
                    </button>
                  </>
                )}
              </span>
            </div>
            <div className="text-xs text-ink-soft">{displayText(detail)}</div>
            {it.checks.filter((c) => !c.text.startsWith("アレルギー：")).map((c) => (
              <div key={c.text} className={`mt-1 text-xs ${c.level === "ask" ? "font-bold text-yamabuki" : "text-ink-soft"}`}>
                {c.level === "ask" ? "確認　" : ""}
                {displayText(c.text)}
              </div>
            ))}
            <AuditInteractions
              entry={it.entry}
              entries={entries}
              // A pair inside this card is shown once, under the first drug of the pair.
              skip={(f) => group.some((g) => g.entry.id !== it.entry.id && group.indexOf(g) < group.indexOf(it) && drugCodesOf(g.entry.order).includes(f.other.code))}
              canAsk={!open && !audited[it.entry.id]}
              onAsk={(t) => {
                setAsking(it.entry.id);
                setText(t);
              }}
            />
            {qs.map((q) => (
              <div key={q.id} className="mt-1.5 rounded bg-paper px-2 py-1 text-xs">
                <b>照会</b> {q.askedAt} {displayText(q.by)}：{q.question}
                {q.status !== "回答待ち" && (
                  <div>
                    <b>回答</b> {q.answeredAt}：{q.status}
                    {q.answer ? `（${q.answer}）` : ""}
                  </div>
                )}
              </div>
            ))}
            {asking === it.entry.id && (
              <div className="mt-2 flex gap-2">
                <input value={displayText(text)} onChange={(e) => setText(e.target.value)} placeholder="照会の内容（例：腎機能から量の確認をお願いします）" className="flex-1 rounded border border-rule bg-paper px-2 py-1 text-sm outline-none" autoFocus />
                <button
                  type="button"
                  disabled={!text.trim()}
                  onClick={() => {
                    onAsk({ patientId: it.patient.id, orderId: it.entry.id, question: text.trim() });
                    setText("");
                    setAsking(null);
                  }}
                  className="rounded bg-yamabuki px-3 py-1 text-sm font-bold text-white disabled:opacity-40"
                >
                  医師に送る
                </button>
              </div>
            )}
          </div>
        );
      })}
          </article>
        );
      })}
    </section>
  );
}

function groupBy<T>(xs: T[], key: (x: T) => string): T[][] {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return [...m.values()];
}

// ---------------------------------------------------------------------------

/**
 * 併用禁忌・併用注意・配合 of a confirmed order against the patient's other running orders (code, from the
 * 電子添文), with the doctor's reason when one was entered. The pharmacist decides whether to ask the doctor.
 */
function AuditInteractions({ entry, entries, canAsk, onAsk, skip }: { entry: OrderEntry; entries: OrderEntry[]; canAsk: boolean; onAsk: (text: string) => void; skip?: (f: InteractionFinding) => boolean }) {
  const found = orderInteractions(entry, entries).filter((f) => !skip?.(f));
  if (!found.length) return null;
  const reasons = entry.order.type === "injection" || entry.order.type === "prescription" ? (entry.order.interactionReasons ?? []) : [];
  return (
    <ul className="mt-1.5 space-y-1">
      {found.map((f) => {
        const r = reasons.find((x) => x.pairId === f.pairId);
        const strong = f.needsReason;
        return (
          <li key={f.key} className={`rounded px-2 py-1 text-xs ${strong ? "bg-shu-soft" : "bg-yamabuki-soft/60"}`}>
            <b className={strong ? "text-shu" : "text-yamabuki"}>
              {f.level}
              {f.level === "配合" && strong ? "（電子添文：混ぜない）" : ""}
            </b>
            　{f.name} × {f.other.name}（{f.other.where}）：{displayText(f.text)}
            {r ? (
              <div className="mt-0.5 text-ink">
                <b>医師の理由</b>（{r.drugs}）：{displayText(r.reason)}
              </div>
            ) : strong ? (
              <div className="mt-0.5 text-shu">このオーダに医師の理由の記録はありません。</div>
            ) : null}
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2">
              <SourceLinks sources={f.sources} />
              {canAsk && (
                <button type="button" onClick={() => onAsk(`${f.level}（${f.name} × ${f.other.name}）について：`)} className="rounded border border-yamabuki/60 px-1.5 text-yamabuki hover:bg-yamabuki hover:text-white">
                  この件で疑義照会を書く
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const SAMPLE = `2026年10月20日　あおば内科クリニック
Rp1　ノルバスク錠5mg　1回1錠　1日1回　朝食後　28日分
Rp2　ラシックス錠20mg　1回1錠　1日1回　朝食後　28日分
Rp3　マグミット錠330mg　1回2錠　1日2回　朝夕食後　28日分
Rp4　カロナール錠500　1回1錠　頓用　疼痛時　10回分`;

function Brought({ people, today, nowTime, reports, onReport, narcBook, onNarcBook, newId }: PharmacyProps) {
  const [patientId, setPatientId] = useState(people[0]?.patient.id ?? "");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<BroughtRow[] | null>(null);
  const [comment, setComment] = useState("");
  const [printing, setPrinting] = useState<React.ReactNode | null>(null);
  const setRow = (i: number, patch: Partial<BroughtRow>) => setRows((rs) => rs!.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const printReport = (r: BroughtReport) => {
    const x = people.find((y) => y.patient.id === r.patientId);
    flushSync(() => setPrinting(<BroughtReportSheet r={r} patient={x?.patient} room={x?.room ?? ""} date={formatShort(today)} />));
    const done = () => {
      setPrinting(null);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
    auditLog({ role: "薬剤師", actor: PHARMACIST, action: "持参薬鑑別報告書を印刷した", patient: x?.patient.name, detail: `${r.rows.length}剤` });
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const person = people.find((x) => x.patient.id === patientId);

  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      const json = { rows: readNotebook(text) };
      if (!json.rows.length) throw new Error("薬名と1回量のある行を確認してください。");
      setRows(
        (json.rows as Omit<BroughtRow, "match" | "checked" | "decision">[]).map((r) => ({ ...r, match: matchOral(r.said, r.strength), checked: false, decision: null })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み取れませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className={`${card} space-y-2 p-4 text-[13px]`}>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            患者
            <select value={patientId} onChange={(e) => { setPatientId(e.target.value); setRows(null); }} className="rounded border border-rule bg-paper px-2 py-1">
              {people.map((x) => (
                <option key={x.patient.id} value={x.patient.id}>
                  {x.room}　{x.patient.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setText(SAMPLE)} className="rounded border border-rule px-2 py-1 text-xs text-ink-soft hover:text-ink">
            例文を入れる
          </button>
        </div>
        <textarea
          value={displayText(text)}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="お薬手帳の薬の行を打つか貼り付けます。氏名・生年月日・ID は入れないでください。"
          className="w-full rounded border border-rule bg-paper px-2 py-1.5 font-mono text-[12px] outline-none"
        />
        <div className="flex items-center gap-3">
          <button type="button" disabled={!text.trim() || busy} onClick={read} className="rounded bg-ai px-3 py-1.5 font-bold text-white disabled:opacity-40">
            {busy ? "読み取り中…" : "表にする"}
          </button>

        </div>
        {error && <p className="text-sm text-shu">{error}</p>}
      </div>

      {rows && person && (
        <div className={`${card} p-4 text-[13px]`}>
          <h3 className="mb-2 font-bold">
            鑑別　{person.room} {person.patient.name}
          </h3>
          <table className="nums w-auto table-auto self-start border-collapse">
            <thead className="text-left text-[11px] text-ink-faint">
              <tr>
                <th className="py-1 font-normal">手帳の記載</th>
                <th className="py-1 font-normal">用法</th>
                <th className="py-1 font-normal">院内の同じ成分・規格（コードで照合）</th>
                <th className="py-1 font-normal">実物の残数</th>
                <th className="py-1 font-normal">備考</th>
                <th className="py-1 font-normal">実物と確認</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const already = r.match ? alreadyOrdered(r.match, person.entries) : [];
                return (
                  <tr key={i} className="border-t border-rule-soft align-top">
                    <td className="py-1.5">
                      <b>{r.said}</b> {r.strength}
                    </td>
                    <td className="py-1.5">
                      1回{r.amount ?? "？"}
                      {r.unit}　{r.usage ?? (r.timings.length ? `1日${r.timings.length}回 ${r.timings.join("・")}` : `頓用 ${r.prn ?? ""}`)}
                      {r.daysLeft && !r.usage?.includes(`${r.daysLeft}日分`) ? `　${r.daysLeft}日分` : ""}
                    </td>
                    <td className="py-1.5">
                      {r.match ? (
                        <>
                          {oralName(r.match)}
                          <DrugMarks codes={[r.match]} />
                          {already.length > 0 && <div className="text-xs font-bold text-yamabuki">同じ成分がもう登録されています（{already.map((e) => (e.order.type === "prescription" ? e.order.category : "")).join("・")}）</div>}
                          {isNarcotic(r.match) && <div className="text-[11px] text-shu">持参した麻薬：続けるときは麻薬帳簿の受入欄に（ ）で書き、残高に加えません（麻薬管理マニュアル 第4(11)）。報告のあと「報告した鑑別」から記載できます。</div>}
                        </>
                      ) : (
                        <span className="text-shu">院内のマスターにありません</span>
                      )}
                    </td>
                    <td className="py-1.5 text-xs">
                      <input
                        value={r.counted ?? ""}
                        onChange={(e) => setRow(i, { counted: e.target.value === "" ? null : Number(e.target.value.replace(/[^\d.]/g, "")) })}
                        inputMode="decimal"
                        aria-label={`${r.said} の実物の残数`}
                        className="w-14 rounded border border-rule bg-paper px-1 py-0.5 text-right"
                      />
                      {r.unit}
                      {daysOfCount(r) && <div className="text-[10px] text-ink-soft">{daysOfCount(r)!.formula}</div>}
                    </td>
                    <td className="py-1.5">
                      <input value={r.note ?? ""} onChange={(e) => setRow(i, { note: e.target.value })} placeholder="服薬状況・識別など" aria-label={`${r.said} の備考`} className="w-40 rounded border border-rule bg-paper px-1 py-0.5 text-xs" />
                    </td>
                    <td className="py-1.5">
                      <label className="flex cursor-pointer items-center gap-1 text-xs">
                        <input type="checkbox" className="accent-ai" checked={r.checked} onChange={() => setRows((rs) => rs!.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)))} />
                        確認した
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="所見：服薬の状況、自己管理か看護師管理か、手帳と実物の違いなど（報告書に載る）" aria-label="鑑別の所見" className="mt-2 w-full rounded border border-rule bg-paper px-2 py-1 text-[12px] outline-none" />
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              disabled={!rows.length || !rows.every((r) => r.checked)}
              onClick={() => {
                onReport({ patientId, rows, ...(comment.trim() ? { comment: comment.trim() } : {}) });
                setRows(null);
                setText("");
                setComment("");
              }}
              className="rounded bg-ai px-3 py-1.5 font-bold text-white disabled:opacity-40"
            >
              医師へ報告する
            </button>
            <p className="text-xs text-ink-soft">全行を実物と確認すると報告できます。</p>
          </div>
        </div>
      )}

      {reports.length > 0 && (
        <div className={`${card} p-4 text-[13px]`}>
          <h3 className="mb-1 font-bold">報告した鑑別</h3>
          <ul className="space-y-1">
            {reports.map((r) => {
              const pt = people.find((x) => x.patient.id === r.patientId);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-2">
                  <span>
                    {r.at}　{pt?.room} {pt?.patient.name}　{r.rows.length}剤　<b className={r.status === "指示済" ? "text-wakatake" : "text-yamabuki"}>{r.status}</b>
                  </span>
                  {(r.status === "指示済" || r.status === "指示の下書き") && <span className="text-ink-soft">（{r.rows.map((x) => `${x.said}：${x.decision ?? "—"}`).join("、")}）</span>}
                  <button type="button" onClick={() => printReport(r)} className="flex items-center gap-1 rounded border border-rule px-1.5 py-0.5 text-xs hover:border-ai hover:text-ai">
                    <Printer size={12} />
                    持参薬鑑別報告書
                  </button>
                  {r.rows
                    .filter((x) => x.match && isNarcotic(x.match) && x.decision === "持参薬で継続" && x.counted)
                    .map((x) =>
                      narcBook.ledger.some((l) => l.kind === "持参" && l.orderId === r.id && l.code === x.match) ? (
                        <span key={x.said} className="text-xs text-wakatake">麻薬帳簿に（{x.counted}）で記載済み</span>
                      ) : (
                        <button
                          key={x.said}
                          type="button"
                          onClick={() => {
                            onNarcBook((b) => recordBrought(b, x.match!, x.counted!, PHARMACIST, { day: 0, time: nowTime }, `${pt?.patient.name ?? ""}（ID ${r.patientId}）`, r.id, newId));
                            auditLog({ role: "薬剤師", actor: PHARMACIST, action: "持参した麻薬を麻薬帳簿に（ ）で記載した", patient: pt?.patient.name, detail: `${x.said} ${x.counted}${x.unit}` });
                          }}
                          className="rounded border border-shu px-1.5 py-0.5 text-xs text-shu hover:bg-shu-soft"
                        >
                          持参の麻薬を帳簿に（{x.counted}）で記載
                        </button>
                      ),
                    )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {printing && typeof document !== "undefined" && createPortal(<div className="hidden bg-white p-[8mm] print:block">{printing}</div>, document.body)}
    </section>
  );
}

// ---------------------------------------------------------------------------

function Shido({ people, today, shido, onShido, reports, patientId }: PharmacyProps) {
  return <ShidoPanel people={patientId ? people.filter((x) => x.patient.id === patientId) : people} reports={reports} today={today} records={shido} onRecord={onShido} />;
}

// ---------------------------------------------------------------------------

function Dispense({ people, today, nowTime, dispensed, onDispense, audited, queries, onAudit }: PharmacyProps) {
  // Before dispensing: no open 疑義照会, and audited when written since yesterday (pharmacy.ts dispenseBlock).
  const blockOf = (orderId: string): string | null => dispenseBlock(orderId, people, queries, audited);
  // 明日分 (the usual daily dispensing) or 今日 (臨時・追加: every dose of today, past ones included, so that
  // one ordered for "now" or not yet dispensed stays on the list; the dispensed ones are marked).
  const [which, setWhich] = useState<"tomorrow" | "today">("tomorrow");
  const nowAbs = abs(0, nowTime);
  // After midnight the clock runs on (24:30 …): "today" is then the next calendar day, and 明日分 the one after.
  const dayNow = Math.floor(nowAbs / 1440);
  const { lo, hi } = which === "tomorrow" ? shiftWindow("all", dayNow + 1) : { lo: dayNow * 1440, hi: (dayNow + 1) * 1440 };
  const sheet = buildWorksheet(people, lo, hi, nowAbs);
  const doses = sheet.timed.filter((i) => i.kind === "注射" && i.at !== null && (which === "tomorrow" || people.some((p) => p.entries.some((e) => e.id === i.orderId && isExtraInjection(e, dayNow)))));
  const byPatient = people.map((x) => ({ ...x, doses: doses.filter((d) => d.patientId === x.patient.id) })).filter((x) => x.doses.length);
  const [scan, setScan] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [printing, setPrinting] = useState<React.ReactNode | null>(null);
  const labelsOf = (x: (typeof byPatient)[number]) =>
    x.doses.map((d) => (
      <DrugLabel
        key={labelFor(d.orderId, d.at!)}
        p={{ id: x.patient.id, name: x.patient.name, kana: x.patient.kana, ageSex: ageSex(x.patient), where: `${x.patient.ward} ${x.room}`, allergies: x.patient.allergies }}
        d={{ code: labelFor(d.orderId, d.at!), when: timeLabel(d.at!, -99, today), main: d.main, detail: d.detail, drugs: drugCodesOf(x.entries.find((e) => e.id === d.orderId)?.order) }}
      />
    ));
  const print = (nodes: React.ReactNode, who: string, n: number) => {
    flushSync(() => setPrinting(<div className="flex flex-wrap content-start gap-[3mm]">{nodes}</div>));
    const done = () => {
      setPrinting(null);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
    auditLog({ role: "薬剤師", actor: PHARMACIST, action: "注射ラベルを印刷した", patient: who, detail: `${n}枚` });
  };
  // 鑑査: read the label stuck on what was picked; it must be one of tomorrow's doses (照合 by code).
  const inspect = () => {
    const code = scan.trim().toUpperCase();
    if (!code) return;
    const hit = doses.find((d) => labelFor(d.orderId, d.at!) === code);
    if (!hit) setResult({ ok: false, text: `「${code}」は${which === "tomorrow" ? "明日" : "今日"}の注射のどの回でもありません。取りそろえを確かめてください。` });
    else {
      const key = `${hit.orderId}|${hit.at}`;
      const block = blockOf(hit.orderId);
      if (block) setResult({ ok: false, text: `${hit.name}さん ${hit.main}：${block}` });
      else if (dispensed[key]) setResult({ ok: false, text: `この回（${hit.name}さん ${timeLabel(hit.at!, -99, today)}）はもう払い出しています。` });
      else {
        onDispense(key);
        auditLog({ role: "薬剤師", actor: PHARMACIST, action: "鑑査一致・払出", patient: hit.name, detail: `${hit.main}　${timeLabel(hit.at!, -99, today)}` });
        setResult({ ok: true, text: `一致：${hit.name}さん　${timeLabel(hit.at!, -99, today)}　${hit.main}。払出の印を付けました。` });
      }
    }
    setScan("");
  };
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
<span className="mr-2 flex flex-wrap rounded-md border border-rule p-0.5 align-middle">
          {(
            [
              ["tomorrow", "明日分"],
              ["today", "今日（臨時・追加）"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={which === k} onClick={() => { setWhich(k); setScan(""); setResult(null); }} className={`rounded px-2 py-0.5 ${which === k ? "bg-ink font-bold text-white" : "text-ink-soft"}`}>
              {l}
            </button>
          ))}
        </span>
<span>{formatShort(addDays(today, which === "tomorrow" ? dayNow + 1 : dayNow))}</span>
      </div>

      <div className={`${card} flex flex-wrap items-center gap-2 p-3 text-[13px]`}>
        <b>鑑査</b>
        <input
          value={scan}
          onChange={(e) => setScan(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && inspect()}
          placeholder="ラベルのバーコードを読む（リーダーは Enter まで打ちます）"
          aria-label="ラベルのバーコード"
          className="nums min-w-64 flex-1 rounded border border-rule bg-paper px-2 py-1 font-mono"
        />
        <button type="button" onClick={inspect} className="rounded-md bg-ai px-3 py-1 font-bold text-white">
          照合
        </button>
        <button type="button" onClick={() => print(byPatient.flatMap(labelsOf), "全員", doses.length)} disabled={!doses.length} className="flex items-center gap-1 rounded-md border border-rule px-3 py-1 disabled:opacity-40">
          <Printer size={14} />
          全員のラベル（{doses.length}枚）
        </button>
        {result && <p className={`w-full font-bold ${result.ok ? "text-wakatake" : "text-shu"}`}>{displayText(result.text)}</p>}
      </div>
      {byPatient.map((x) => (
        <div key={x.patient.id} className={`${card} p-4 text-[13px]`}>
          <h3 className="mb-1 flex items-center gap-2 font-bold">
            {x.room}　{x.patient.name}
            <button type="button" onClick={() => print(labelsOf(x), x.patient.name, x.doses.length)} className="ml-auto flex items-center gap-1 rounded border border-rule px-2 py-0.5 text-xs font-normal hover:border-ai hover:text-ai">
              <Printer size={13} />
              ラベルを印刷（{x.doses.length}枚）
            </button>
          </h3>
          <ul className="divide-y divide-rule-soft">
            {x.doses.map((d) => {
              const key = `${d.orderId}|${d.at}`;
              return (
                <li key={key} className="flex items-baseline gap-3 py-1">
                  <span className="nums w-24 font-bold">{d.at !== null ? timeLabel(d.at, which === "tomorrow" ? dayNow + 1 : dayNow, today) : ""}</span>
                  <span className="flex-1">
                    {d.main}
                    <DrugMarks codes={drugCodesOf(x.entries.find((e) => e.id === d.orderId)?.order)} />　<span className="text-xs text-ink-soft">{displayText(d.detail)}</span>
                  </span>
                  <span className="nums font-mono text-[11px] text-ink-faint">{labelFor(d.orderId, d.at!)}</span>
                  {blockOf(d.orderId) && !dispensed[key] ? (
                    <span className="max-w-56 text-[11px] font-bold text-shu" title={blockOf(d.orderId)!}>
                      {blockOf(d.orderId)!.startsWith("疑義") ? "疑義照会の回答待ち" : "未監査"}
                      {blockOf(d.orderId)!.startsWith("まだ監査") && <button type="button" onClick={() => onAudit(d.orderId)} className="ml-2 text-ai underline">監査済にする</button>}
                    </span>
                  ) : dispensed[key] ? (
                    <span className="flex items-center gap-0.5 text-xs text-wakatake">
                      <Check size={12} />
                      払出 {dispensed[key]}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        auditLog({ role: "薬剤師", actor: PHARMACIST, action: "払い出した（ラベルを読まずに）", patient: x.patient.name, detail: `${d.main}　${timeLabel(d.at!, -99, today)}` });
                        if (!blockOf(d.orderId) && !dispensed[key]) onDispense(key);
                      }}
                      title="鑑査の欄でラベルを読むと、ここが自動で付きます" className="rounded border border-ai px-2 py-0.5 text-xs text-ai hover:bg-ai hover:text-white">
                      払い出す
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {printing && typeof document !== "undefined" && createPortal(<div className="hidden bg-white p-[5mm] print:block">{printing}</div>, document.body)}
      {byPatient.length === 0 && <p className="text-ink-faint">明日の注射はありません。</p>}

    </section>
  );
}

// ---------------------------------------------------------------------------
// 内服の調剤: 定期 (from tomorrow, N days) and today's 臨時, Rp by Rp: 調剤 → 鑑査 → 払出 (who and when),
// amounts counted in code (oral-dispense.ts), and 配薬 labels, one per day and timing (as on 一包化 packets).
// ---------------------------------------------------------------------------

/** A fictional colleague, so that 鑑査 can be done by someone other than the one who prepared it. */
const COLLEAGUE = "薬剤師 吉田";
const STEPS: OralStepName[] = ["prepared", "checked", "issued"];

/** 配薬ラベル: one packet (a day and a timing) with every drug taken then. */
function PacketLabel({ x, pack, date }: { x: OralPatient; pack: Packet; date: string }) {
  return (
    <div className="h-[34mm] w-[64mm] break-inside-avoid overflow-hidden rounded border border-ink/60 bg-white p-1.5 text-[8pt] leading-snug text-ink print:rounded-none">
      <div className="flex items-baseline gap-1 border-b border-ink/40 pb-0.5">
        <b className="text-[11pt]">{x.patient.name}</b>
        <span className="nums ml-auto">{x.room}</span>
      </div>
      <div className="nums flex items-baseline gap-2">
        <span className="text-[7pt]">ID {x.patient.id}</span>
        <b className="ml-auto text-[10pt]">
          {date}　{TIMING_LABEL[pack.timing]}
        </b>
      </div>
      <ul className="nums mt-0.5">
        {pack.drugs.map((d, i) => (
          <li key={i}>
            {d.name}{d.name.includes(d.strength) ? "" : ` ${d.strength}`}　<b>{d.per}{d.unit}</b>
          </li>
        ))}
      </ul>
      {x.patient.allergies.length > 0 && <div className="text-[7pt] font-bold">アレルギー：{x.patient.allergies.join("、")}</div>}
    </div>
  );
}

function Oral({ people, today, nowTime, audited, queries, oralRx, onOralRx, onAudit }: PharmacyProps) {
  const [mode, setMode] = useState<"定期" | "臨時">("定期");
  const [days, setDays] = useState(7);
  const [checker, setChecker] = useState(PHARMACIST);
  const [printing, setPrinting] = useState<React.ReactNode | null>(null);
  const nowAbs = abs(0, nowTime);
  const list = oralToDispense(people, mode === "定期" ? { kind: "定期", days } : { kind: "臨時" }, nowAbs).filter((x) => x.rps.length);
  const date = formatShort(today).replace(/（.）/, "");
  const day = (d: DayOffset) => formatShort(addDays(today, d));
  const blockOf = (rp: OralRp) => rp.lines.some((l) => isNarcotic(l.code)) ? "麻薬の画面で払出" : rp.orderIds.map((id) => dispenseBlock(id, people, queries, audited)).find((b) => b) ?? null;
  const fresh = (rp: OralRp) => !!oralRx[oralKey(rp)]?.prepared && oralRx[oralKey(rp)]?.qty === qtyText(rp);
  const done = (rp: OralRp, s: OralStepName) => fresh(rp) && !!oralRx[oralKey(rp)]?.[s];
  const act = (x: OralPatient, rp: OralRp, step: OralStepName) => {
    const key = oralKey(rp);
    if (stepBlock(step, oralRx[key], rp, blockOf(rp))) return;
    const by = step === "checked" ? checker : PHARMACIST;
    onOralRx(key, recordStep(oralRx[key], step, rp, { by, at: `${date} ${nowTime}` }));
    auditLog({ role: "薬剤師", actor: by, action: `内服を${STEP_LABEL[step]}した`, patient: x.patient.name, detail: `${rp.category}　${rp.lines.map((l) => `${l.name} ${l.total}${l.unit}`).join("・")}` });
  };
  const labelsOf = (x: OralPatient) => packetsOf(x.rps).map((pk) => <PacketLabel key={`${x.patient.id}-${pk.day}-${pk.timing}`} x={x} pack={pk} date={day(pk.day)} />);
  const print = (nodes: React.ReactNode, who: string, n: number) => {
    flushSync(() => setPrinting(<div className="flex flex-wrap content-start gap-[3mm]">{nodes}</div>));
    const end = () => {
      setPrinting(null);
      window.removeEventListener("afterprint", end);
    };
    window.addEventListener("afterprint", end);
    window.print();
    auditLog({ role: "薬剤師", actor: PHARMACIST, action: "配薬ラベルを印刷した", patient: who, detail: `${n}枚` });
  };
  const labelCount = list.reduce((n, x) => n + packetsOf(x.rps).length, 0);
  const rpCount = list.reduce((n, x) => n + x.rps.length, 0);
  const issuedCount = list.reduce((n, x) => n + x.rps.filter((rp) => done(rp, "issued")).length, 0);
  const range = (rp: OralRp) => {
    const r = slotRange(rp);
    return r ? `${day(r.first.day)} ${r.first.timing}〜${day(r.last.day)} ${r.last.timing}` : "";
  };
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
<span className="mr-2 flex flex-wrap rounded-md border border-rule p-0.5 align-middle">
          {(
            [
              ["定期", "定期"],
              ["臨時", "臨時（今日の新規）"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} className={`rounded px-2 py-0.5 ${mode === k ? "bg-ink font-bold text-white" : "text-ink-soft"}`}>
              {l}
            </button>
          ))}
        </span>
{mode === "定期" ? (
          <>
            明日（{day(1)}）から
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="定期の日数" className="mx-1 rounded border border-rule bg-paper px-1 py-0.5">
              {[3, 7, 14].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            日分
          </>
        ) : (
          "今日の臨時（全日数）＋定期の今日の分"
        )}
      </div>

      <div className={`${card} flex flex-wrap items-center gap-3 p-3 text-[13px]`}>
        <label className="flex items-center gap-2">
          鑑査する人
          <select value={checker} onChange={(e) => setChecker(e.target.value)} className="rounded border border-rule bg-paper px-2 py-0.5">
            <option value={PHARMACIST}>{displayText(PHARMACIST)}（自分）</option>
            <option value={COLLEAGUE}>{displayText(COLLEAGUE)}</option>
          </select>
        </label>
        <span className="nums text-ink-soft">
          Rp {rpCount}件　払出済み {issuedCount}件
        </span>
        <button type="button" onClick={() => print(list.flatMap(labelsOf), "全員", labelCount)} disabled={!labelCount} className="ml-auto flex items-center gap-1 rounded-md border border-rule px-3 py-1 disabled:opacity-40">
          <Printer size={14} />
          全員の配薬ラベル（{labelCount}枚）
        </button>
      </div>
      {list.map((x) => {
        const leave = x.entries.find((e) => e.status === "有効" && e.order.type === "procedure" && e.order.leave?.kind === "退院");
        const n = packetsOf(x.rps).length;
        return (
          <article key={x.patient.id} className={`${card} p-4 text-[13px]`}>
            <h3 className="mb-1 flex flex-wrap items-center gap-2 font-bold">
              {x.room}　{x.patient.name}
              {leave && leave.order.type === "procedure" && <span className="text-xs font-normal text-yamabuki">退院の予定 {day(leave.order.start.day)}</span>}
              {x.patient.allergies.length > 0 && <span className="text-xs font-normal text-shu">アレルギー：{x.patient.allergies.join("、")}</span>}
              <span className="ml-auto flex flex-wrap gap-1 font-normal">
                {STEPS.map((s) => {
                  const ok = x.rps.filter((rp) => !stepBlock(s, oralRx[oralKey(rp)], rp, blockOf(rp)));
                  return (
                    <button key={s} type="button" disabled={!ok.length} onClick={() => ok.forEach((rp) => act(x, rp, s))} className="rounded border border-rule px-2 py-0.5 text-xs hover:border-ai hover:text-ai disabled:opacity-40">
                      まとめて{STEP_LABEL[s]}（{ok.length}）
                    </button>
                  );
                })}
                <button type="button" onClick={() => print(labelsOf(x), x.patient.name, n)} disabled={!n} className="flex items-center gap-1 rounded border border-rule px-2 py-0.5 text-xs hover:border-ai hover:text-ai disabled:opacity-40">
                  <Printer size={13} />
                  配薬ラベル（{n}枚）
                </button>
              </span>
            </h3>
            <ol className="divide-y divide-rule-soft">
              {x.rps.map((rp, i) => {
                const rec = oralRx[oralKey(rp)];
                const block = blockOf(rp);
                const stale = !!rec?.prepared && !fresh(rp);
                return (
                  <li key={oralKey(rp)} className="flex flex-wrap items-start gap-3 py-2">
                    <div className="min-w-64 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <b>Rp{i + 1}</b>
                        <span className={`rounded px-1.5 text-[11px] ${rp.category === "臨時" ? "bg-yamabuki-soft text-yamabuki" : "bg-tab text-ink-soft"}`}>
                          {rp.category}
                          {rp.first ? "（初回・今日の分）" : ""}
                        </span>
                        <span>{rp.how}</span>
                        <span className="nums text-xs text-ink-soft">{range(rp)}</span>
                      </div>
                      {rp.lines.map((l) => (
                        <div key={l.orderId} className="nums">
                          {l.name}{l.name.includes(l.strength) ? "" : ` ${l.strength}`}
                          <DrugMarks codes={[l.code]} />　<span className="text-xs text-ink-soft">{qtyFormula(l, rp.timings.length)}</span>　<b>計 {l.total}{l.unit}</b>
                        </div>
                      ))}
                      <div className="text-[11px] text-ink-faint">
                        処方 {day(rp.writtenAt.day)} {rp.writtenAt.time}　{displayText(rp.doctor)}
                      </div>
                      {rp.unbounded && <div className="text-[11px] font-bold text-shu">日数の指定がないので、量を数えられません。医師に日数を確かめてください。</div>}
                      {block && block !== "麻薬の画面で払出" && <div className="text-[11px] font-bold text-shu">{block}</div>}
                      {rp.orderIds.filter((id) => dispenseBlock(id, people, queries, audited)?.startsWith("まだ監査")).map((id) => <button key={id} type="button" onClick={() => onAudit(id)} className="mr-2 text-xs text-ai underline">監査済にする</button>)}
                      {stale && (
                        <div className="text-[11px] font-bold text-yamabuki">
                          調剤（{rec!.prepared!.at} {displayText(rec!.prepared!.by)}）のあとで処方が変わりました。調剤し直してください。
                        </div>
                      )}
                      {!stale && sameHands(rec) && <div className="text-[11px] text-yamabuki">調剤した人と同じ薬剤師が鑑査しました（1人で行った記録）。</div>}
                    </div>
                    <div className="flex gap-1.5">
                      {rp.lines.some((l) => isNarcotic(l.code)) ? <button type="button" disabled className="rounded border border-rule px-2 py-1 text-xs text-ink-soft">麻薬の画面で払出</button> : STEPS.map((s, j) => {
                        const why = stepBlock(s, rec, rp, block);
                        const d = done(rp, s) ? rec![s]! : null;
                        return (
                          <div key={s} className={`flex w-28 flex-col gap-0.5 rounded-md border px-2 py-1 ${d ? "border-wakatake/50 bg-wakatake-soft/40" : "border-rule"}`}>
                            <span className="text-[11px] font-bold text-ink-soft">
                              {"①②③"[j]}
                              {STEP_LABEL[s]}
                            </span>
                            {d ? (
                              <span className="nums text-[11px] leading-tight text-wakatake">
                                <Check size={11} className="inline" /> {d.at.split(" ")[1]}
                                <span className="block truncate">{displayText(d.by.replace("薬剤師 ", ""))}</span>
                              </span>
                            ) : (
                              <button type="button" disabled={!!why} title={why ?? undefined} onClick={() => act(x, rp, s)} className="self-start rounded border border-ai px-1.5 py-0.5 text-[11px] text-ai hover:bg-ai hover:text-white disabled:border-rule disabled:text-ink-faint disabled:hover:bg-transparent">
                                {s === "prepared" && stale ? "調剤し直した" : `${STEP_LABEL[s]}した`}
                              </button>
                            )}
                            {why && !d && <span className="text-[10px] text-ink-soft">{why}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ol>
            {x.prn.length > 0 && <p className="mt-1 text-[11px] text-ink-faint">頓用（回数が決まらないので数えない）：{displayText(x.prn.map((q) => `${q.name} ${q.text}`).join("／"))}</p>}
          </article>
        );
      })}
      {list.length === 0 && <p className="text-ink-faint">{mode === "定期" ? "定期の内服はありません。" : "今日出た臨時・定期の内服はありません（医師がカルテの「内服」から出すと、ここに入ります）。"}</p>}
      {printing && typeof document !== "undefined" && createPortal(<div className="hidden bg-white p-[5mm] print:block">{printing}</div>, document.body)}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 血液製剤: transfusion orders confirmed by doctors, issued with the product's lot number (日報).
// ---------------------------------------------------------------------------

function Blood({ people, today, txIssued }: PharmacyProps) {
  const orders = people.flatMap((x) => x.entries.filter((e): e is OrderEntry => e.status === "有効" && e.order.type === "procedure" && !!e.order.tx).map((e) => ({ x, e })));
  const issuedToday = orders.filter(({ e }) => txIssued[e.id]);
  return (
    <section className="space-y-3">
      {orders.length === 0 && <p className="text-ink-faint">輸血のオーダはありません（医師がカルテの「輸血」から出します）。</p>}
      {orders.map(({ x, e }) => {
        const o = e.order.type === "procedure" ? e.order : null;
        const done = txIssued[e.id];
        return (
          <article key={e.id} className={`${card} flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]`}>
            <b>
              {x.room}　{x.patient.name}
            </b>
            <span>{displayText(o?.tx ? txText(o.tx) : "")}</span>
            <span className="text-xs text-ink-soft">
              {o ? `${formatShort(addDays(today, o.start.day))} ${o.start.time ?? ""}` : ""}　{displayText(e.author)}
            </span>
            {done ? (
              <span className="ml-auto text-xs text-wakatake">
                払出 {done.at}　製造番号 {done.lot}（{displayText(done.by)}）
              </span>
            ) : (
              <span className="ml-auto text-xs text-ink-soft">まだ払い出していません</span>
            )}
          </article>
        );
      })}
      {issuedToday.length > 0 && (
        <div className={`${card} p-3 text-[12px]`}>
          <h3 className="mb-1 font-bold">今日の払出（日報）</h3>
          <table className="nums w-auto table-auto self-start">
            <tbody>
              {issuedToday.map(({ x, e }) => (
                <tr key={e.id} className="border-t border-rule-soft">
                  <td className="py-0.5 pr-2">{txIssued[e.id].at}</td>
                  <td className="pr-2">{x.patient.name}</td>
                  <td className="pr-2">{displayText(e.order.type === "procedure" && e.order.tx ? txText(e.order.tx) : "")}</td>
                  <td className="font-mono">{txIssued[e.id].lot}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 病棟薬剤業務日誌: today's work counted by code, with the pharmacist's words.
// ---------------------------------------------------------------------------

function Journal({ people, nowTime, audited, queries, reports, shido, dispensed, oralRx, txIssued, tdm, journal, onJournal, homeRx }: PharmacyProps) {
  const [text, setText] = useState("");
  const shidoToday = Object.values(shido).flat().filter((r) => r.day === 0).length;
  const lines: [string, number][] = [
    ["処方監査（監査済み）", Object.keys(audited).length],
    ["疑義照会", queries.length],
    ["うち処方が変わったもの", queries.filter((q) => q.status === "変更").length],
    ["持参薬鑑別の報告", reports.length],
    ["服薬指導", shidoToday],
    ["注射の払出（回）", Object.keys(dispensed).length],
    ["内服の払出（Rp）", Object.values(oralRx).filter((r) => r.issued).length],
    ["血液製剤の払出", Object.keys(txIssued).length],
    ["退院時の薬の説明", Object.values(homeRx).filter((r) => r.handed).length],
    ["TDM の報告", tdm.length],
    ["担当の患者", people.length],
  ];
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <table className={`${card} nums self-start text-[13px]`}>
        <tbody>
          {lines.map(([k, v]) => (
            <tr key={k} className="border-b border-rule-soft">
              <th className="px-3 py-1.5 text-left font-normal text-ink-soft">{k}</th>
              <td className="px-3 py-1.5 text-right text-base font-bold">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={`${card} space-y-2 p-3 text-[13px]`}>
        <h3 className="text-xs font-bold text-ink-soft">所感（{nowTime} 時点）</h3>
        {journal.map((j, i) => (
          <p key={i} className="whitespace-pre-wrap border-l-2 border-ai/40 pl-2">
            <span className="nums block text-[11px] text-ink-faint">{j.at}</span>
            {displayText(j.text)}
          </p>
        ))}
        <textarea value={displayText(text)} onChange={(e) => setText(e.target.value)} rows={4} placeholder="例：5階東の持参薬鑑別2件。バンコマイシンの TDM は明日の採血で再評価。" aria-label="業務日誌の所感" className="w-full rounded border border-rule bg-paper px-2 py-1" />
        <button
          type="button"
          disabled={!text.trim()}
          onClick={() => {
            onJournal(text.trim());
            setText("");
          }}
          className="rounded-md bg-ai px-4 py-1.5 font-bold text-white disabled:opacity-40"
        >
          書き残す
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 退院時の薬: 退院時処方 → 調剤 → 鑑査 → 説明して渡す, with 薬袋, the 薬剤情報提供文書 and the
// お薬手帳 sticker printed from the order. Amounts are counted in code; the words can be edited.
// ---------------------------------------------------------------------------

export interface HomeRxRecord {
  dispensed?: { by: string; at: string };
  checked?: { by: string; at: string };
  handed?: { by: string; at: string; note: string };
  /** The pharmacist's own wording of 気をつけること, by drug code. */
  care?: Record<string, string[]>;
}

function Home({ people, dischargedPeople = [], today, nowTime, homeRx, onHomeRx, queries, audited, onAudit }: PharmacyProps) {
  const [printing, setPrinting] = useState<React.ReactNode | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const date = formatShort(today).replace(/（.）/, "");
  const list = [...people, ...dischargedPeople].map((x) => ({ x, bags: bagsOf(x.entries) })).filter((r) => r.bags.length);
  const print = (node: React.ReactNode, what: string, who: string) => {
    flushSync(() => setPrinting(node));
    const done = () => {
      setPrinting(null);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
    auditLog({ role: "薬剤師", actor: PHARMACIST, action: `${what}を印刷した`, patient: who });
  };
  if (!list.length) return <p className="text-ink-faint">退院時処方はありません（医師が内服の区分「退院時」で出します）。</p>;
  return (
    <section className="space-y-4">
      {list.map(({ x, bags }) => {
        const rec = homeRx[x.patient.id] ?? {};
        const pending = x.entries.filter((e) => e.status === "有効" && e.order.type === "prescription" && e.order.category === "退院時").map((e) => ({ id: e.id, block: dispenseBlock(e.id, [...people, ...dischargedPeople], queries, audited) })).filter((e) => e.block);
        const block = pending[0]?.block;
        const hp = { id: x.patient.id, name: x.patient.name, kana: x.patient.kana, ageSex: ageSex(x.patient), allergies: x.patient.allergies };
        const care = (code: string) => rec.care?.[code] ?? drugInfoOf(code).care;
        const by = { dispensed: rec.dispensed?.by.replace("薬剤師 ", ""), checked: rec.checked?.by.replace("薬剤師 ", "") };
        const leave = x.entries.find((e) => e.status === "有効" && e.order.type === "procedure" && e.order.leave?.kind === "退院");
        const leaveText = leave && leave.order.type === "procedure" ? `退院 ${formatShort(addDays(today, leave.order.start.day))} ${leave.order.start.time ?? ""}` : "退院日は未入力";
        const step = (label: string, done: { by: string; at: string } | undefined, can: boolean, act: () => void, warn?: string) => (
          <div className={`flex min-w-40 flex-1 flex-col gap-1 rounded-md border px-3 py-2 ${done ? "border-wakatake/50 bg-wakatake-soft/40" : "border-rule"}`}>
            <span className="text-xs font-bold text-ink-soft">{label}</span>
            {done ? (
              <span className="flex items-center gap-1 text-xs text-wakatake">
                <Check size={12} />
                {done.at}　{displayText(done.by)}
              </span>
            ) : (
              <button type="button" disabled={!can} onClick={act} className="self-start rounded border border-ai px-2 py-0.5 text-xs text-ai hover:bg-ai hover:text-white disabled:opacity-40">
                {label.replace(/^[①-③]/, "")}した
              </button>
            )}
            {warn && <span className="text-[11px] text-yamabuki">{warn}</span>}
          </div>
        );
        return (
          <article key={x.patient.id} className={`${card} space-y-3 p-4 text-[13px]`}>
            <h3 className="flex flex-wrap items-baseline gap-2 font-bold">
              {x.room}　{x.patient.name}
              <span className="text-xs font-normal text-ink-soft">
                {leaveText}　／　処方 {formatShort(addDays(today, bags[0].at.day))} {bags[0].at.time} {displayText(bags[0].doctor)}
              </span>
            </h3>
            <ol className="space-y-1">
              {bags.map((b, i) => (
                <li key={b.rp} className="nums">
                  <b>Rp{i + 1}</b>（{b.kind}）{bagLine(b)}
                  <span className="ml-2 text-xs text-ink-soft">計 {b.drugs.map((d) => `${d.name} ${d.total ?? "？"}${d.unit}`).join("・")}</span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              {step("①調剤", rec.dispensed, !block, () => {
                if (block) return;
                auditLog({ role: "薬剤師", actor: PHARMACIST, action: "退院時処方を調剤した", patient: x.patient.name });
                onHomeRx(x.patient.id, { dispensed: { by: PHARMACIST, at: `${date} ${nowTime}` } });
              }, block ?? undefined)}
              {pending.filter((e) => e.block?.startsWith("まだ監査")).map((e) => <button key={e.id} type="button" onClick={() => onAudit(e.id)} className="text-xs text-ai underline">監査済にする</button>)}
              {step(
                "②鑑査",
                rec.checked,
                !!rec.dispensed && !block,
                () => {
                  auditLog({ role: "薬剤師", actor: PHARMACIST, action: "退院時処方を鑑査した", patient: x.patient.name });
                  onHomeRx(x.patient.id, { checked: { by: PHARMACIST, at: `${date} ${nowTime}` } });
                },
                rec.dispensed && !rec.checked ? "調剤した人とは別の薬剤師が鑑査するのが望ましい（このデモの薬剤師は1人です）" : undefined,
              )}
              <div className={`flex min-w-56 flex-[2] flex-col gap-1 rounded-md border px-3 py-2 ${rec.handed ? "border-wakatake/50 bg-wakatake-soft/40" : "border-rule"}`}>
                <span className="text-xs font-bold text-ink-soft">③説明して渡す</span>
                {rec.handed ? (
                  <span className="text-xs text-wakatake">
                    <Check size={12} className="inline" /> {rec.handed.at}　{displayText(rec.handed.by)}
                    {rec.handed.note && <span className="block text-ink">{displayText(rec.handed.note)}</span>}
                  </span>
                ) : (
                  <>
                    <input value={note[x.patient.id] ?? ""} onChange={(e) => setNote((m) => ({ ...m, [x.patient.id]: e.target.value }))} placeholder="誰に・何を説明したか（例：本人と長女に。ふらつき時は連絡）" aria-label="説明の記録" className="rounded border border-rule bg-paper px-2 py-0.5 text-xs" />
                    <button
                      type="button"
                      disabled={!!block || !rec.checked || !(note[x.patient.id] ?? "").trim()}
                      onClick={() => {
                        auditLog({ role: "薬剤師", actor: PHARMACIST, action: "退院時の薬を説明して渡した", patient: x.patient.name, detail: note[x.patient.id] });
                        onHomeRx(x.patient.id, { handed: { by: PHARMACIST, at: `${date} ${nowTime}`, note: note[x.patient.id].trim() } });
                      }}
                      className="self-start rounded border border-ai px-2 py-0.5 text-xs text-ai hover:bg-ai hover:text-white disabled:opacity-40"
                    >
                      説明して渡した
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => print(<div className="flex flex-wrap gap-[4mm]">{bags.map((b) => <MedBagFace key={b.rp} p={hp} b={b} date={date} by={by} />)}</div>, "薬袋", x.patient.name)} className="flex items-center gap-1 rounded-md border border-rule px-3 py-1 hover:border-ai hover:text-ai">
                <Printer size={14} />
                薬袋（{bags.length}枚）
              </button>
              <button type="button" onClick={() => print(<DrugInfoSheet p={hp} bags={bags} care={care} date={date} pharmacist={PHARMACIST} />, "薬剤情報提供文書", x.patient.name)} className="flex items-center gap-1 rounded-md border border-rule px-3 py-1 hover:border-ai hover:text-ai">
                <Printer size={14} />
                お薬の説明書（A4）
              </button>
              <button type="button" onClick={() => print(<NotebookSticker p={hp} bags={bags} date={date} doctor={bags[0].doctor} />, "お薬手帳のシール", x.patient.name)} className="flex items-center gap-1 rounded-md border border-rule px-3 py-1 hover:border-ai hover:text-ai">
                <Printer size={14} />
                お薬手帳のシール
              </button>
            </div>
            <details className="rounded-md border border-rule-soft bg-paper p-2">
              <summary className="cursor-pointer text-xs font-bold text-ink-soft">説明書の「気をつけること」を見る・直す</summary>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {bags.flatMap((b) =>
                  b.drugs.map((d) => (
                    <label key={`${b.rp}-${d.code}`} className="block text-xs">
                      <b>
                        {d.name}{d.name.includes(d.strength) ? "" : ` ${d.strength}`}
                      </b>
                      <span className="ml-1 text-ink-soft">{d.info.what}</span>
                      <textarea
                        value={care(d.code).join("\n")}
                        onChange={(e) => onHomeRx(x.patient.id, { care: { ...(rec.care ?? {}), [d.code]: e.target.value.split("\n") } })}
                        rows={3}
                        aria-label={`${d.name} の気をつけること`}
                        className="mt-0.5 w-full rounded border border-rule bg-white px-2 py-1"
                      />
                    </label>
                  )),
                )}
              </div>
              <p className="mt-1 text-[11px] text-ink-faint">1行が1項目です。最初の文面は添付文書をもとにした要約（{DRUG_INFO_SOURCE.label}）で、印刷の前に薬剤師が確かめます。</p>
            </details>
            <div className="flex flex-wrap items-start gap-3 overflow-x-auto rounded-md border border-rule bg-paper p-2">
              {bags.map((b) => (
                <MedBagFace key={b.rp} p={hp} b={b} date={date} by={by} />
              ))}
              <NotebookSticker p={hp} bags={bags} date={date} doctor={bags[0].doctor} />
            </div>
          </article>
        );
      })}
      {printing && typeof document !== "undefined" && createPortal(<div className="hidden bg-white p-[8mm] print:block">{printing}</div>, document.body)}
    </section>
  );
}

/* Help migration source (references and dynamic wording):
<span >オーダからコードで計算。</span>
*/

/* ヘルプへ移動した説明:
手帳の記載と院内の薬との照合はコードで表にし、薬剤師が実物と照らして確かめます。
すべての行を実物と確認すると押せます。医師はカルテの右上で、薬ごとに「持参薬で継続・院内の薬に切替・中止」を選びます。
  の注射を、患者ごと・1回ごとに並べます（持続の点滴は1本ごと）。ラベルを印刷し、取りそろえた薬のラベルを読んで鑑査すると払出の印が付きます。
  量はオーダの開始・日数・中止から服用の回数をコードで数え、1回量を掛けます。持参薬と退院時処方は入りません。頓用は回数が決まらないので数えません。
*/
