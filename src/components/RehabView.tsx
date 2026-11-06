"use client";
import { TimeInput } from "@/components/TimeInput";

import { sessionNote } from "@/lib/rehab-record";
import type { NoteEntry, VitalSign } from "@/lib/types";
import { RehabVitals } from "./RehabVitals";
import { ExecutionHistory, ExecutionUndo } from "./ExecutionUndo";
import { cancelExecution } from "@/lib/mar";

// リハビリテーション部: 予定表（療法士ごとの予約）→ 受付・実施（時刻・内容・単位）→ ADL（BI）→ 実施計画書 → 一覧・単位.
// The prescriptions come from the doctors' charts (リハビリ処方). Therapists and records are fictional.

import { CalendarDays, ClipboardCheck, ClipboardList, FileText, Footprints, ListChecks } from "lucide-react";
import { useState } from "react";
import { auditLog } from "@/lib/audit";
import { BI_DROP_NOTE, BI_ITEMS, BI_SOURCES, biDrops, biOf, biProblems, biTotal, FIM_NOTE, type BiEval } from "@/lib/barthel";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import {
  bookingClashes,
  categoryOf,
  DISCIPLINE_NAME,
  EARLY_NOTE,
  earlyAddition,
  FACILITY_NOTE,
  holidayUntil,
  isRehabHoliday,
  patientDayUnits,
  progressOf,
  REHAB_RULES,
  REHAB_SOURCES,
  rehabPrescriptions,
  sessionProblems,
  SLOT_TIMES,
  therapistLoad,
  THERAPISTS,
  treatmentStart,
  UNIT_RULE,
  unitsOf,
  type Discipline,
  type RehabBooking,
  type RehabDesk,
  type RehabPlace,
  type RehabRx,
  type RehabSession,
} from "@/lib/rehab";
import type { WorkPatient } from "@/lib/worksheet";
import { Fictional, Sources, SubTabs } from "./DeskParts";
import { RehabPlanForm } from "./RehabPlanForm";
import { DenyNote, useDeny, useMe } from "./RoleContext";

interface Props {
  onNote?: (patientId: string, note: NoteEntry) => void;
  people: WorkPatient[];
  desk: RehabDesk;
  onDesk: (f: (d: RehabDesk) => RehabDesk) => void;
  nowTime: string;
  today: CalendarDate;
  /** The tab to open with (予定表 unless given). */
  initialTab?: Tab;
}

type Tab = "schedule" | "work" | "bi" | "plan" | "list";
const card = "rounded-lg border border-rule bg-sheet";
const field = "rounded border border-rule bg-paper px-1.5 py-0.5 outline-none focus:border-ai";
const plus = (t: string, m: number) => {
  const [h, mm] = t.split(":").map(Number);
  const x = h * 60 + mm + m;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};

/** リハビリテーション部. */
export function RehabView(p: Props) {
  const [tab, setTab] = useState<Tab>(p.initialTab ?? "schedule");
  const [receipt, setReceipt] = useState<{ bookingId: string; text: string } | null>(null);
  const rxs = rehabPrescriptions(p.people);
  const fmt = (d: number) => formatShort(addDays(p.today, d));
  const todays = p.desk.bookings.filter((b) => b.day === 0 && !p.desk.sessions.some((s) => s.bookingId === b.id && (s.recordedAt || s.notDone)));
  return (
    <section aria-label="リハビリテーション部" className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="flex items-center gap-1.5 text-lg font-bold">
          <Footprints size={18} className="text-ai" />
          リハビリテーション部
          <Fictional />
        </h1>
        <SubTabs
          label="リハビリテーション部の画面"
          value={tab}
          onChange={(next) => { setReceipt(null); setTab(next); }}
          tabs={[
            { key: "schedule", label: "予定表", icon: CalendarDays },
            { key: "work", label: "受付・実施", icon: ClipboardList, badge: todays.length },
            { key: "bi", label: "ADL（BI）", icon: ClipboardCheck },
            { key: "plan", label: "実施計画書", icon: FileText },
            { key: "list", label: "一覧・単位", icon: ListChecks },
          ]}
        />
      </header>
      <div className="mx-auto max-w-[1150px] space-y-3 px-5 py-4 text-[13px]">
        <p className="hint text-[12px] text-ink-soft">
          医師がカルテの「オーダ › その他 › リハビリ」で出したリハビリ処方の患者が並びます。療法士は「予定表」で予約し、「受付・実施」で開始・終了の時刻と訓練の内容を記録します（単位はコードが数えます）。ADL は Barthel Index で評価します。実施計画書は医師が作り、医師か療法士・看護師が説明します。右上の「自分」で「療法士」を選びます（デモではログインの代わり）。
        </p>
        {tab === "schedule" && <Schedule {...p} rxs={rxs} />}
        {tab === "work" && <Work {...p} rxs={rxs} bookings={p.desk.bookings.filter((b) => todays.includes(b) || b.id === receipt?.bookingId)} receipt={receipt} onReceipt={setReceipt} />}
        {tab === "bi" && <Bi {...p} rxs={rxs} fmt={fmt} />}
        {tab === "plan" && <Plans {...p} rxs={rxs} fmt={fmt} />}
        {tab === "list" && <List {...p} rxs={rxs} fmt={fmt} />}
        <p className="text-[11px] text-ink-faint">{FACILITY_NOTE} 療法士・予約・記録・評価はすべて架空です。</p>
        <Sources items={[REHAB_SOURCES.kokuji, REHAB_SOURCES.tsuchi, REHAB_SOURCES.form, REHAB_SOURCES.facility]} />
      </div>
    </section>
  );
}

function Schedule({ desk, onDesk, people, rxs, today }: Props & { rxs: RehabRx[] }) {
  const me = useMe();
  const deny = useDeny()("rehab.therapy");
  const [day, setDay] = useState(0);
  const [form, setForm] = useState<{ orderId: string; therapist: string; start: string; minutes: number; place: RehabPlace }>({ orderId: rxs[0]?.orderId ?? "", therapist: THERAPISTS[0].name, start: "09:00", minutes: 40, place: "訓練室" });
  const rx = rxs.find((r) => r.orderId === form.orderId);
  const therapist = THERAPISTS.find((t) => t.name === form.therapist)!;
  const entries = people.find((x) => x.patient.id === rx?.patientId)?.entries ?? [];
  const draft = rx ? { orderId: rx.orderId, patientId: rx.patientId, therapist: therapist.name, discipline: therapist.discipline, day, start: form.start, minutes: form.minutes, place: form.place } : null;
  const clashes = draft ? bookingClashes(desk, draft, entries) : [];
  const wrongJob = rx && !rx.order.therapists.includes(therapist.discipline) ? `処方の職種は ${rx.order.therapists.join("・")} です（${therapist.name}は${DISCIPLINE_NAME[therapist.discipline]}）。` : null;
  // Units already booked that day and not recorded yet (recorded ones are counted from the sessions), plus this booking.
  const booked = desk.bookings.filter((x) => x.therapist === therapist.name && x.day === day && !desk.sessions.some((s) => s.bookingId === x.id && (s.recordedAt || s.notDone))).reduce((n, x) => n + Math.floor(x.minutes / 20), 0);
  const load = therapistLoad(desk, therapist.name, day, today, booked + Math.floor(form.minutes / 20));
  const book = () => {
    if (!draft || wrongJob) return;
    const b: RehabBooking = { ...draft, id: `rb-${desk.bookings.length + 1}-${draft.orderId}-${draft.therapist}-${draft.day}-${draft.start}`, by: me.name };
    onDesk((d) => ({ ...d, bookings: [...d.bookings, b] }));
    auditLog({ role: me.role, actor: me.name, action: "確定（リハビリの予約）", patient: rx!.name, detail: `${therapist.name} ${day === 0 ? "今日" : "明日"} ${form.start} ${form.minutes}分 ${form.place}` });
  };
  const of = (t: string) => desk.bookings.filter((b) => b.day === day && b.therapist === t);
  const name = (pid: string) => rxs.find((r) => r.patientId === pid)?.name ?? pid;
  return (
    <section className="space-y-3 text-[12px]">
      <DenyNote action="rehab.therapy" />
      <div className="flex items-center gap-2">
        {[0, 1].map((d) => (
          <button key={d} type="button" onClick={() => setDay(d)} aria-pressed={day === d} className={`rounded border px-2 py-0.5 ${day === d ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule"}`}>
            {d === 0 ? "今日" : "明日"} {formatShort(addDays(today, d))}
            {isRehabHoliday(addDays(today, d)) ? "（休日）" : ""}
          </button>
        ))}
        <span className="text-ink-faint">{REHAB_RULES.hours}</span>
      </div>
      <div className="scroll-thin overflow-x-auto">
        <table className={`${card} min-w-[640px] border-collapse`}>
          <thead>
            <tr className="border-b border-rule text-left text-ink-soft">
              <th className="w-14 px-2 py-1 font-normal">時刻</th>
              {THERAPISTS.map((t) => (
                <th key={t.name} className="px-2 py-1 font-normal">
                  {t.name}（{t.discipline}）
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOT_TIMES.map((slot) => (
              <tr key={slot} className="border-b border-rule-soft">
                <td className="nums px-2 py-0.5 text-ink-soft">{slot}</td>
                {THERAPISTS.map((t) => {
                  const b = of(t.name).find((x) => x.start === slot);
                  const inside = of(t.name).some((x) => x.start < slot && plus(x.start, x.minutes) > slot);
                  return (
                    <td key={t.name} className={`px-2 py-0.5 ${b ? "bg-ai-soft font-bold text-ai" : inside ? "bg-ai-soft/50" : ""}`}>
                      {b ? `${name(b.patientId)} ${b.minutes}分（${b.place === "訓練室" ? "訓練室" : "病棟"}）` : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={`${card} space-y-1 p-3`}>
        <h3 className="font-bold">予約を入れる</h3>
        {rxs.length === 0 ? (
          <p className="text-ink-faint">リハビリ処方の患者はいません。</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select value={form.orderId} onChange={(e) => setForm({ ...form, orderId: e.target.value })} aria-label="患者" disabled={!!deny} className={field}>
              {rxs.map((r) => (
                <option key={r.orderId} value={r.orderId}>
                  {r.room} {r.name}（{r.order.field}・{r.order.therapists.join("・")}）
                </option>
              ))}
            </select>
            <select value={form.therapist} onChange={(e) => setForm({ ...form, therapist: e.target.value })} aria-label="療法士" disabled={!!deny} className={field}>
              {THERAPISTS.map((t) => (
                <option key={t.name}>{t.name}</option>
              ))}
            </select>
            <select value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} aria-label="開始" disabled={!!deny} className={`${field} nums`}>
              {SLOT_TIMES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select value={form.minutes} onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) })} aria-label="時間" disabled={!!deny} className={field}>
              {[20, 40, 60].map((m) => (
                <option key={m} value={m}>
                  {m}分（{m / 20}単位）
                </option>
              ))}
            </select>
            <select value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value as RehabPlace })} aria-label="場所" disabled={!!deny} className={field}>
              {(["訓練室", "病棟（ベッドサイド）"] as RehabPlace[]).map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <button type="button" disabled={!!deny || !draft || !!wrongJob} onClick={book} className="rounded bg-ai px-2.5 py-0.5 font-bold text-white disabled:opacity-40">
              予約する
            </button>
          </div>
        )}
        {[wrongJob, ...clashes, ...load.notes].filter(Boolean).map((x) => (
          <p key={x} className="text-shu">
            {x}
          </p>
        ))}
        <p className="text-ink-soft">
          {therapist.name}のこの日：{load.day}単位（記録した実施・ほかの予約・この予約）、週 {load.week}単位
        </p>
        <p className="hint text-[11px] text-ink-faint">{REHAB_RULES.booking} 従事者1人の実施単位数は1日18単位を標準、週108単位まで、1日24単位が上限です（留意事項通知 第7部 通則5の2）。</p>
      </div>
    </section>
  );
}

function Work({ desk, onDesk, onNote, people, rxs, bookings, nowTime, today, receipt, onReceipt }: Props & { rxs: RehabRx[]; bookings: RehabBooking[]; receipt: { bookingId: string; text: string } | null; onReceipt: (r: { bookingId: string; text: string } | null) => void }) {
  return (
    <section className="space-y-2" onClickCapture={() => onReceipt(null)} onChangeCapture={() => onReceipt(null)}>
      <DenyNote action="rehab.therapy" />
      {bookings.length === 0 && <p className={`${card} px-4 py-3 text-ink-soft`}>今日の予約で、まだ記録していないものはありません。</p>}
      {[...bookings]
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((b) => {
          const rx = rxs.find((r) => r.orderId === b.orderId);
          if (receipt?.bookingId === b.id) return <p key={b.id} role="status" className={`${card} px-3 py-2 text-ink-soft`}>{receipt.text}</p>;
          if (!rx) return null;
          return <SessionForm
            key={b.id} b={b} rx={rx} desk={desk} onDesk={onDesk} nowTime={nowTime} today={today}
            vitals={people.find((x) => x.patient.id === b.patientId)?.patient.vitals ?? []}
            onRecorded={(session) => {
              onNote?.(session.patientId, sessionNote(session, rx, session.notDone?.by ?? session.recordedAt!.by));
              const detail = session.notDone
                ? `実施せず ${session.start ?? session.notDone.time}`
                : `${session.start}〜${session.end} ${unitsOf(session.start, session.end).units}単位`;
              onReceipt({ bookingId: b.id, text: `記録しました（${rx.name} ${detail}）→ カルテの経過と一覧・単位に出ます` });
            }}
          />;
        })}
      <p className="hint text-[11px] text-ink-faint">
        {UNIT_RULE} 実施した時刻（開始と終了）と訓練の内容の要点を記録します（同 通則3）。患者1人1日6単位まで（別に厚生労働大臣が定める患者は9単位。告示 第7部 通則4・通知 通則7）。
      </p>
    </section>
  );
}

function SessionForm({ b, rx, desk, onDesk, nowTime, today, vitals, onRecorded }: { vitals: VitalSign[]; onRecorded: (s: RehabSession) => void; b: RehabBooking; rx: RehabRx; desk: RehabDesk; onDesk: Props["onDesk"]; nowTime: string; today: CalendarDate }) {
  const me = useMe();
  const deny = useDeny()("rehab.therapy");
  const cur = desk.sessions.find((s) => s.bookingId === b.id);
  const [start, setStart] = useState(cur?.start ?? b.start);
  const [end, setEnd] = useState(cur?.end ?? plus(b.start, b.minutes));
  const [content, setContent] = useState(cur?.content ?? "");
  const [place, setPlace] = useState<RehabPlace>(cur?.place ?? b.place);
  const [reason, setReason] = useState("");
  const u = unitsOf(start, end);
  const already = patientDayUnits(desk, rx.patientId).find((d) => d.day === 0)?.units ?? 0;
  const limit = desk.nine[rx.patientId] ? 9 : 6;
  const load = therapistLoad(desk, b.therapist, 0, today, u.units);
  const early = earlyAddition(rx.admittedOn, 0);
  const holiday = isRehabHoliday(today) && 0 <= holidayUntil(rx.order, treatmentStart(desk, rx.orderId, 0));
  const cat = categoryOf(rx.order.field);
  const base: RehabSession = cur ?? { id: `rs-${b.id}`, bookingId: b.id, orderId: b.orderId, patientId: b.patientId, therapist: b.therapist, discipline: b.discipline, day: 0, place: b.place };
  const put = (s: RehabSession) => {
    onDesk((d) => ({ ...d, sessions: [...d.sessions.filter((x) => x.id !== s.id), s] }));
    if (s.recordedAt || s.notDone) onRecorded(s);
  };
  const problems = sessionProblems({ arrived: !!cur?.arrived, start, end, content });
  return (
    <article className={`${card} space-y-1 p-3 text-[12px]`}>
      <ExecutionHistory records={cur?.cancellations} />
      {cur?.recordedAt && <ExecutionUndo action="rehab.therapy" patient={rx.name} detail="リハビリの実施" onUndo={(by, at, reason) => put(cancelExecution(cur, ["start", "end", "recordedAt", "content"], by, at, reason))} />}
      <header className="flex flex-wrap items-baseline gap-x-3">
        <span className="nums">
          {b.start}〜{plus(b.start, b.minutes)}
        </span>
        <b>
          {rx.room}　{rx.name}
        </b>
        <span>
          {cat.name}（{b.discipline}・{b.therapist}）
        </span>
        <span className="text-ink-soft">
          {b.place}　目標：{rx.order.goal}
          {rx.order.cautions && `　注意：${rx.order.cautions}`}
        </span>
      </header>
      <RehabVitals vitals={vitals} caution={rx.order.cautions ?? ""} />
      <div className="flex flex-wrap items-center gap-2">
        {cur?.arrived ? (
          <span className="text-ink-soft">
            受付 {cur.arrived.time} {cur.arrived.by}
          </span>
        ) : (
          <button
            type="button"
            disabled={!!deny}
            onClick={() => {
              put({ ...base, arrived: { day: 0, time: nowTime, by: me.name } });
              auditLog({ role: me.role, actor: me.name, action: "確定（リハビリの受付）", patient: rx.name, detail: `${b.therapist} ${b.start}` });
            }}
            className="rounded bg-ai px-2.5 py-0.5 font-bold text-white disabled:opacity-40"
          >
            {b.place === "訓練室" ? "受付（来室した）" : "受付（病棟へ向かう）"}
          </button>
        )}
        <label className="flex items-center gap-1">
          開始
          <TimeInput value={start} onChange={(e) => setStart(e.target.value)} disabled={!!deny} className={`${field} nums`} />
        </label>
        <label className="flex items-center gap-1">
          終了
          <TimeInput value={end} onChange={(e) => setEnd(e.target.value)} disabled={!!deny} className={`${field} nums`} />
        </label>
        <select value={place} onChange={(e) => setPlace(e.target.value as RehabPlace)} aria-label="場所" disabled={!!deny} className={field}>
          {(["訓練室", "病棟（ベッドサイド）"] as RehabPlace[]).map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <b className="nums">
          {u.minutes}分 → {u.units}単位
        </b>
        <span className="text-ink-soft">
          今日のこの患者：{already + u.units}／{limit}単位
          {already + u.units > limit && <b className="ml-1 text-shu">（{already + u.units - limit}単位は算定できません）</b>}
        </span>
      </div>
      <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="訓練の内容の要点（例：歩行器で病棟内30m、立ち上がり10回×2）" aria-label="訓練の内容" disabled={!!deny} className={`${field} w-full`} />
      {load.notes.map((x) => (
        <p key={x} className="text-shu">
          {x}
        </p>
      ))}
      <p className="text-ink-soft">
        算定の目安（医事課が確かめる）：{cat.tier ? `${cat.name}${cat.tier.name} ${cat.tier.points}点 × ${u.units}単位` : `${cat.name}はこの病院の届出にありません`}
        {early.points > 0 ? `　早期リハビリテーション加算 入院${early.dayNo}日目 ${early.points}点 × ${u.units}単位` : "　早期リハビリテーション加算の期間は過ぎています"}
        {holiday ? `　休日リハビリテーション加算 25点 × ${u.units}単位` : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!!deny || problems.length > 0}
          onClick={() => {
            put({ ...base, ...(cur ?? {}), start, end, place, content: content.trim(), recordedAt: { day: 0, time: nowTime, by: me.name } });
            auditLog({ role: me.role, actor: me.name, action: "確定（リハビリの実施を記録）", patient: rx.name, detail: `${start}〜${end} ${u.units}単位　${content.trim().slice(0, 40)}` });
          }}
          className="rounded bg-wakatake px-2.5 py-0.5 font-bold text-white disabled:cursor-not-allowed disabled:bg-rule disabled:text-ink-faint"
        >
          実施を記録
        </button>
        {!deny && problems.length > 0 && <span className="text-[11px] font-bold text-yamabuki">記録するには：{problems.join("・")}</span>}
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="できなかった理由（例：発熱で中止）" aria-label="できなかった理由" disabled={!!deny} className={`${field} ml-auto w-56`} />
        <button
          type="button"
          disabled={!!deny || !reason.trim()}
          onClick={() => {
            put({ ...base, start, notDone: { day: 0, time: nowTime, by: me.name, reason: reason.trim() } });
            auditLog({ role: me.role, actor: me.name, action: "確定（リハビリを実施できなかった）", patient: rx.name, detail: reason.trim() });
          }}
          className="rounded border border-shu px-2 py-0.5 text-shu disabled:opacity-40"
        >
          実施できなかった
        </button>
      </div>
    </article>
  );
}

function Bi({ desk, onDesk, rxs, nowTime, fmt }: Props & { rxs: RehabRx[]; fmt: (d: number) => string }) {
  const me = useMe();
  const deny = useDeny()("rehab.therapy");
  const [pid, setPid] = useState(rxs[0]?.patientId ?? "");
  const [scores, setScores] = useState<Record<string, number>>({});
  const evals = biOf(desk.bi, pid);
  const total = biTotal(scores);
  const problems = biProblems(scores);
  const drops = biDrops(evals);
  const rx = rxs.find((r) => r.patientId === pid);
  return (
    <section className="space-y-3 text-[12px]">
      <DenyNote action="rehab.therapy" />
      <div className="flex flex-wrap items-center gap-2">
        {rxs.map((r) => (
          <button key={r.orderId} type="button" onClick={() => (setPid(r.patientId), setScores({}))} aria-pressed={pid === r.patientId} className={`rounded border px-2 py-0.5 ${pid === r.patientId ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule"}`}>
            {r.room} {r.name}
          </button>
        ))}
      </div>
      {rx && (
        <div className={`${card} p-3`}>
          <h3 className="mb-1 font-bold">Barthel Index（{rx.name}）</h3>
          <table className="w-full border-collapse">
            <tbody>
              {BI_ITEMS.map((i) => (
                <tr key={i.key} className="border-b border-rule-soft align-top">
                  <td className="w-40 px-1 py-1 font-bold">{i.label}</td>
                  <td className="px-1 py-1">
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {i.options.map((o) => (
                        <label key={o.score} className="flex items-start gap-1">
                          <input type="radio" name={`bi-${i.key}`} checked={scores[i.key] === o.score} onChange={() => setScores({ ...scores, [i.key]: o.score })} disabled={!!deny} className="mt-0.5 accent-ai" />
                          <span>
                            <b className="nums">{o.score}</b> {o.text}
                          </span>
                        </label>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <b className="nums text-sm">合計 {total ?? "—"} / 100点</b>
            {problems.length > 0 && <span className="text-ink-faint">あと {problems.length}項目</span>}
            <button
              type="button"
              disabled={!!deny || total === null}
              onClick={() => {
                const e: BiEval = { id: `bi-${pid}-${desk.bi.length + 1}-${nowTime}`, patientId: pid, day: 0, time: nowTime, by: me.name, scores };
                onDesk((d) => ({ ...d, bi: [...d.bi, e] }));
                auditLog({ role: me.role, actor: me.name, action: "確定（ADL の評価：Barthel Index）", patient: rx.name, detail: `${total}点` });
                setScores({});
              }}
              className="rounded bg-ai px-2.5 py-0.5 font-bold text-white disabled:opacity-40"
            >
              評価を記録
            </button>
          </p>
          <p className="mt-1 text-[11px] text-ink-faint">{FIM_NOTE}</p>
        </div>
      )}
      <div className={`${card} p-3`}>
        <h3 className="mb-1 font-bold">これまでの評価</h3>
        {evals.length === 0 && <p className="text-ink-faint">まだありません。</p>}
        <ul className="space-y-0.5">
          {evals.map((e) => (
            <li key={e.id} className="nums">
              {fmt(e.day)} {e.time}　<b>{biTotal(e.scores) ?? "—"}点</b>　{e.by}　<span className="text-ink-soft">{BI_ITEMS.map((i) => `${i.label} ${e.scores[i.key] ?? "—"}`).join("・")}</span>
            </li>
          ))}
        </ul>
        {drops.map((x) => (
          <p key={x.to.id} className="mt-1 font-bold text-yamabuki">
            {fmt(x.from.day)} から {fmt(x.to.day)} に {x.drop}点下がっています。{BI_DROP_NOTE}
          </p>
        ))}
      </div>
      <Sources items={BI_SOURCES} />
    </section>
  );
}

function Plans({ desk, onDesk, rxs, nowTime, fmt }: Props & { rxs: RehabRx[]; fmt: (d: number) => string }) {
  const [pick, setPick] = useState(rxs[0]?.orderId ?? "");
  const rx = rxs.find((r) => r.orderId === pick) ?? rxs[0];
  return (
    <section className="space-y-3 text-[12px]">
      <DenyNote action="rehab.plan" />
      <div className="flex flex-wrap items-center gap-2">
        {rxs.map((r) => (
          <button key={r.orderId} type="button" onClick={() => setPick(r.orderId)} aria-pressed={rx?.orderId === r.orderId} className={`rounded border px-2 py-0.5 ${rx?.orderId === r.orderId ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule"}`}>
            {r.room} {r.name}（{r.order.field}）
          </button>
        ))}
      </div>
      {rx && <RehabPlanForm key={`${rx.orderId}-${desk.plans.length}`} rx={rx} desk={desk} onDesk={onDesk} nowTime={nowTime} fmtDay={fmt} />}
    </section>
  );
}

function List({ desk, rxs, fmt, today }: Props & { rxs: RehabRx[]; fmt: (d: number) => string }) {
  const days = [-6, -5, -4, -3, -2, -1, 0];
  return (
    <section className="space-y-3 text-[12px]">
      <table className={`${card} w-full border-collapse`}>
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className="px-2 py-1 font-normal">患者</th>
            <th className="px-2 py-1 font-normal">区分（この病院の点数）</th>
            <th className="px-2 py-1 font-normal">標準的算定日数</th>
            <th className="px-2 py-1 font-normal">早期リハビリテーション加算</th>
            {days.map((d) => (
              <th key={d} className="px-1 py-1 text-right font-normal">
                {d === 0 ? "今日" : fmt(d).replace(/（.*）/, "")}
              </th>
            ))}
            <th className="px-2 py-1 font-normal">実施計画書</th>
            <th className="px-2 py-1 font-normal">BI</th>
          </tr>
        </thead>
        <tbody>
          {rxs.length === 0 && (
            <tr>
              <td colSpan={12} className="px-2 py-3 text-center text-ink-faint">
                リハビリ処方の患者はいません。
              </td>
            </tr>
          )}
          {rxs.map((rx) => {
            const pr = progressOf(desk, rx, 0);
            const cat = categoryOf(rx.order.field);
            return (
              <tr key={rx.orderId} className="border-b border-rule-soft align-top">
                <td className="px-2 py-1">
                  {rx.room} {rx.name}
                </td>
                <td className="px-2 py-1">
                  {cat.kubun} {cat.name}
                  <span className="block text-ink-soft">{cat.tier ? `${cat.tier.name} 1単位 ${cat.tier.points}点` : "届出なし"}</span>
                </td>
                <td className={`px-2 py-1 ${pr.standard.over ? "font-bold text-shu" : ""}`}>
                  {pr.standard.dayNo}日目（{fmt(pr.standard.from)}から。あと{Math.max(0, pr.standard.left)}日）
                  <span className="block text-ink-faint">{pr.standard.fromText}</span>
                </td>
                <td className="px-2 py-1">{pr.early.points ? `入院${pr.early.dayNo}日目：1単位 ${pr.early.points}点（${fmt(pr.early.until)} まで）` : `期間外（入院${pr.early.dayNo}日目）`}</td>
                {days.map((d) => {
                  const u = pr.units.find((x) => x.day === d);
                  return (
                    <td key={d} className={`nums px-1 py-1 text-right ${u?.over ? "font-bold text-shu" : ""}`}>
                      {u ? u.units : ""}
                    </td>
                  );
                })}
                <td className={`px-2 py-1 ${pr.plan.state.includes("過ぎた") || pr.plan.state.includes("まだ") ? "font-bold text-yamabuki" : "text-ink-soft"}`}>{pr.plan.state}</td>
                <td className="nums px-2 py-1">{pr.bi.map((b) => b.total ?? "—").join(" → ") || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className={`${card} p-3`}>
        <h3 className="mb-1 font-bold">療法士ごとの今日の単位</h3>
        <ul>
          {THERAPISTS.map((t) => {
            const l = therapistLoad(desk, t.name, 0, today);
            return (
              <li key={t.name} className="nums">
                {t.name}（{t.discipline as Discipline}）：今日 {l.day}単位・今週 {l.week}単位 {l.notes.join(" ")}
              </li>
            );
          })}
        </ul>
      </div>
      <p className="text-[11px] text-ink-faint">{EARLY_NOTE}</p>
    </section>
  );
}
