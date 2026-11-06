"use client";
import { displayText } from "@/lib/display-text";
import { TimeInput } from "@/components/TimeInput";

import { useState } from "react";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { clockText, dripCourses, hm, pastEnd, pastTime } from "@/lib/drip-course";
import { abs } from "@/lib/flowsheet";
import {
  IN_TYPED,
  IO_NOT_INCLUDED,
  IO_RULES,
  IO_VOID_REASONS,
  OUT_KINDS,
  inWindow,
  ioDay,
  ioDayOf,
  ioLines,
  ioProblems,
  ioShifts,
  ioTotal,
  plannedIvMl,
  signed,
  type InKind,
  type IoEntry,
  type IoLine,
  type IoSide,
  type IoWindow,
  type OutKind,
} from "@/lib/io-balance";
import type { AdminRecord } from "@/lib/mar";
import type { OrderEntry } from "@/lib/types";
import { useMe } from "./RoleContext";
import { TabChoice } from "./TabChoice";
import { ExpectedEnd } from "./DripControls";

interface Props {
  patientId: string;
  entries: OrderEntry[];
  /** This patient's typed IN/OUT (taken back ones too, shown struck through). */
  typed: IoEntry[];
  records: Record<string, AdminRecord>;
  sessionStart: number;
  nowTime: string;
  today: CalendarDate;
  /** What the 指示簿 says about 水分出納 (null = not set). */
  standingIo: string | null;
  /** 尿量 typed before this screen, without a time (kept and shown, but not in a shift). */
  legacyUrineMl?: number;
  onAdd: (e: IoEntry[]) => void;
  onVoid: (id: string, reason: string) => void;
  /** The time to start the entry with ("HH:MM", from a cell of the flow sheet); now when not given. */
  defaultTime?: string;
  newId: () => string;
}

const n = (x: number) => x.toLocaleString("ja-JP");

/** The day an IO period starts on: "11/3 9:00〜11/4 9:00". */
export const ioDayText = (d: number, today: CalendarDate) => `${formatShort(addDays(today, d))} ${IO_RULES.dayClose}〜${formatShort(addDays(today, d + 1))} ${IO_RULES.dayClose}`;

/** Totals per shift and per 24 hours, each with its sum written out. */
export function IoTotals({ lines, days, nowAbs, today }: { lines: IoLine[]; days: number[]; nowAbs: number; today: CalendarDate }) {
  const cell = "px-1.5 py-1 text-right align-top";
  return (
    <table className="nums w-full border-collapse text-[12px]">
      <thead>
        <tr className="border-b border-rule text-[11px] text-ink-faint">
          <th className="px-1.5 py-1 text-left font-normal">期間</th>
          <th className={`${cell} font-normal`}>IN mL</th>
          <th className={`${cell} font-normal`}>OUT mL</th>
          <th className={`${cell} font-normal`}>IN − OUT</th>
        </tr>
      </thead>
      <tbody>
        {days.flatMap((d) =>
          [...ioShifts(d), ioDay(d)].map((w) => {
            const notYet = w.lo >= nowAbs;
            const going = !notYet && nowAbs < w.hi;
            const t = ioTotal(lines, { lo: w.lo, hi: Math.min(w.hi, nowAbs) });
            const whole = w.label === "24時間";
            return (
              <tr key={`${d}-${w.label}`} className={`border-b border-rule-soft ${whole ? "bg-paper font-bold" : ""}`}>
                <td className="px-1.5 py-1 align-top">
                  {displayText(whole ? `${ioDayText(d, today)}（24時間）` : `${formatShort(addDays(today, d))} ${w.label} ${hm(w.lo)}〜${w.label === "夜勤" ? "翌" : ""}${hm(w.hi)}`)}
                  {going && <span className="ml-1 rounded bg-yamabuki-soft px-1 text-[10px] font-bold text-yamabuki">途中（いままで）</span>}
                  {!notYet && <div className="text-[10px] font-normal text-ink-faint">{t.formula}</div>}
                </td>
                {notYet ? (
                  <td colSpan={3} className={`${cell} text-ink-faint`}>
                    まだ
                  </td>
                ) : (
                  <>
                    <td className={cell}>{t.inCount ? n(t.in) : "—"}</td>
                    <td className={cell}>{t.outCount ? n(t.out) : "—"}</td>
                    <td className={`${cell} ${t.balance === null ? "text-ink-faint" : ""}`}>{t.balance === null ? "—" : signed(t.balance)}</td>
                  </>
                )}
              </tr>
            );
          }),
        )}
      </tbody>
    </table>
  );
}

const OPTIONS: Record<IoSide, readonly (InKind | OutKind)[]> = { IN: IN_TYPED, OUT: OUT_KINDS };

/** Type one IN or OUT: the kind, mL, the time (now unless typed) and a note. Who is added by code. */
export function IoEntryForm({ patientId, nowTime, onAdd, newId, defaultTime }: { patientId: string; nowTime: string; onAdd: (e: IoEntry[]) => void; newId: () => string; defaultTime?: string }) {
  const me = useMe();
  const nowAbs = abs(0, nowTime);
  const [side, setSide] = useState<IoSide>("OUT");
  const [kind, setKind] = useState<InKind | OutKind>("尿");
  const [ml, setMl] = useState("");
  const [time, setTime] = useState(defaultTime ?? "");
  const [note, setNote] = useState("");
  const at = time.trim() ? pastTime(time, nowAbs) : nowAbs;
  const problems = ioProblems({ ml, at, nowAbs });
  const box = "rounded border border-rule bg-paper px-1.5 py-1 text-[13px] outline-none focus:border-ai";
  return (
    <div className="space-y-2 rounded-md border border-rule-soft bg-paper p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-ink">IN・OUT を入れる</b>
        <TabChoice
          label="IN か OUT か"
          options={[
            { value: "IN", label: "IN（入った量）" },
            { value: "OUT", label: "OUT（出た量）" },
          ]}
          value={side}
          onChange={(s) => {
            setSide(s);
            setKind(OPTIONS[s][0]);
          }}
        />
      </div>
      <div role="radiogroup" aria-label="種類" className="flex flex-wrap gap-1">
        {OPTIONS[side].map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`rounded border px-2 py-0.5 ${kind === k ? "border-ai bg-ai text-white" : "border-rule bg-sheet"}`}>
            {k}
          </button>
        ))}
      </div>
      <div className="nums flex flex-wrap items-end gap-2 text-ink-soft">
        <label className="flex flex-col gap-0.5">
          量 mL
          <input value={ml} onChange={(e) => setMl(e.target.value)} inputMode="numeric" aria-label={`${kind}の量（mL）`} className={`${box} w-20 text-right`} />
        </label>
        <label className="flex flex-col gap-0.5">
          時刻
          <TimeInput value={time} onChange={(e) => setTime(e.target.value)} placeholder={nowTime} aria-label="測った時刻" className={`${box} w-20`} />
        </label>
        <label className="flex flex-1 flex-col gap-0.5">
          メモ（ドレーンの場所・飲んだもの など）
          <input value={note} onChange={(e) => setNote(e.target.value)} className={box} />
        </label>
        <button
          type="button"
          disabled={problems.length > 0 || at === null}
          onClick={() => {
            if (at === null) return;
            onAdd([{ id: newId(), patientId, side, kind, ml: Number(ml), at, by: me.name, recordedAt: nowTime, ...(note.trim() ? { note: note.trim() } : {}) }]);
            setMl("");
            setTime("");
            setNote("");
          }}
          className="rounded-md bg-ai px-3 py-1 font-bold text-white disabled:opacity-40"
        >
          記録する（{me.name}）
        </button>
      </div>
      {ml.trim() !== "" && problems.map((p) => <p key={p} className="text-shu">{p}</p>)}

    </div>
  );
}

/** One patient's 水分出納: the totals, typing IN/OUT, the lines of a period, and the drips still running. */
export function IoPanel({ patientId, entries, typed, records, sessionStart, nowTime, today, standingIo, legacyUrineMl, onAdd, onVoid, newId, defaultTime }: Props) {
  const nowAbs = abs(0, nowTime);
  const d = ioDayOf(nowAbs);
  const [day, setDay] = useState(d);
  const from = ioDay(d - 1).lo;
  const lines = ioLines({ patientId, entries, typed, records, sessionStart, nowAbs, from });
  const w: IoWindow = ioDay(day);
  const running = dripCourses(patientId, entries, records, sessionStart, nowAbs, nowAbs - 2880).filter((c) => !c.end);
  const shown = [...lines.filter((l) => inWindow(l.at, w)), ...typed.filter((e) => e.voided && inWindow(e.at, w)).map((e) => ({ voided: e }))].sort((a, b) => ("voided" in a ? a.voided.at : a.at) - ("voided" in b ? b.voided.at : b.at));
  const planned = plannedIvMl(entries, w, nowAbs);
  return (
    <div className="space-y-3 text-[13px]">
      <p className="text-xs text-ink-soft">
        指示簿：<b className="text-ink">{standingIo ?? "（水分出納の指示なし）"}</b>
      </p>
      <IoTotals lines={lines} days={[d - 1, d]} nowAbs={nowAbs} today={today} />
      <p className="text-[11px] text-ink-faint">
        {IO_RULES.label}。{IO_NOT_INCLUDED}点滴は終了の記録（1本 − 残量）の時刻に入れ、続いている点滴はまだ入れていません。
      </p>
      <IoEntryForm patientId={patientId} nowTime={nowTime} onAdd={onAdd} newId={newId} defaultTime={defaultTime} />
      {legacyUrineMl ? <p className="text-[11px] text-yamabuki">時刻のない尿量 {n(legacyUrineMl)}mL（前の画面の「尿量を足す」で入れた分）は、今日の尿量（経過表の「尿量」）には入っていますが、勤務ごとの合計には入れていません。</p> : null}

      <section>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h3 className="text-xs font-bold">記録の一覧</h3>
          <TabChoice
            label="期間"
            options={[
              { value: d - 1, label: `前の日（${ioDayText(d - 1, today)}）` },
              { value: d, label: `いまの日（${ioDayText(d, today)}）` },
            ]}
            value={day}
            onChange={setDay}
          />
        </div>
        {shown.length === 0 ? (
          <p className="text-xs text-ink-faint">この期間の記録はありません。</p>
        ) : (
          <table className="nums w-full border-collapse text-[12px]">
            <tbody>
              {shown.map((x, i) =>
                "voided" in x ? (
                  <tr key={`v-${x.voided.id}`} className="border-b border-rule-soft text-ink-faint line-through decoration-ink-faint/60">
                    <td className="w-20 py-1">{displayText(clockText(x.voided.at))}</td>
                    <td className="py-1">
                      {x.voided.side} {x.voided.kind} {n(x.voided.ml)}mL
                    </td>
                    <td className="py-1 text-[11px]" colSpan={2}>
                      取り消し {x.voided.voided!.at} {displayText(x.voided.voided!.by)}（{displayText(x.voided.voided!.reason)}）
                    </td>
                  </tr>
                ) : (
                  <LineRow key={`${x.entryId ?? x.orderId}-${x.at}-${i}`} line={x} onVoid={onVoid} />
                ),
              )}
            </tbody>
          </table>
        )}
        <p className="mt-1 text-[11px] text-ink-faint">オーダから計算した点滴の予定量（この24時間）：{n(planned)}mL。記録した量とは別で、合計には入れていません。</p>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-bold">続いている点滴（まだ IN に入っていません）</h3>
        {running.length === 0 ? (
          <p className="text-xs text-ink-faint">ありません。</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {running.map((c) => (
              <li key={c.key} className={pastEnd(c, nowAbs) > 0 ? "text-shu" : ""}>
                <b className="text-ink">{c.label}</b>
                {c.bag ? `（${c.bag}本目）` : ""}　開始 {displayText(clockText(c.start))}（{c.startBy}）　<ExpectedEnd course={c} nowAbs={nowAbs} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[11px] text-ink-faint">終了（全量か残量）は、ワークシートの「勤務のあいだ続くもの」で記録します。</p>
      </section>
    </div>
  );
}

function LineRow({ line: l, onVoid }: { line: IoLine; onVoid: (id: string, reason: string) => void }) {
  const [voiding, setVoiding] = useState(false);
  const [why, setWhy] = useState("");
  return (
    <tr className="border-b border-rule-soft align-top">
      <td className="w-20 py-1">{displayText(clockText(l.at))}</td>
      <td className="py-1">
        <span className={`mr-1 rounded px-1 text-[10px] font-bold ${l.side === "IN" ? "bg-ai-soft text-ai" : "bg-yamabuki-soft text-yamabuki"}`}>{l.side}</span>
        {l.what} <b>{n(l.ml)}mL</b>
        {l.formula && <div className="text-[10px] text-ink-faint">{l.formula}</div>}
      </td>
      <td className="py-1 text-[11px] text-ink-soft">
        {displayText(l.by)}
        <div className="text-[10px] text-ink-faint">{displayText(l.from)}</div>
      </td>
      <td className="w-36 py-1 text-right text-[11px]">
        {l.entryId &&
          (voiding ? (
            <span className="flex flex-wrap items-center justify-end gap-1">
              <select value={why} onChange={(e) => setWhy(e.target.value)} aria-label="取り消す理由" className="rounded border border-rule bg-paper px-0.5 text-[10px]">
                <option value="">理由を選ぶ</option>
                {IO_VOID_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!why}
                onClick={() => {
                  onVoid(l.entryId!, why);
                  setVoiding(false);
                }}
                className="rounded border border-shu px-1 text-[10px] text-shu disabled:opacity-40"
              >
                取り消す
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setVoiding(true)} className="text-[10px] text-ink-faint underline hover:text-shu">
              記録を取り消す
            </button>
          ))}
      </td>
    </tr>
  );
}

/* Help migration source (references and dynamic wording):
<p >点滴は注射の記録（開始と終了）から入るので、ここでは入れません。食事の摂取量（割）はバイタルの「今日の記録」で入れます。時刻を空にすると、いまの時刻で記録します。</p>
*/
