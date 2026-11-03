"use client";

import { Mic, Square } from "lucide-react";
import { useState } from "react";
import { ACVPU_LABEL, news2, type Acvpu } from "@/lib/news2";
import { useSpeech } from "@/lib/use-speech";
import type { DailyRecord, VitalSign } from "@/lib/types";
import { CLAUDE, auditLog } from "@/lib/audit";
import { useMe } from "../RoleContext";

/** What the nurse adds to today's record: urine and stools are added up, meals and weight are set. */
export interface DailyInput {
  urineMl?: number;
  stools?: number;
  meal?: { slot: 0 | 1 | 2; tenths: number };
  weightKg?: number;
}

interface Props {
  nowTime: string;
  last?: VitalSign;
  onSave: (v: VitalSign) => void;
  /** Today's 尿量・排便・食事・体重 so far, and the last weight before today. */
  today?: DailyRecord;
  prevWeight?: { day: number; kg: number };
  onDaily?: (d: DailyInput) => void;
}

const MEAL_SLOTS = ["朝", "昼", "夕"] as const;

/** 尿量・排便・食事の摂取量・体重: added to today's record; totals and the weight change are counted in code. */
function DailyForm({ today, prevWeight, onDaily }: { today?: DailyRecord; prevWeight?: { day: number; kg: number }; onDaily: (d: DailyInput) => void }) {
  const [urine, setUrine] = useState("");
  const [stools, setStools] = useState("");
  const [slot, setSlot] = useState<0 | 1 | 2 | null>(null);
  const [tenths, setTenths] = useState("");
  const [weight, setWeight] = useState("");
  const n = (s: string) => (s.trim() === "" ? undefined : Number(s));
  const w = n(weight);
  // Numbers only, none below zero (to take back a wrong entry, enter it again as it should be and note why).
  const bad = [urine, stools, tenths, weight].some((s) => s.trim() !== "" && (!Number.isFinite(Number(s)) || Number(s) < 0)) || (n(tenths) !== undefined && (n(tenths)! < 0 || n(tenths)! > 10)) || (n(tenths) !== undefined && slot === null);
  const any = [urine, stools, weight].some((s) => s.trim()) || (slot !== null && tenths.trim() !== "");
  const box = "w-16 rounded border border-rule bg-paper px-1.5 py-1 text-right text-[13px] outline-none focus:border-ai";
  const meals = today?.meals;
  return (
    <div className="space-y-2 rounded-md border border-rule-soft bg-paper p-2 text-xs">
      <div className="flex flex-wrap items-baseline gap-x-3 text-ink-soft">
        <b className="text-ink">今日の記録</b>
        <span className="nums">尿量 {today?.urineMl ?? 0}mL</span>
        <span className="nums">排便 {today?.stools ?? 0}回</span>
        <span className="nums">食事（主食）{meals === "絶食" ? "絶食" : MEAL_SLOTS.map((s, i) => `${s} ${meals?.[i] ?? "—"}`).join("・")}</span>
        <span className="nums">体重 {today?.weightKg ?? "—"}kg</span>
      </div>
      <div className="nums flex flex-wrap items-end gap-2 text-ink-soft">
        <label className="flex flex-col gap-0.5">
          尿量を足す mL
          <input value={urine} onChange={(e) => setUrine(e.target.value)} inputMode="numeric" aria-label="尿量（mL）" className={box} />
        </label>
        <label className="flex flex-col gap-0.5">
          排便 回
          <input value={stools} onChange={(e) => setStools(e.target.value)} inputMode="numeric" aria-label="排便（回）" className={box} />
        </label>
        <span className="flex flex-col gap-0.5">
          食事（主食・割）
          <span className="flex items-center gap-1">
            {MEAL_SLOTS.map((s, i) => (
              <button key={s} type="button" onClick={() => setSlot(i as 0 | 1 | 2)} aria-pressed={slot === i} className={`rounded border px-1.5 py-0.5 ${slot === i ? "border-ai bg-ai text-white" : "border-rule"}`}>
                {s}
              </button>
            ))}
            <input value={tenths} onChange={(e) => setTenths(e.target.value)} inputMode="numeric" aria-label="食事の摂取量（割）" className={`${box} w-12`} />割
          </span>
        </span>
        <label className="flex flex-col gap-0.5">
          体重 kg
          <input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" aria-label="体重（kg）" className={box} />
        </label>
        <button
          type="button"
          disabled={!any || bad}
          onClick={() => {
            onDaily({ urineMl: n(urine), stools: n(stools), meal: slot !== null && n(tenths) !== undefined ? { slot, tenths: n(tenths)! } : undefined, weightKg: w });
            setUrine("");
            setStools("");
            setTenths("");
            setSlot(null);
            setWeight("");
          }}
          className="rounded-md bg-ai px-3 py-1 font-bold text-white disabled:opacity-40"
        >
          記録する
        </button>
      </div>
      {w !== undefined && prevWeight && <p className="nums text-ink-soft">前回の体重 {prevWeight.kg}kg（{prevWeight.day === -1 ? "昨日" : `${-prevWeight.day}日前`}）から {w - prevWeight.kg >= 0 ? "+" : ""}{Math.round((w - prevWeight.kg) * 10) / 10}kg（コードで計算）</p>}
      {bad && <p className="text-shu">数で入れてください（食事は 0〜10 割で、朝・昼・夕を選ぶ）。</p>}
    </div>
  );
}

type Form = { bt: string; hr: string; sbp: string; dbp: string; rr: string; spo2: string; o2: string; avpu: Acvpu | "" };
const empty: Form = { bt: "", hr: "", sbp: "", dbp: "", rr: "", spo2: "", o2: "室内気", avpu: "" };
const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

const RISK_STYLE = { 低: "bg-wakatake-soft text-wakatake", "低〜中": "bg-yamabuki-soft text-yamabuki", 中: "bg-yamabuki-soft text-yamabuki", 高: "bg-shu-soft text-shu" } as const;

/** Vital signs entry (typed or spoken). Claude copies the numbers; NEWS2 is code; the nurse confirms. */
export function VitalsPanel({ nowTime, last, onSave, today, prevWeight, onDaily }: Props) {
  const me = useMe();
  const [f, setF] = useState<Form>(empty);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const speech = useSpeech((t) => setText((x) => (x ? `${x}、${t}` : t)));
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const v = { bt: num(f.bt), hr: num(f.hr), sbp: num(f.sbp), dbp: num(f.dbp), rr: num(f.rr), spo2: num(f.spo2), o2: f.o2 || "室内気", avpu: f.avpu || undefined };
  const score = news2(v);
  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/vitals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `エラー（${res.status}）`);
      const x = json.vitals;
      auditLog({ role: "AI", actor: CLAUDE, action: "バイタルを数値に写した", detail: text });
      const s = (n?: number) => (n === undefined ? "" : String(n));
      setF((cur) => ({ bt: s(x.bt) || cur.bt, hr: s(x.hr) || cur.hr, sbp: s(x.sbp) || cur.sbp, dbp: s(x.dbp) || cur.dbp, rr: s(x.rr) || cur.rr, spo2: s(x.spo2) || cur.spo2, o2: x.o2 ?? cur.o2, avpu: x.avpu ?? cur.avpu }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み取れませんでした。");
    } finally {
      setBusy(false);
    }
  };
  const input = "w-16 rounded border border-rule bg-paper px-1.5 py-1 text-right text-[13px] outline-none focus:border-ai";
  const filled = Object.values({ ...f, o2: "" }).some((x) => x !== "");
  return (
    <div className="space-y-3 text-[13px]">
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="例：38度2分、脈104、98の60、呼吸24、93%、鼻カニュラ2L、清明" className="flex-1 rounded border border-rule bg-paper px-2 py-1.5 outline-none focus:border-ai" />
        {speech.supported && (
          <button type="button" onClick={speech.listening ? speech.stop : speech.start} className="rounded border border-rule px-2" title="話して入力">
            {speech.listening ? <Square size={14} /> : <Mic size={14} />}
          </button>
        )}
        <button type="button" disabled={!text.trim() || busy} onClick={read} className="rounded bg-ai px-3 py-1.5 font-bold text-white disabled:opacity-40">
          {busy ? "…" : "数値にする"}
        </button>
      </div>
      {error && <p className="text-shu">{error}</p>}
      <div className="nums grid grid-cols-4 gap-2 text-xs text-ink-soft">
        {(
          [
            ["bt", "体温 ℃"],
            ["hr", "脈拍 /分"],
            ["sbp", "血圧 上"],
            ["dbp", "血圧 下"],
            ["rr", "呼吸数 /分"],
            ["spo2", "SpO2 %"],
          ] as const
        ).map(([k, l]) => (
          <label key={k} className="flex flex-col gap-0.5">
            {l}
            <input value={f[k]} onChange={set(k)} inputMode="decimal" className={input} />
          </label>
        ))}
        <label className="col-span-2 flex flex-col gap-0.5">
          酸素
          <input value={f.o2} onChange={set("o2")} className="rounded border border-rule bg-paper px-1.5 py-1 text-[13px]" />
        </label>
        <label className="col-span-2 flex flex-col gap-0.5">
          意識（ACVPU）
          <select value={f.avpu} onChange={set("avpu")} className="rounded border border-rule bg-paper px-1 py-1 text-[13px]">
            <option value="">（選ぶ）</option>
            {(Object.keys(ACVPU_LABEL) as Acvpu[]).map((a) => (
              <option key={a} value={a}>
                {ACVPU_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {filled && (
        <div className="rounded-md border border-rule bg-paper p-2">
          <div className="flex items-baseline gap-2">
            <b>NEWS2 {score.total}点</b>
            <span className={`rounded px-1.5 text-[11px] font-bold ${RISK_STYLE[score.risk]}`}>{score.risk}</span>
            <span className="text-[11px] text-ink-soft">観察の目安（RCP）：{score.monitoring}</span>
          </div>
          <div className="nums mt-1 flex flex-wrap gap-x-3 text-[11px] text-ink-soft">
            {score.parts.map((p) => (
              <span key={p.name} className={p.score === 3 ? "font-bold text-shu" : p.score ? "text-ink" : ""}>
                {p.name} {p.value}：{p.score}
              </span>
            ))}
          </div>
          {score.missing.length > 0 && <p className="mt-1 text-[11px] text-yamabuki">未入力：{score.missing.join("・")}（スコアは入力した項目だけ）</p>}
          <p className="mt-1 text-[10px] text-ink-faint">NEWS2（英国 Royal College of Physicians, 2017）の点数表で、コードが計算しています。SpO2 は Scale 1。対応は病棟の取り決めと医師の判断です。</p>
        </div>
      )}
      {last && (
        <p className="text-[11px] text-ink-faint">
          前回 {last.time}：BT {last.bt} HR {last.hr} BP {last.sbp}/{last.dbp} RR {last.rr} SpO2 {last.spo2}%（{last.o2}）
        </p>
      )}
      <button
        type="button"
        disabled={!filled}
        onClick={() => {
          onSave({ day: 0, time: nowTime, ...v, by: me.name });
          setF(empty);
          setText("");
        }}
        className="w-full rounded-md bg-ai px-3 py-2 font-bold text-white disabled:opacity-40"
      >
        確定（{nowTime}）
      </button>
      {onDaily && <DailyForm today={today} prevWeight={prevWeight} onDaily={onDaily} />}
    </div>
  );
}
