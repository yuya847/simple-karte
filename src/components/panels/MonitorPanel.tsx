"use client";

import { displayText } from "@/lib/display-text";
import { BellOff, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { alarmsOf, liveNumbers, MONITOR_LIMITS, MONITOR_NOTES, NIBP_SECONDS, RESTING, simulatedNibp, type MonitorValues } from "@/lib/monitor";
import type { Patient, VitalSign } from "@/lib/types";
import { auditLog } from "@/lib/audit";
import { MonitorCanvas, type Trace } from "../MonitorCanvas";
import { useMe } from "../RoleContext";

interface Props {
  patient: Pick<Patient, "id" | "name" | "room" | "age" | "sex" | "vitals">;
  /** "HH:MM" now (the chart's clock). */
  nowTime: string;
  /** Null when this person may write vital signs; else why not (shown next to the buttons). */
  lockedWhy: string | null;
  /** Put a measurement into the flow sheet (the same record as バイタル). */
  onRecord: (v: VitalSign) => void;
  /** "11/3（火）" for a day offset. */
  fmtDay?: (d: number) => string;
}

type Nibp = { state: "idle" } | { state: "measuring"; left: number; sbp: number; dbp: number; time: string } | { state: "done"; sbp: number; dbp: number; time: string; recorded?: string };

/** One second counted up while the tab is shown (the wobble's tick). Stops while the tab is hidden. */
function useTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let id: number | null = null;
    const start = () => {
      if (id === null) id = window.setInterval(() => setTick((t) => t + 1), 1000);
    };
    const stop = () => {
      if (id !== null) window.clearInterval(id);
      id = null;
    };
    const onVisible = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisible);
    if (!document.hidden) start();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return tick;
}

const COLORS = { ecg: "#4ade80", pleth: "#67e8f9", resp: "#fde047" } as const;

const fmt = (v: number | undefined) => (v === undefined ? "—" : String(v));

/**
 * ベッドサイドモニターの画面（模擬）: the patient's name, room and the time on top; the three traces (心電図 II 誘導・
 * SpO2 の脈波・呼吸) on the left; the numbers (HR・SpO2・RR・NIBP・体温) on the right, from the latest recorded
 * vital signs with a small wobble that is the same every time for the same patient. Values outside the fictional
 * ward's limits blink and are named in the band on top; no sound. 「NIBP 測定」 simulates a cuff and 「記録する」
 * puts what is shown into the flow sheet (who and when), for those allowed to write vital signs.
 */
export function MonitorPanel({ patient, nowTime, lockedWhy, onRecord, fmtDay }: Props) {
  const me = useMe();
  const tick = useTick();
  const latest = patient.vitals.at(-1);
  const live = liveNumbers(latest, patient.id, tick);
  const lastBp = [...patient.vitals].reverse().find((v) => v.sbp !== undefined);
  const lastBt = [...patient.vitals].reverse().find((v) => v.bt !== undefined);
  const [nibp, setNibp] = useState<Nibp>({ state: "idle" });
  const [recorded, setRecorded] = useState<{ time: string; by: string; what: string } | null>(null);

  // The simulated cuff: the result is worked out when the button is pressed; the count-down only reveals it.
  const measuring = nibp.state === "measuring";
  useEffect(() => {
    if (!measuring) return;
    const id = window.setInterval(() => {
      setNibp((n) => {
        if (n.state !== "measuring") return n;
        if (n.left > 1) return { ...n, left: n.left - 1 };
        return { state: "done", sbp: n.sbp, dbp: n.dbp, time: n.time };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [measuring]);

  const shownBp = nibp.state === "done" ? { sbp: nibp.sbp, dbp: nibp.dbp, time: nibp.time, fresh: true } : lastBp ? { sbp: lastBp.sbp!, dbp: lastBp.dbp, time: lastBp.time, day: lastBp.day, fresh: false } : null;
  const values: MonitorValues = { hr: live.hr, spo2: live.spo2, rr: live.rr, sbp: shownBp?.sbp };
  const alarms = alarmsOf(values);
  const alarmed = new Set(alarms.map((a) => a.key));
  const traces: Trace[] = [
    { kind: "ecg", rate: live.hr ?? RESTING.hr, color: COLORS.ecg, label: "II" },
    { kind: "pleth", rate: live.hr ?? RESTING.hr, color: COLORS.pleth, label: "SpO2" },
    { kind: "resp", rate: live.rr ?? RESTING.rr, color: COLORS.resp, label: "RESP" },
  ];
  const limitOf = (k: "hr" | "spo2" | "rr" | "sbp") => {
    const l = MONITOR_LIMITS.find((x) => x.key === k)!;
    return `${l.low ?? "—"}〜${l.high ?? "—"}`;
  };
  const tile = (key: "hr" | "spo2" | "rr", label: string, unit: string, color: string, value: number | undefined) => (
    <div className={`rounded-md border p-2 ${alarmed.has(key) ? "animate-pulse border-shu bg-shu-soft" : "border-rule-soft bg-paper"}`} aria-live={alarmed.has(key) ? "polite" : undefined}>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="font-bold" style={{ color }}>
          {label}
        </span>
        <span className="text-ink-faint">{limitOf(key)}</span>
      </div>
      <div className={`nums text-3xl font-bold leading-none ${alarmed.has(key) ? "text-shu" : "text-ink"}`}>
        {fmt(value)}
        <span className="ml-1 text-xs font-normal text-ink-soft">{unit}</span>
      </div>
    </div>
  );
  const whenOf = (v: { day?: number; time: string }) => (v.day !== undefined && v.day !== 0 && fmtDay ? `${fmtDay(v.day)} ${v.time}` : v.time);

  const record = (v: VitalSign, what: string) => {
    onRecord(v);
    auditLog({ role: me.role, actor: me.name, action: "確定（バイタル・モニターから）", patient: patient.name, detail: what });
    setRecorded({ time: nowTime, by: me.name, what });
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-rule bg-paper px-3 py-1.5">
        <span className="text-base font-bold">{patient.name}</span>
        <span className="text-ink-soft">
          {patient.room}　{patient.age}歳 {patient.sex}
        </span>
        <span className="nums ml-auto text-ink-soft">{nowTime}</span>
        <span className="rounded bg-fuji-soft px-1.5 py-0.5 text-[11px] text-fuji">模擬</span>
      </div>

      {alarms.length > 0 ? (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md border border-shu bg-shu px-3 py-1.5 text-xs font-bold text-white">
          <span className="animate-pulse">アラーム</span>
          {alarms.map((a) => (
            <span key={a.key}>{displayText(a.text)}</span>
          ))}
          <span className="ml-auto flex items-center gap-1 font-normal">
            <BellOff size={12} />
            {MONITOR_NOTES.silent}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-rule-soft bg-paper px-3 py-1 text-xs text-ink-soft">
          <span>アラームなし（上下限の中）</span>
          <span className="ml-auto flex items-center gap-1">
            <BellOff size={12} />
            {MONITOR_NOTES.silent}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row">
        <div className="min-w-0 flex-1">
          <MonitorCanvas traces={traces} height={270} />
          <p className="mt-1 text-[11px] text-ink-soft">波形は模擬（実際の装置につないでいません）。{MONITOR_NOTES.shapes}</p>
        </div>
        <div className="grid w-full shrink-0 grid-cols-2 gap-2 md:w-56 md:grid-cols-1">
          {tile("hr", "HR", "/分", COLORS.ecg, live.hr)}
          {tile("spo2", "SpO2", "%", COLORS.pleth, live.spo2)}
          {tile("rr", "RR", "/分", COLORS.resp, live.rr)}
          <div className={`rounded-md border p-2 ${alarmed.has("sbp") ? "animate-pulse border-shu bg-shu-soft" : "border-rule-soft bg-paper"}`}>
            <div className="flex items-baseline justify-between text-[11px]">
              <span className="font-bold text-ink">NIBP</span>
              <span className="text-ink-faint">{limitOf("sbp")}</span>
            </div>
            {nibp.state === "measuring" ? (
              <div className="nums text-xl font-bold text-ink-soft" aria-live="polite">
                測定中… <span className="text-sm font-normal">あと {nibp.left} 秒</span>
              </div>
            ) : shownBp ? (
              <div className={`nums text-2xl font-bold leading-none ${alarmed.has("sbp") ? "text-shu" : "text-ink"}`}>
                {shownBp.sbp}/{shownBp.dbp ?? "—"}
                <span className="ml-1 text-xs font-normal text-ink-soft">mmHg</span>
              </div>
            ) : (
              <div className="nums text-2xl font-bold leading-none text-ink">—</div>
            )}
            <div className="mt-0.5 text-[11px] text-ink-soft">{nibp.state === "done" ? `測定 ${nibp.time}（模擬）` : shownBp ? `記録 ${whenOf(shownBp)}` : "記録なし"}</div>
          </div>
          <div className="rounded-md border border-rule-soft bg-paper p-2">
            <div className="text-[11px] font-bold text-ink">体温（記録）</div>
            <div className="nums text-2xl font-bold leading-none text-ink">
              {lastBt ? lastBt.bt : "—"}
              <span className="ml-1 text-xs font-normal text-ink-soft">℃</span>
            </div>
            <div className="mt-0.5 text-[11px] text-ink-soft">{lastBt ? `記録 ${whenOf(lastBt)}` : "記録なし"}</div>
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-md border border-rule-soft bg-paper p-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={nibp.state === "measuring"} onClick={() => setNibp({ state: "measuring", left: NIBP_SECONDS, ...simulatedNibp(lastBp, patient.id, tick), time: nowTime })} className="rounded-md border border-ai px-3 py-1 font-bold text-ai hover:bg-ai hover:text-white disabled:opacity-40">
            NIBP 測定
          </button>
          {nibp.state === "done" && !nibp.recorded && (
            <button
              type="button"
              disabled={!!lockedWhy}
              onClick={() => {
                record({ day: 0, time: nibp.time, sbp: nibp.sbp, dbp: nibp.dbp, by: me.name }, `BP ${nibp.sbp}/${nibp.dbp}（NIBP）`);
                setNibp({ ...nibp, recorded: me.name });
              }}
              className="rounded-md bg-ai px-3 py-1 font-bold text-white disabled:opacity-40"
            >
              この血圧を経過表に入れる
            </button>
          )}
          {nibp.state === "done" && nibp.recorded && <span className="text-ink-soft">血圧を経過表に入れました（{nibp.recorded}）</span>}
          <button
            type="button"
            disabled={!!lockedWhy || (live.hr === undefined && live.spo2 === undefined && live.rr === undefined)}
            onClick={() => record({ day: 0, time: nowTime, hr: live.hr, spo2: live.spo2, rr: live.rr, o2: latest?.o2, by: me.name }, `HR ${fmt(live.hr)} SpO2 ${fmt(live.spo2)} RR ${fmt(live.rr)}（モニターの表示）`)}
            className="rounded-md bg-ai px-3 py-1 font-bold text-white disabled:opacity-40"
          >
            記録する（HR・SpO2・RR）
          </button>
          {lockedWhy && (
            <span className="flex items-center gap-1 text-ink-soft">
              <Lock size={12} />
              {lockedWhy}
            </span>
          )}
        </div>
        {recorded && (
          <p className="text-ink-soft">
            記録しました：{recorded.time} {displayText(recorded.by)}　{recorded.what}
          </p>
        )}
        <p className="hint text-ink-soft">「NIBP 測定」で模擬のカフが {NIBP_SECONDS} 秒後に血圧を出し、「この血圧を経過表に入れる」で経過表のバイタルに記録します。「記録する」はいま表示している HR・SpO2・RR を記録します（誰が・いつも残ります）。記録はカルテのバイタルと同じ権限です。</p>
      </div>

      <div className="space-y-0.5 text-[11px] text-ink-soft">
        <p>{MONITOR_NOTES.simulated}</p>
        <p>{MONITOR_NOTES.limits}</p>
      </div>
    </div>
  );
}
