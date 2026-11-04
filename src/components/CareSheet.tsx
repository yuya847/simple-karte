"use client";

import { ClipboardCheck } from "lucide-react";
import { useState } from "react";
import { minutesOf, type CalendarDate } from "@/lib/dates";
import { VOID_REASONS } from "@/lib/mar";
import { CARE_EARLY_MIN, CARE_NOT_DONE, careKey, careLate, careLive, careOpen, careSlots, careState, hhmm, recordOf, recordProblems, scheduleLabel, type CareNotDone, type CareOrder, type CareRecord, type CareState } from "@/lib/care-orders";
import { evalStatus, problemTitle, type NursingProblem } from "@/lib/nursing-plan";
import { timeLabel, type WorkPatient } from "@/lib/worksheet";
import { DenyNote, useDeny, useMe } from "./RoleContext";

interface Props {
  people: WorkPatient[];
  orders: CareOrder[];
  records: CareRecord[];
  plans: NursingProblem[];
  /** The shift window (absolute minutes) and the day shown. */
  lo: number;
  hi: number;
  day: number;
  today: CalendarDate;
  nowTime: string;
  sessionStart: number;
  interactive: boolean;
  onRecord: (r: CareRecord) => void;
  onVoid: (r: CareRecord, reason: string) => void;
}

const STATE_STYLE: Record<CareState, string> = {
  実施: "text-wakatake",
  未実施: "text-shu",
  記録済み: "text-ink-faint",
  未入力: "font-bold text-yamabuki",
  予定: "text-ink-soft",
};

/**
 * 看護ケア・観察 on the worksheet: one row per patient and order, with each time of the shift and its 実施.
 * Below, the nursing problems whose evaluation is due by the day shown. Printed with the worksheet.
 */
export function CareSheet({ people, orders, records, plans, lo, hi, day, today, nowTime, sessionStart, interactive, onRecord, onVoid }: Props) {
  const nowAbs = minutesOf(nowTime);
  const rows = [...people]
    .sort((a, b) => a.room.localeCompare(b.room))
    .flatMap((x) => orders.filter((o) => o.patientId === x.patient.id && careLive(o, lo, hi)).map((o) => ({ x, o, slots: careSlots(o, lo, hi) })))
    .filter((r) => r.o.schedule.kind === "prn" || r.slots.length);
  const waiting = rows.reduce((n, r) => n + r.slots.filter((t) => careState({ orderId: r.o.id, at: t }, records, sessionStart, nowAbs) === "未入力").length, 0);
  const ids = people.map((x) => x.patient.id);
  const due = plans.filter((p) => ids.includes(p.patientId) && evalStatus(p, day)?.due).sort((a, b) => a.evalDue - b.evalDue);
  const who = (pid: string) => people.find((x) => x.patient.id === pid);
  const td = "border-b border-rule px-1.5 py-1 align-top";
  return (
    <section className="mb-4 break-inside-avoid-page">
      <h3 className="mb-1 border-l-4 border-ai pl-2 text-[13px] font-bold print:text-[11px]">
        看護ケア・観察（看護師の指示）{waiting > 0 && <span className="ml-2 text-yamabuki">記録がまだ {waiting}件</span>}
      </h3>
      {rows.length === 0 ? (
        <p className="px-1.5 py-1 text-ink-faint">ありません</p>
      ) : (
        <table className="w-full border-collapse">
          <tbody>
            {rows.map(({ x, o, slots }) => (
              <tr key={o.id}>
                <td className={`${td} w-28`}>
                  {x.room}　{x.patient.name}
                </td>
                <td className={`${td} w-14`}>
                  <span className={`rounded px-1 py-px text-[11px] font-bold print:border print:border-ink/40 print:bg-transparent ${o.kind === "ケア" ? "bg-wakatake-soft text-wakatake" : "bg-ai-soft text-ai"}`}>{o.kind}</span>
                </td>
                <td className={`${td} w-56`}>
                  <b>{o.item}</b>　<span className="text-ink-soft">{scheduleLabel(o)}</span>
                  {o.choices && <span className="block text-[11px] text-ink-faint">{o.choices.join("・")}</span>}
                  {o.note && <span className="block text-[11px] text-ink-soft">{o.note}</span>}
                </td>
                <td className={td}>
                  <div className="flex flex-wrap gap-1">
                    {o.schedule.kind === "prn" ? (
                      <PrnCell order={o} records={records} lo={lo} hi={hi} nowTime={nowTime} interactive={interactive} onRecord={onRecord} onVoid={onVoid} />
                    ) : (
                      slots.map((t) => {
                        const r = recordOf(records, careKey(o.id, t));
                        const st = careState({ orderId: o.id, at: t }, records, sessionStart, nowAbs);
                        const label = timeLabel(t, day, today);
                        return interactive ? (
                          <SlotCell key={t} order={o} at={t} label={label} record={r} state={st} late={careLate({ orderId: o.id, at: t }, records, sessionStart, nowAbs)} nowTime={nowTime} onRecord={onRecord} onVoid={onVoid} />
                        ) : (
                          <span key={t} className="nums whitespace-nowrap rounded border border-ink/30 px-1">
                            {label} {r ? `${r.status === "実施" ? "済" : "不可"} ${r.doneAt}${r.value ? ` ${r.value}${o.unit ?? ""}` : ""}` : st === "記録済み" ? "済（前）" : "□"}
                          </span>
                        );
                      })
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {due.length > 0 && (
        <div className="mt-1.5 rounded border border-yamabuki/50 px-2 py-1 print:border-ink/40">
          <div className="flex items-center gap-1 text-[12px] font-bold">
            <ClipboardCheck size={13} className="print:hidden" />
            看護計画の評価予定日（この日まで）
          </div>
          <ul className="text-[12px]">
            {due.map((p) => {
              const st = evalStatus(p, day)!;
              return (
                <li key={p.id}>
                  {who(p.patientId)?.room}　{who(p.patientId)?.patient.name}　{problemTitle(p)}　<span className={st.late ? "font-bold text-shu" : "text-yamabuki"}>{st.text.replace("今日", day === 0 ? "今日" : "この日")}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

/** One time of a care order: its state, and recording 実施・未実施 (or taking the record back). */
function SlotCell({ order, at, label, record, state, late, nowTime, onRecord, onVoid }: { order: CareOrder; at: number; label: string; record?: CareRecord; state: CareState; late: boolean; nowTime: string; onRecord: (r: CareRecord) => void; onVoid: (r: CareRecord, reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const nowAbs = minutesOf(nowTime);
  const early = !careOpen(at, nowAbs);
  const text = record ? `${record.status} ${record.doneAt}${record.value ? ` ${record.value}${order.unit ?? ""}` : ""}` : state === "記録済み" ? "実施（前の勤務）" : state === "未入力" && late ? "遅れ" : state;
  const tone = record ? STATE_STYLE[record.status] : late ? "font-bold text-shu" : STATE_STYLE[state];
  return (
    <span className="relative">
      <button
        type="button"
        disabled={state === "記録済み" || (!record && early)}
        onClick={() => setOpen((o) => !o)}
        title={early && !record ? `予定の時刻の${CARE_EARLY_MIN}分前から記録できます（架空の病院の取り決め）` : record ? `${record.by}　記録 ${record.writtenAt}${record.note ? `　${record.note}` : ""}${record.reason ? `　${record.reason}` : ""}` : "実施を記録する"}
        className={`nums whitespace-nowrap rounded border px-1 text-[11px] ${late && !record ? "border-shu" : "border-rule"} enabled:hover:border-ai disabled:cursor-default`}
      >
        <b className="text-ink">{label}</b> <span className={tone}>{text}</span>
      </button>
      {open && (
        <span className="absolute left-0 top-full z-20 mt-0.5 block w-64 rounded border border-rule bg-paper p-1.5 text-[11px] shadow-md">
          {record ? <RecordView record={record} unit={order.unit} onVoid={(reason) => (onVoid(record, reason), setOpen(false))} /> : <RecordForm order={order} at={at} label={label} nowTime={nowTime} onSave={(r) => (onRecord(r), setOpen(false))} onClose={() => setOpen(false)} />}
        </span>
      )}
    </span>
  );
}

/** 必要時: record each time it is done (at the time it was done), and the records of this shift. */
function PrnCell({ order, records, lo, hi, nowTime, interactive, onRecord, onVoid }: { order: CareOrder; records: CareRecord[]; lo: number; hi: number; nowTime: string; interactive: boolean; onRecord: (r: CareRecord) => void; onVoid: (r: CareRecord, reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const done = records.filter((r) => r.orderId === order.id && !r.voided && r.at >= lo && r.at < hi).sort((a, b) => a.at - b.at);
  if (!interactive) return <span>必要時　{done.length ? done.map((r) => `${r.doneAt} ${r.status === "実施" ? "済" : "不可"}`).join("、") : "実施 □□□"}</span>;
  return (
    <span className="relative flex flex-wrap items-center gap-1">
      {done.map((r) => (
        <PrnDone key={r.key + r.writtenAt} record={r} unit={order.unit} onVoid={onVoid} />
      ))}
      <button type="button" onClick={() => setOpen((o) => !o)} className="rounded border border-ai px-1.5 text-[11px] font-bold text-ai hover:bg-ai hover:text-white">
        記録する
      </button>
      {open && (
        <span className="absolute left-0 top-full z-20 mt-0.5 block w-64 rounded border border-rule bg-paper p-1.5 text-[11px] shadow-md">
          <RecordForm order={order} at={null} label="必要時" nowTime={nowTime} onSave={(r) => (onRecord(r), setOpen(false))} onClose={() => setOpen(false)} />
        </span>
      )}
    </span>
  );
}

function PrnDone({ record, unit, onVoid }: { record: CareRecord; unit?: string; onVoid: (r: CareRecord, reason: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={`nums whitespace-nowrap rounded border border-rule px-1 text-[11px] ${STATE_STYLE[record.status]}`}>
        {record.status} {record.doneAt}
      </button>
      {open && (
        <span className="absolute left-0 top-full z-20 mt-0.5 block w-64 rounded border border-rule bg-paper p-1.5 text-[11px] shadow-md">
          <RecordView record={record} unit={unit} onVoid={(reason) => (onVoid(record, reason), setOpen(false))} />
        </span>
      )}
    </span>
  );
}

function RecordForm({ order, at, label, nowTime, onSave, onClose }: { order: CareOrder; at: number | null; label: string; nowTime: string; onSave: (r: CareRecord) => void; onClose: () => void }) {
  const me = useMe();
  const deny = useDeny()("mar");
  const [value, setValue] = useState("");
  const [doneAt, setDoneAt] = useState(nowTime);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState<CareNotDone | "">("");
  const make = (status: CareRecord["status"]): CareRecord => {
    // 必要時: recorded at the time it was done.
    const t = at ?? minutesOf(doneAt);
    return {
      key: careKey(order.id, t),
      orderId: order.id,
      patientId: order.patientId,
      at: t,
      status,
      ...(status === "実施" && value.trim() ? { value: value.trim() } : {}),
      ...(status === "未実施" && reason ? { reason } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      doneAt,
      writtenAt: nowTime,
      by: me.name,
    };
  };
  const missDone = recordProblems(order, { status: "実施", value, doneAt }, nowTime);
  const missNot = recordProblems(order, { status: "未実施", reason, doneAt }, nowTime);
  return (
    <span className="block space-y-1">
      <span className="flex items-center justify-between font-bold">
        {order.item}　{label}
        <button type="button" onClick={onClose} className="font-normal text-ink-faint">
          閉じる
        </button>
      </span>
      {order.kind === "観察" &&
        (order.choices?.length ? (
          <span className="flex flex-wrap gap-1">
            {order.choices.map((c) => (
              <button key={c} type="button" aria-pressed={value === c} onClick={() => setValue(value === c ? "" : c)} className={`rounded border px-1.5 py-0.5 pointer-coarse:py-1.5 ${value === c ? "border-ai bg-ai text-white" : "border-rule bg-sheet"}`}>
                {c}
              </button>
            ))}
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="見たこと・測った値" aria-label="観察した内容" className="min-w-0 flex-1 rounded border border-rule bg-sheet px-1" />
            {order.unit}
          </span>
        ))}
      <span className="flex items-center gap-1">
        <span className="w-16">実施した時刻</span>
        <input value={doneAt} onChange={(e) => setDoneAt(e.target.value)} aria-label="実施した時刻" className="nums w-14 rounded border border-rule bg-sheet px-1" />
        <span className="text-ink-faint">記録 {nowTime}</span>
      </span>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="メモ（任意）" aria-label="メモ" className="w-full rounded border border-rule bg-sheet px-1" />
      {missDone.length > 0 && (value || order.kind === "ケア") && <span className="block text-yamabuki">{missDone.join("・")}</span>}
      <span className="flex flex-wrap items-center gap-1 pt-0.5">
        <button type="button" disabled={missDone.length > 0 || !!deny} onClick={() => onSave(make("実施"))} className="rounded bg-wakatake px-2 py-0.5 font-bold text-white disabled:opacity-40">
          実施を記録
        </button>
        {at !== null && (
          <>
            <select value={reason} onChange={(e) => setReason(e.target.value as CareNotDone)} aria-label="未実施の理由" className="rounded border border-rule bg-sheet px-0.5">
              <option value="">未実施の理由</option>
              {CARE_NOT_DONE.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <button type="button" disabled={missNot.length > 0 || !!deny} onClick={() => onSave(make("未実施"))} className="rounded border border-shu px-1.5 text-shu disabled:opacity-40">
              未実施
            </button>
          </>
        )}
      </span>
      <DenyNote action="mar" />
    </span>
  );
}

function RecordView({ record, unit, onVoid }: { record: CareRecord; unit?: string; onVoid: (reason: string) => void }) {
  const deny = useDeny()("mar");
  const [reason, setReason] = useState("");
  return (
    <span className="block space-y-1">
      <span className={`block font-bold ${STATE_STYLE[record.status]}`}>
        {record.status} {record.doneAt}
        {record.value ? `　${record.value}${unit ?? ""}` : ""}
        {record.reason ? `（${record.reason}）` : ""}
      </span>
      <span className="block text-ink-soft">
        {record.by}　記録 {record.writtenAt}
        {hhmm(record.at) !== hhmm(minutesOf(record.doneAt)) ? `　予定 ${hhmm(record.at)}` : ""}
      </span>
      {record.note && <span className="block">{record.note}</span>}
      <span className="flex flex-wrap items-center gap-1">
        <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="取り消す理由" className="rounded border border-rule bg-sheet px-0.5">
          <option value="">取り消す理由</option>
          {VOID_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <button type="button" disabled={!reason || !!deny} onClick={() => onVoid(reason)} className="rounded border border-shu px-1 text-shu disabled:opacity-40">
          記録を取り消す
        </button>
      </span>
    </span>
  );
}
