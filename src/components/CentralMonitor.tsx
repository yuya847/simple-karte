"use client";

import { BellOff, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { alarmsOf, autoReasons, liveNumbers, MONITOR_NOTES, MONITOR_RULE, monitored, RESTING, type MonitorCandidate, type MonitorManual } from "@/lib/monitor";
import { MonitorCanvas, type Trace } from "./MonitorCanvas";

interface Props {
  /** The team's inpatients, with the latest recorded vital signs (what the rule looks at). */
  candidates: MonitorCandidate[];
  /** Put on or taken off by hand (a ward record, shared). */
  manual: MonitorManual;
  /** Who may change the manual list: the nurses（架空の病院の取り決め）. Null when allowed, else why not. */
  lockedWhy: string | null;
  onToggle: (id: string, on: boolean) => void;
  /** Open the patient's chart with the monitor window. */
  onOpen: (id: string) => void;
  nowTime: string;
}

/** How many cells one screen holds (6〜8 分割; the rest on the next page). */
const PER_PAGE = 8;

const COLORS = { ecg: "#4ade80", pleth: "#67e8f9" } as const;
const fmt = (v: number | undefined) => (v === undefined ? "—" : String(v));

/**
 * セントラルモニター（模擬）: the patients on a monitor (the rule's choice plus those put on by hand), each in a
 * cell with a small trace and the numbers; a cell in alarm turns red. Pressing a cell opens the chart and the
 * patient's monitor window. Below, the nurses put patients on or take them off. One tick a second drives the
 * wobble of every cell; it stops while the tab is hidden. No sound.
 */
export function CentralMonitor({ candidates, manual, lockedWhy, onToggle, onOpen, nowTime }: Props) {
  const [tick, setTick] = useState(0);
  const [page, setPage] = useState(0);
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

  const list = monitored(candidates, manual);
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const shown = list.slice(Math.min(page, pages - 1) * PER_PAGE, Math.min(page, pages - 1) * PER_PAGE + PER_PAGE);
  const onIds = new Set(list.map((m) => m.patient.id));
  const alarming = list.filter((m) => {
    const live = liveNumbers(m.patient.latest, m.patient.id, tick);
    return alarmsOf({ ...live, sbp: m.patient.latest?.sbp }).length > 0;
  }).length;

  return (
    <div className="space-y-3 p-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-bold">セントラルモニター</h2>
        <span className="rounded bg-fuji-soft px-1.5 py-0.5 text-[11px] text-fuji">模擬</span>
        <span className="text-ink-soft">
          装着中 {list.length}人{alarming > 0 && <b className="ml-2 text-shu">アラーム {alarming}人</b>}
        </span>
        <span className="nums ml-auto text-ink-soft">{nowTime}</span>
        <span className="flex items-center gap-1 text-[11px] text-ink-soft">
          <BellOff size={12} />
          {MONITOR_NOTES.silent}
        </span>
      </div>
      <p className="hint text-xs text-ink-soft">枠を押すとその患者のカルテと患者モニターのウインドウが開きます。装着の付け外しは下の表で（看護師）。</p>

      {list.length === 0 ? (
        <p className="rounded-md border border-dashed border-rule p-6 text-center text-ink-soft">モニターを付けている患者はいません。下の表で付けられます。</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {shown.map(({ patient: p, reasons }) => {
            const live = liveNumbers(p.latest, p.id, tick);
            const alarms = alarmsOf({ ...live, sbp: p.latest?.sbp });
            const traces: Trace[] = [
              { kind: "ecg", rate: live.hr ?? RESTING.hr, color: COLORS.ecg, label: "II" },
              { kind: "pleth", rate: live.hr ?? RESTING.hr, color: COLORS.pleth, label: "SpO2" },
            ];
            const bad = new Set(alarms.map((a) => a.key));
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpen(p.id)}
                aria-label={`${p.name}（${p.room}）のカルテと患者モニターを開く`}
                data-alarm={alarms.length > 0 || undefined}
                className={`rounded-md border-2 p-1.5 text-left ${alarms.length > 0 ? "border-shu bg-shu-soft" : "border-rule bg-sheet hover:border-ai"}`}
              >
                <div className="flex items-baseline gap-2 text-xs">
                  <span className="nums text-ink-soft">{p.room}</span>
                  <span className="truncate font-bold">{p.name}</span>
                  {alarms.length > 0 && <span className="ml-auto animate-pulse rounded bg-shu px-1 text-[10px] font-bold text-white">アラーム</span>}
                </div>
                <MonitorCanvas traces={traces} height={64} speed={80} className="my-1" />
                <div className="nums flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className={bad.has("hr") ? "animate-pulse font-bold text-shu" : ""} style={bad.has("hr") ? undefined : { color: COLORS.ecg }}>
                    HR <b className="text-sm">{fmt(live.hr)}</b>
                  </span>
                  <span className={bad.has("spo2") ? "animate-pulse font-bold text-shu" : ""} style={bad.has("spo2") ? undefined : { color: COLORS.pleth }}>
                    SpO2 <b className="text-sm">{fmt(live.spo2)}</b>
                  </span>
                  <span className={bad.has("rr") ? "animate-pulse font-bold text-shu" : "text-ink-soft"}>
                    RR <b className="text-sm">{fmt(live.rr)}</b>
                  </span>
                  <span className={bad.has("sbp") ? "animate-pulse font-bold text-shu" : "text-ink-soft"}>
                    NIBP <b className="text-sm">{p.latest?.sbp !== undefined ? `${p.latest.sbp}/${p.latest.dbp ?? "—"}` : "—"}</b>
                    {p.latest?.sbp !== undefined && <span className="ml-0.5 text-[10px]">{p.latest.time}</span>}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[10px] text-ink-faint">{reasons.join("・")}</div>
              </button>
            );
          })}
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-ink-soft">
            {PER_PAGE}人ずつ：{Math.min(page, pages - 1) + 1}/{pages} 画面
          </span>
          <button type="button" disabled={page <= 0} onClick={() => setPage((p) => p - 1)} className="rounded border border-rule px-2 py-0.5 disabled:opacity-40">
            前の{PER_PAGE}人
          </button>
          <button type="button" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="rounded border border-rule px-2 py-0.5 disabled:opacity-40">
            次の{PER_PAGE}人
          </button>
        </div>
      )}

      <section className="rounded-md border border-rule-soft bg-paper p-2">
        <h3 className="mb-1 text-xs font-bold">装着の付け外し（看護師）</h3>
        <p className="text-[11px] text-ink-soft">{MONITOR_RULE}</p>
        {lockedWhy && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-soft">
            <Lock size={12} />
            {lockedWhy}
          </p>
        )}
        <table className="mt-1 w-full text-xs">
          <thead>
            <tr className="text-left text-ink-soft">
              <th className="py-0.5 pr-2 font-normal">装着</th>
              <th className="py-0.5 pr-2 font-normal">部屋</th>
              <th className="py-0.5 pr-2 font-normal">患者</th>
              <th className="py-0.5 pr-2 font-normal">取り決めの理由（記録から）</th>
              <th className="py-0.5 font-normal">最新のバイタル</th>
            </tr>
          </thead>
          <tbody>
            {[...candidates]
              .sort((a, b) => a.room.localeCompare(b.room, "ja"))
              .map((p) => {
                const on = onIds.has(p.id);
                const auto = autoReasons(p);
                const v = p.latest;
                return (
                  <tr key={p.id} className="border-t border-rule-soft">
                    <td className="py-0.5 pr-2">
                      <input type="checkbox" checked={on} disabled={!!lockedWhy} onChange={(e) => onToggle(p.id, e.target.checked)} aria-label={`${p.name}にモニターを${on ? "外す" : "付ける"}`} />
                    </td>
                    <td className="nums py-0.5 pr-2">{p.room}</td>
                    <td className="py-0.5 pr-2 font-bold">{p.name}</td>
                    <td className="py-0.5 pr-2 text-ink-soft">
                      {auto.join("・") || "（取り決めの対象外）"}
                      {manual.on.includes(p.id) && <span className="ml-1 text-ai">手で装着</span>}
                      {manual.off.includes(p.id) && <span className="ml-1 text-ink-faint">手で外した</span>}
                    </td>
                    <td className="nums py-0.5 text-ink-soft">{v ? `${v.time}　HR ${fmt(v.hr)} SpO2 ${fmt(v.spo2)} RR ${fmt(v.rr)} BP ${fmt(v.sbp)}/${fmt(v.dbp)}${v.o2 ? `　${v.o2}` : ""}` : "記録なし"}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </section>

      <div className="space-y-0.5 text-[11px] text-ink-soft">
        <p>{MONITOR_NOTES.simulated}</p>
        <p>{MONITOR_NOTES.limits}</p>
        <p>{MONITOR_NOTES.shapes}</p>
      </div>
    </div>
  );
}
