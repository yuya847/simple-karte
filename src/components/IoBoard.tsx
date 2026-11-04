"use client";

import { useState } from "react";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { pastTime } from "@/lib/drip-course";
import { abs } from "@/lib/flowsheet";
import { IO_NOT_INCLUDED, IO_RULES, inWindow, ioDay, ioDayOf, ioLines, ioProblems, ioShiftAt, ioShifts, ioTotal, signed, windowText, type InKind, type IoEntry, type IoSide, type OutKind } from "@/lib/io-balance";
import type { AdminRecord } from "@/lib/mar";
import { IO } from "@/lib/standing";
import type { WorkPatient } from "@/lib/worksheet";
import { useMe } from "./RoleContext";
import { TabChoice } from "./TabChoice";

interface Props {
  people: WorkPatient[];
  typed: IoEntry[];
  records: Record<string, AdminRecord>;
  sessionStart: number;
  nowTime: string;
  today: CalendarDate;
  /** What each patient's 指示簿 says about 水分出納. */
  standingIoOf: (patientId: string) => string | null;
  onAdd: (e: IoEntry[]) => void;
  newId: () => string;
  onOpen: (patientId: string) => void;
  /** Typing is allowed (看護師). */
  canType: boolean;
}

/** The other kinds, as one choice. */
const OTHERS: { side: IoSide; kind: InKind | OutKind }[] = [
  { side: "IN", kind: "経管" },
  { side: "IN", kind: "輸血" },
  { side: "IN", kind: "その他" },
  { side: "OUT", kind: "便" },
  { side: "OUT", kind: "ドレーン" },
  { side: "OUT", kind: "嘔吐" },
  { side: "OUT", kind: "出血" },
  { side: "OUT", kind: "その他" },
];

type Row = { oral: string; urine: string; other: number; otherMl: string };
const EMPTY: Row = { oral: "", urine: "", other: 0, otherMl: "" };
const n = (x: number) => x.toLocaleString("ja-JP");

/**
 * 水分出納 for several patients at once (the end of a shift): each patient's totals for the shift and
 * the 24 hours so far, and a row to type 経口・尿・one other kind at one time. Code adds up; 点滴 comes
 * from the drip records. Patients whose 指示簿 says to measure IN/OUT and have nothing typed are marked.
 */
export function IoBoard({ people, typed, records, sessionStart, nowTime, today, standingIoOf, onAdd, newId, onOpen, canType }: Props) {
  const me = useMe();
  const nowAbs = abs(0, nowTime);
  const cur = ioShiftAt(nowAbs);
  const curDay = ioDayOf(nowAbs);
  const [day, setDay] = useState(curDay);
  const [shift, setShift] = useState(cur.label);
  const [onlyMeasured, setOnlyMeasured] = useState(true);
  const [time, setTime] = useState("");
  const [rows, setRows] = useState<Record<string, Row>>({});
  const w = ioShifts(day).find((x) => x.label === shift)!;
  const whole = ioDay(day);
  const at = time.trim() ? pastTime(time, nowAbs) : nowAbs;
  const shown = people.filter((x) => !onlyMeasured || standingIoOf(x.patient.id) === IO[0] || standingIoOf(x.patient.id) === IO[1]);
  const set = (pid: string, k: keyof Row, v: string | number) => setRows((all) => ({ ...all, [pid]: { ...(all[pid] ?? EMPTY), [k]: v } }));
  // Every filled box becomes one entry; each is checked.
  const pending = shown.flatMap((x) => {
    const r = rows[x.patient.id] ?? EMPTY;
    const o = OTHERS[r.other];
    return (
      [
        ["IN", "経口", r.oral],
        ["OUT", "尿", r.urine],
        [o.side, o.kind, r.otherMl],
      ] as [IoSide, InKind | OutKind, string][]
    )
      .filter(([, , v]) => v.trim() !== "")
      .map(([side, kind, ml]) => ({ pid: x.patient.id, side, kind, ml, problems: ioProblems({ ml, at, nowAbs }) }));
  });
  const bad = pending.filter((p) => p.problems.length);
  const outside = at !== null && !inWindow(at, w);
  const td = "border-b border-rule px-1.5 py-1 align-top";
  const box = "w-16 rounded border border-rule bg-paper px-1 py-0.5 text-right outline-none focus:border-ai";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-rule bg-sheet px-5 py-2 text-sm">
        <h1 className="text-base font-bold">水分出納（IN/OUT）</h1>
        <TabChoice
          label="日"
          options={[
            { value: curDay - 1, label: `前の日（${formatShort(addDays(today, curDay - 1))} ${IO_RULES.dayClose}〜）` },
            { value: curDay, label: `いまの日（${formatShort(addDays(today, curDay))} ${IO_RULES.dayClose}〜）` },
          ]}
          value={day}
          onChange={setDay}
        />
        <TabChoice label="勤務" options={ioShifts(day).map((x) => ({ value: x.label, label: x.label, disabled: x.lo >= nowAbs, title: x.lo >= nowAbs ? "まだ始まっていません" : undefined }))} value={shift} onChange={setShift} />
        <label className="flex cursor-pointer items-center gap-1 text-xs">
          <input type="checkbox" checked={onlyMeasured} onChange={(e) => setOnlyMeasured(e.target.checked)} className="accent-ai" />
          指示簿で測る患者だけ（水分出納・尿量）
        </label>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper p-5">
        <div className="mx-auto max-w-[1100px] space-y-3 rounded-lg border border-rule bg-sheet p-5 shadow-sm">
          <p className="nums text-[12px] text-ink-soft">
            表示：<b className="text-ink">{windowText(w)}</b>（{formatShort(addDays(today, day))}）と、その日の24時間（{windowText(whole).replace("24時間 ", "")}）のいままで。{IO_RULES.label}。
          </p>
          <table className="nums w-full border-collapse text-[12px]">
            <thead>
              <tr className="text-[11px] text-ink-faint">
                <th className={`${td} text-left font-normal`}>部屋・患者</th>
                <th className={`${td} text-left font-normal`}>指示簿</th>
                <th className={`${td} text-right font-normal`}>{shift} IN</th>
                <th className={`${td} text-right font-normal`}>OUT</th>
                <th className={`${td} text-right font-normal`}>IN − OUT</th>
                <th className={`${td} text-right font-normal`}>24時間 IN／OUT／差</th>
                {canType && <th className={`${td} text-left font-normal`}>入れる量 mL（経口・尿・ほか）</th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((x) => {
                const pid = x.patient.id;
                const lines = ioLines({ patientId: pid, entries: x.entries, typed, records, sessionStart, nowAbs, from: whole.lo });
                const t = ioTotal(lines, { lo: w.lo, hi: Math.min(w.hi, nowAbs) });
                const d24 = ioTotal(lines, { lo: whole.lo, hi: Math.min(whole.hi, nowAbs) });
                const st = standingIoOf(pid);
                const missing = st === IO[0] && !typed.some((e) => e.patientId === pid && !e.voided && inWindow(e.at, { lo: w.lo, hi: Math.min(w.hi, nowAbs) }));
                const r = rows[pid] ?? EMPTY;
                return (
                  <tr key={pid} className={missing ? "bg-yamabuki-soft/40" : ""}>
                    <td className={td}>
                      <button type="button" onClick={() => onOpen(pid)} className="text-left font-bold hover:text-ai hover:underline" title="カルテを開く">
                        {x.room}　{x.patient.name}
                      </button>
                      {missing && <div className="mt-0.5 inline-block rounded bg-yamabuki px-1 text-[10px] font-bold text-white">この勤務の記録なし</div>}
                    </td>
                    <td className={`${td} text-[11px] text-ink-soft`}>{st ?? "—"}</td>
                    <td className={`${td} text-right`} title={t.formula}>
                      {t.inCount ? n(t.in) : "—"}
                    </td>
                    <td className={`${td} text-right`} title={t.formula}>
                      {t.outCount ? n(t.out) : "—"}
                    </td>
                    <td className={`${td} text-right font-bold`} title={t.formula}>
                      {t.balance === null ? <span className="font-normal text-ink-faint">—</span> : signed(t.balance)}
                    </td>
                    <td className={`${td} text-right text-ink-soft`} title={d24.formula}>
                      {d24.inCount ? n(d24.in) : "—"}／{d24.outCount ? n(d24.out) : "—"}／{d24.balance === null ? "—" : signed(d24.balance)}
                    </td>
                    {canType && (
                      <td className={td}>
                        <span className="flex flex-wrap items-center gap-1">
                          <input value={r.oral} onChange={(e) => set(pid, "oral", e.target.value)} inputMode="numeric" placeholder="経口" aria-label={`${x.patient.name}さん 経口（mL）`} className={box} />
                          <input value={r.urine} onChange={(e) => set(pid, "urine", e.target.value)} inputMode="numeric" placeholder="尿" aria-label={`${x.patient.name}さん 尿（mL）`} className={box} />
                          <select value={r.other} onChange={(e) => set(pid, "other", Number(e.target.value))} aria-label={`${x.patient.name}さん ほかの種類`} className="rounded border border-rule bg-paper px-0.5 py-0.5">
                            {OTHERS.map((o, i) => (
                              <option key={`${o.side}-${o.kind}`} value={i}>
                                {o.side} {o.kind}
                              </option>
                            ))}
                          </select>
                          <input value={r.otherMl} onChange={(e) => set(pid, "otherMl", e.target.value)} inputMode="numeric" placeholder="mL" aria-label={`${x.patient.name}さん ほか（mL）`} className={box} />
                        </span>
                        <div className="mt-0.5 text-[10px] text-ink-faint">{t.formula}</div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length === 0 && <p className="text-xs text-ink-faint">指示簿で測る患者はいません。</p>}
          {canType && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-1">
                測った時刻
                <input value={time} onChange={(e) => setTime(e.target.value)} placeholder={nowTime} aria-label="測った時刻" className="w-16 rounded border border-rule bg-paper px-1 py-0.5" />
              </label>
              <span className="text-ink-faint">空ならいま。全員に同じ時刻で入ります。</span>
              <button
                type="button"
                disabled={!pending.length || bad.length > 0 || at === null}
                onClick={() => {
                  if (at === null) return;
                  onAdd(pending.map((p) => ({ id: newId(), patientId: p.pid, side: p.side, kind: p.kind, ml: Number(p.ml), at, by: me.name, recordedAt: nowTime })));
                  setRows({});
                  setTime("");
                }}
                className="ml-auto rounded-md bg-ai px-3 py-1 font-bold text-white disabled:opacity-40"
              >
                まとめて記録（{new Set(pending.map((p) => p.pid)).size}人・{pending.length}件、{me.name}）
              </button>
            </div>
          )}
          {at === null && <p className="text-xs text-shu">時刻は 17:00 の形で入れてください。</p>}
          {bad.length > 0 && <p className="text-xs text-shu">{bad[0].problems[0]}</p>}
          {canType && outside && pending.length > 0 && <p className="text-xs text-yamabuki">この時刻は表示中の勤務（{windowText(w)}）の外です。記録は入れた時刻の勤務に入ります。</p>}
          <p className="text-[11px] text-ink-faint">
            合計と IN − OUT はコードが足し算しています（式はマウスを重ねると出ます）。点滴は注射の記録（終了の 1本 − 残量）から入り、ここでは入れません。IN か OUT の記録がない時間は差を出しません。{IO_NOT_INCLUDED}1人ずつの記録と取り消しは、カルテの「水分出納」で行います。
          </p>
        </div>
      </div>
    </div>
  );
}
