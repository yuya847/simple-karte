"use client";

import { FlaskConical, PhoneCall } from "lucide-react";
import { useState } from "react";
import { callScript, hitLine, type Ack, type PanicCall, type PanicLimit, type ResultItem } from "@/lib/results";
import { ANALYTES } from "@/lib/master";
import type { WorkPatient } from "@/lib/worksheet";
import { DenyNote, useDeny, useMe } from "./RoleContext";

interface Props {
  people: WorkPatient[];
  /** Today's results of the ward's patients. */
  items: ResultItem[];
  calls: Record<string, PanicCall>;
  /** The doctor's 確認 (with the response for a panic value), to check that someone acted. */
  acks: Record<string, Ack>;
  limits: PanicLimit[];
  limitsSource: string;
  nowTime: string;
  attending: string;
  onCall: (c: PanicCall) => void;
}

/** 検査室: today's results for the ward, panic values found by code, and the record of each phone call. */
export function LabView({ people, items, calls, acks, limits, limitsSource, nowTime, attending, onCall }: Props) {
  const name = (pid: string) => people.find((x) => x.patient.id === pid);
  items = [...items].sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  const panic = items.filter((i) => i.panic.length > 0);
  const waiting = panic.filter((i) => !calls[i.key]);
  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-paper p-4 text-[13px]">
      <header className="mb-3 flex flex-wrap items-baseline gap-2">
        <h2 className="flex items-center gap-1.5 text-base font-bold">
          <FlaskConical size={17} />
          検査室：今日の結果（5階東病棟）
        </h2>
        <span className={`text-xs font-bold ${waiting.length ? "text-shu" : "text-wakatake"}`}>
          {waiting.length ? `パニック値の連絡がまだ ${waiting.length}件` : "パニック値はすべて連絡済み"}
        </span>
      </header>
      <DenyNote action="panic.call" className="mb-2" />

      {panic.length > 0 && (
        <section className="mb-4 space-y-2">
          <h3 className="text-xs font-bold text-shu">パニック値（コードで判定。連絡するのは人）</h3>
          {panic.map((i) => {
            const w = name(i.patientId);
            return (
              <PanicCard
                key={i.key}
                item={i}
                who={w ? `${w.room} ${w.patient.name}さん` : i.patientId}
                script={w ? callScript(i, w.patient, w.room) : []}
                call={calls[i.key]}
                ack={acks[i.key]}
                nowTime={nowTime}
                attending={attending}
                onCall={onCall}
              />
            );
          })}
        </section>
      )}

      <section>
        <h3 className="mb-1 text-xs font-bold text-ink-soft">今日の結果（{items.length}件）</h3>
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-rule text-left text-ink-soft">
              <th className="py-1 pr-2 font-normal">時刻</th>
              <th className="py-1 pr-2 font-normal">患者</th>
              <th className="py-1 pr-2 font-normal">種類</th>
              <th className="py-1 font-normal">内容</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const w = name(i.patientId);
              return (
                <tr key={i.key} className="border-b border-rule-soft align-top">
                  <td className="nums py-1 pr-2">{i.time || "—"}</td>
                  <td className="py-1 pr-2">
                    <span className="nums text-ink-faint">{w?.room}</span> {w?.patient.name}
                  </td>
                  <td className="py-1 pr-2">{i.title}</td>
                  <td className={`py-1 ${i.panic.length ? "font-bold text-shu" : ""}`}>{i.panic.length ? `パニック値：${i.panic.map(hitLine).join("、")}` : i.detail}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="mt-4 rounded-md border border-rule bg-sheet p-3 text-[11px] text-ink-soft">
        <h3 className="mb-1 font-bold">この架空の病院のパニック値</h3>
        <p className="nums">
          {limits
            .map((l) => {
              const a = ANALYTES.find((x) => x.code === l.code);
              return `${a?.name ?? l.code} ${[l.low !== undefined ? `${l.low}以下` : "", l.high !== undefined ? `${l.high}以上` : ""].filter(Boolean).join("・")}${a?.unit ? ` ${a.unit}` : ""}`;
            })
            .join("　")}
        </p>
        <p className="mt-1">{limitsSource}</p>
      </section>
    </div>
  );
}

function PanicCard({ item, who, script, call, ack, nowTime, attending, onCall }: { item: ResultItem; who: string; script: string[]; call?: PanicCall; ack?: Ack; nowTime: string; attending: string; onCall: (c: PanicCall) => void }) {
  const me = useMe();
  const deny = useDeny()("panic.call");
  const [to, setTo] = useState(`主治医 ${attending}（オーダーした医師）`);
  const [means, setMeans] = useState<PanicCall["means"]>("電話");
  const [readBack, setReadBack] = useState(false);
  return (
    <div className="rounded-lg border border-shu/50 bg-shu-soft/50 p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <b>{who}</b>
        <span className="nums text-ink-soft">
          {item.kind === "培養" ? "報告" : "採取"} {item.time}
        </span>
        <b className="text-shu">{item.panic.map(hitLine).join("、")}</b>
      </div>
      {call ? (
        <div className="mt-1 space-y-0.5 text-xs">
          <p className="flex items-center gap-1 text-wakatake">
            <PhoneCall size={12} />
            {call.at.time} に {call.by} が {call.to} へ{call.means}で報告（{call.readBack ? "復唱あり" : "復唱なし"}）
          </p>
          {ack ? (
            <p className="text-wakatake">
              医師の対応：{ack.at.time} {ack.by}「{ack.response ?? "確認した"}」
            </p>
          ) : (
            <p className="font-bold text-yamabuki">医師の対応の記録がまだです。続けば、もう一度連絡するか、同じ科の医師・管理当直に連絡します。</p>
          )}
        </div>
      ) : (
        <fieldset disabled={!!deny} className="m-0 mt-1 min-w-0 space-y-1 border-0 p-0 text-xs">
          <div className="rounded border border-rule bg-sheet px-2 py-1 text-ink-soft">
            <span className="font-bold">伝える内容（提言第20号の順。コードで並べた）：</span>
            {script.join("　")}
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1">
            報告した相手
            <input value={to} onChange={(e) => setTo(e.target.value)} className="w-64 rounded border border-rule bg-sheet px-1.5 py-0.5" />
          </label>
          <select value={means} onChange={(e) => setMeans(e.target.value as PanicCall["means"])} aria-label="手段" className="rounded border border-rule bg-sheet px-1 py-0.5">
            <option>電話</option>
            <option>対面</option>
          </select>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={readBack} onChange={(e) => setReadBack(e.target.checked)} className="accent-shu" />
            相手が値を復唱した
          </label>
          <button
            type="button"
            disabled={!to.trim()}
            onClick={() => onCall({ key: item.key, patientId: item.patientId, hits: item.panic, by: me.name, to: to.trim(), means, readBack, at: { day: 0, time: nowTime } })}
            className="ml-auto flex items-center gap-1 rounded bg-shu px-3 py-1 font-bold text-white disabled:opacity-40"
          >
            <PhoneCall size={12} />
            報告した（{nowTime}）
          </button>
          </div>
        </fieldset>
      )}
    </div>
  );
}
