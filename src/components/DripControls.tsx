"use client";
import { displayText } from "@/lib/display-text";
import { TimeInput } from "@/components/TimeInput";

import { useState } from "react";
import { clockText, dripCourses, dripEndOf, endText, pastEnd, pastTime, startRecordOf } from "@/lib/drip-course";
import { abs } from "@/lib/flowsheet";
import { durationText } from "@/lib/format";
import { DRIP_STOP_REASONS, VOID_REASONS, type AdminRecord, type DripEnd, type DripStopReason, type VoidReason } from "@/lib/mar";
import type { WorkPatient } from "@/lib/worksheet";
import { useMe } from "./RoleContext";

/** "終了予定 23:56（500mL ÷ 42mL/時）", and how far past it a running drip is. */
export function ExpectedEnd({ course, nowAbs }: { course: { expectedEnd: number | null; end?: unknown; volumeMl: number; mlPerH: number | null }; nowAbs: number }) {
  if (course.expectedEnd === null) return <span className="text-ink-faint">終了予定は速さの指示がないので出せません</span>;
  const past = pastEnd(course, nowAbs);
  return (
    <span className="nums">
      <span className="text-ink-soft" title="開始の時刻 ＋ 1本の量 ÷ 速さ（コードで計算）">
        終了予定 {displayText(clockText(course.expectedEnd))}
        {course.mlPerH ? `（${course.volumeMl}mL ÷ ${course.mlPerH}mL/時）` : ""}
      </span>
      {past > 0 && <span className="ml-1 rounded bg-shu-soft px-1 font-bold text-shu">終了予定を {displayText(durationText(past))} 過ぎています</span>}
    </span>
  );
}

/** 終了を記録: the time (now unless typed), 全量 or 残量, and why when some is left. What went in is counted by code. */
export function DripEndForm({ volumeMl, start, nowAbs, nowTime, onEnd, label = "終了を記録" }: { volumeMl: number; start: number; nowAbs: number; nowTime: string; onEnd: (end: DripEnd) => void; label?: string }) {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState("");
  const [full, setFull] = useState(true);
  const [left, setLeft] = useState("");
  const [reason, setReason] = useState<DripStopReason | "">("");
  const at = time.trim() ? pastTime(time, nowAbs) : nowAbs;
  const leftMl = left.trim() === "" ? undefined : Number(left);
  const result = at === null ? null : dripEndOf(volumeMl, { full, leftMl, reason, at, start, nowAbs });
  const typed = full || left.trim() !== "";
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded border border-ai px-1.5 text-[11px] font-bold text-ai hover:bg-ai hover:text-white">
        {label}
      </button>
    );
  return (
    <div className="w-64 space-y-1 rounded border border-rule bg-paper p-1.5 text-[11px]">
      <label className="flex items-center gap-1">
        <span className="w-10">時刻</span>
        <TimeInput value={time} onChange={(e) => setTime(e.target.value)} placeholder={nowTime} aria-label="終了の時刻" className="w-16 rounded border border-rule bg-sheet px-1" />
        <span className="text-ink-faint">空ならいま</span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          <input type="radio" checked={full} onChange={() => setFull(true)} className="accent-ai" />
          全量 {volumeMl}mL
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={!full} onChange={() => setFull(false)} className="accent-ai" />
          残量
          <input value={left} onChange={(e) => (setLeft(e.target.value), setFull(false))} inputMode="numeric" aria-label="残量（mL）" className="w-12 rounded border border-rule bg-sheet px-1 text-right" />
          mL
        </label>
      </div>
      {!full && (
        <select value={reason} onChange={(e) => setReason(e.target.value as DripStopReason)} aria-label="終わった理由" className="rounded border border-rule bg-sheet px-0.5">
          <option value="">終わった理由（残量があるとき）</option>
          {DRIP_STOP_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      )}
      {at === null && <p className="text-shu">時刻は 14:30 の形で入れてください。</p>}
      {result?.ok && <p className="nums text-ink">入った量 {result.givenMl}mL（{result.formula}）</p>}
      {result && !result.ok && typed && result.problems.map((p) => <p key={p} className="text-shu">{p}</p>)}
      <div className="flex items-center gap-1 pt-0.5">
        <button
          type="button"
          disabled={!result?.ok || at === null}
          onClick={() => {
            if (!result?.ok || at === null) return;
            onEnd({ at, recordedAt: nowTime, by: me.name, full: result.full, leftMl: result.leftMl, givenMl: result.givenMl, ...(result.leftMl > 0 && reason ? { reason } : {}) });
            setOpen(false);
            setTime("");
            setLeft("");
            setFull(true);
            setReason("");
          }}
          className="rounded bg-wakatake px-2 py-0.5 font-bold text-white disabled:opacity-40"
        >
          終了を記録（{me.name}）
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-ink-faint">
          やめる
        </button>
      </div>

    </div>
  );
}

/** A drip's record on the worksheet: 開始, then 終了予定 and the 終了 form, or the 終了 with what went in. */
export function DripRecordCell({ record, nowAbs, nowTime, onRecord }: { record: AdminRecord; nowAbs: number; nowTime: string; onRecord: (r: AdminRecord) => void }) {
  const me = useMe();
  const d = record.drip!;
  const start = d.startAt;
  const course = { expectedEnd: d.minutes === null ? null : start + d.minutes, end: record.end ? { at: record.end.at } : undefined, volumeMl: d.volumeMl, mlPerH: d.mlPerH };
  const [voiding, setVoiding] = useState(false);
  const [why, setWhy] = useState<VoidReason | "">("");
  return (
    <span className="block space-y-0.5 text-[11px]">
      <span className="block text-wakatake" title={`リストバンド ${record.checked.patient ? "一致" : "—"}${record.checked.label === null ? "" : `／ラベル ${record.checked.label ? "一致" : "—"}`}`}>
        開始 {displayText(clockText(start))} <span className="text-ink-soft">{displayText(record.by)}</span>
      </span>
      {record.end ? (
        <>
          <span className="nums block text-ink">
            {displayText(endText(record))} <span className="text-ink-soft">{displayText(record.end.by)}</span>
          </span>
          {voiding ? (
            <span className="flex flex-wrap items-center gap-1 text-[10px]">
              <select value={why} onChange={(e) => setWhy(e.target.value as VoidReason)} aria-label="終了の記録を取り消す理由" className="rounded border border-rule bg-paper px-0.5">
                <option value="">理由を選ぶ</option>
                {VOID_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!why}
                onClick={() => {
                  onRecord({ ...record, end: undefined, endVoided: [...(record.endVoided ?? []), { end: record.end!, by: me.name, at: nowTime, reason: why as VoidReason }] });
                  setVoiding(false);
                  setWhy("");
                }}
                className="rounded border border-shu px-1 text-shu disabled:opacity-40"
              >
                取り消す
              </button>
              <button type="button" onClick={() => setVoiding(false)} className="text-ink-faint">
                やめる
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setVoiding(true)} className="block text-[10px] text-ink-faint underline hover:text-shu">
              終了の記録を取り消す
            </button>
          )}
        </>
      ) : (
        <>
          <span className="block">
            <ExpectedEnd course={course} nowAbs={nowAbs} />
          </span>
          <DripEndForm volumeMl={d.volumeMl} start={start} nowAbs={nowAbs} nowTime={nowTime} onEnd={(end) => onRecord({ ...record, end })} />
        </>
      )}
      {(record.endVoided ?? []).map((v, i) => (
        <span key={i} className="block text-[10px] text-ink-faint line-through decoration-ink-faint/60" title={displayText(`取り消し：${v.at} ${v.by}（${v.reason}）`)}>
          終了 {displayText(clockText(v.end.at))}（取り消し {v.at}・{displayText(v.reason)}）
        </span>
      ))}
    </span>
  );
}

/**
 * 続いている点滴: every drip of these patients that has started and has no 終了 yet — begun in this
 * shift or before (a bag started by the earlier shift, fictional, is here too) — with its expected end.
 */
export function RunningDrips({ people, records, sessionStart, nowTime, onRecord, interactive }: { people: WorkPatient[]; records: Record<string, AdminRecord>; sessionStart: number; nowTime: string; onRecord: (r: AdminRecord) => void; interactive: boolean }) {
  const nowAbs = abs(0, nowTime);
  const rows = people.flatMap((w) => dripCourses(w.patient.id, w.entries, records, sessionStart, nowAbs, nowAbs - 2880).filter((c) => !c.end).map((c) => ({ w, c })));
  rows.sort((a, b) => (a.c.expectedEnd ?? Infinity) - (b.c.expectedEnd ?? Infinity));
  const td = "border-b border-rule px-1.5 py-1 align-top";
  return (
    <div className="mt-2">
      <h4 className="mb-0.5 text-[12px] font-bold text-ink-soft">
        続いている点滴（開始を記録して、終了がまだ）{rows.some((x) => pastEnd(x.c, nowAbs) > 0) && <span className="ml-1 rounded bg-shu px-1 text-[10px] text-white">終了予定を過ぎたもの {rows.filter((x) => pastEnd(x.c, nowAbs) > 0).length}件</span>}
      </h4>
      {rows.length === 0 ? (
        <p className="px-1.5 py-1 text-ink-faint">ありません</p>
      ) : (
        <table className="w-full border-collapse">
          <tbody>
            {rows.map(({ w, c }) => (
              <tr key={c.key} className={pastEnd(c, nowAbs) > 0 ? "bg-shu-soft/40" : ""}>
                <td className={`${td} w-28`}>
                  {w.room}　{w.patient.name}
                </td>
                <td className={td}>
                  <b>{c.label}</b>
                  {c.bag ? `（${c.bag}本目）` : ""}
                  <div className="nums text-[11px] text-ink-soft">
                    開始 {displayText(clockText(c.start))}（{c.startBy}）　<ExpectedEnd course={c} nowAbs={nowAbs} />
                  </div>
                </td>
                <td className={`${td} w-64`}>{interactive ? <DripEndForm volumeMl={c.volumeMl} start={c.start} nowAbs={nowAbs} nowTime={nowTime} onEnd={(end) => onRecord({ ...startRecordOf(c), end })} /> : <span className="text-ink-faint">終了 □□□　残量 　　mL</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* Help migration source (references and dynamic wording):
<p >入った量は 1本の量 − 残量 で、水分出納の IN（点滴）に終了の時刻で入ります。</p>
*/
