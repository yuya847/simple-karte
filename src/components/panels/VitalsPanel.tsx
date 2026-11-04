"use client";

import { focusNextOnEnter } from "@/lib/next-field";
import { Mic, Square } from "lucide-react";
import { useState } from "react";
import { ACVPU_LABEL, type Acvpu } from "@/lib/news2";
import { useSpeech } from "@/lib/use-speech";
import type { DailyRecord, VitalSign } from "@/lib/types";
import { minutesOf } from "@/lib/dates";
import { CLAUDE, auditLog } from "@/lib/audit";
import { useMe } from "../RoleContext";

/**
 * What the nurse adds to today's record: stools are added up, meals and weight are set. (urineMl stays for
 * records typed before; urine is now typed with its time in 水分出納.)
 */
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
  /** Open 水分出納, where urine and the other IN/OUT are typed with their time. */
  onOpenIo?: () => void;
  /** The time the measurement was taken, when opened from a cell of the flow sheet (else now). */
  defaultAt?: { day: number; time: string };
  /** "11/3（火）" for a day offset. */
  fmtDay?: (d: number) => string;
}

const MEAL_SLOTS = ["朝", "昼", "夕"] as const;

/** 排便・食事の摂取量・体重: added to today's record; the weight change is counted in code. 尿量 is typed in 水分出納. */
function DailyForm({ today, prevWeight, onDaily, onOpenIo }: { today?: DailyRecord; prevWeight?: { day: number; kg: number }; onDaily: (d: DailyInput) => void; onOpenIo?: () => void }) {
  const [stools, setStools] = useState("");
  const [slot, setSlot] = useState<0 | 1 | 2 | null>(null);
  const [tenths, setTenths] = useState("");
  const [weight, setWeight] = useState("");
  const n = (s: string) => (s.trim() === "" ? undefined : Number(s));
  const w = n(weight);
  // Numbers only, none below zero.
  const bad = [stools, tenths, weight].some((s) => s.trim() !== "" && (!Number.isFinite(Number(s)) || Number(s) < 0)) || (n(tenths) !== undefined && (n(tenths)! < 0 || n(tenths)! > 10)) || (n(tenths) !== undefined && slot === null);
  const any = [stools, weight].some((s) => s.trim()) || (slot !== null && tenths.trim() !== "");
  const box = "w-16 rounded border border-rule bg-paper px-1.5 py-1 text-right text-[13px] outline-none focus:border-ai";
  const meals = today?.meals;
  return (
    <div className="space-y-2 rounded-md border border-rule-soft bg-paper p-2 text-xs">
      <div className="flex flex-wrap items-baseline gap-x-3 text-ink-soft">
        <b className="text-ink">今日の記録</b>
        <span className="nums" title="水分出納で入れた尿（0〜24時）を足したもの">尿量 {today?.urineMl ?? 0}mL</span>
        <span className="nums">排便 {today?.stools ?? 0}回</span>
        <span className="nums">食事（主食）{meals === "絶食" ? "絶食" : MEAL_SLOTS.map((s, i) => `${s} ${meals?.[i] ?? "—"}`).join("・")}</span>
        <span className="nums">体重 {today?.weightKg ?? "—"}kg</span>
      </div>
      <div className="nums flex flex-wrap items-end gap-2 text-ink-soft">
        <span className="flex flex-col gap-0.5">
          尿量
          {onOpenIo ? (
            <button type="button" onClick={onOpenIo} className="rounded border border-ai px-1.5 py-1 text-ai hover:bg-ai hover:text-white">
              水分出納で入れる
            </button>
          ) : (
            <span className="py-1 text-ink-faint">水分出納で入れる</span>
          )}
        </span>
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
            onDaily({ stools: n(stools), meal: slot !== null && n(tenths) !== undefined ? { slot, tenths: n(tenths)! } : undefined, weightKg: w });
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


/** Vital signs entry (typed or spoken). Claude copies the numbers; NEWS2 is code; the nurse confirms. */
export function VitalsPanel({ nowTime, last, onSave, today, prevWeight, onDaily, onOpenIo, defaultAt, fmtDay }: Props) {
  const me = useMe();
  const [f, setF] = useState<Form>(empty);
  // 測った時刻: now, or the time of the flow sheet's cell (it can be changed, not later than now).
  const [when, setWhen] = useState<{ day: number; time: string } | null>(defaultAt ?? null);
  const whenOk = !when || (/^([01]\d|2[0-3]):[0-5]\d$/.test(when.time) && when.day * 1440 + minutesOf(when.time) <= minutesOf(nowTime));
  const at = when && whenOk ? when : { day: 0, time: nowTime };
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const speech = useSpeech((t) => setText((x) => (x ? `${x}、${t}` : t)));
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const v = { bt: num(f.bt), hr: num(f.hr), sbp: num(f.sbp), dbp: num(f.dbp), rr: num(f.rr), spo2: num(f.spo2), o2: f.o2 || "室内気", avpu: f.avpu || undefined };
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
    <div className="space-y-3 text-[13px]" onKeyDown={focusNextOnEnter}>
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="例：38度2分、脈104、98の60、呼吸24、93%、鼻カニュラ2L、清明" className="min-w-0 flex-1 rounded border border-rule bg-paper px-2 py-1.5 outline-none focus:border-ai" />
        {speech.supported && (
          <button type="button" onClick={speech.listening ? speech.stop : speech.start} className="shrink-0 rounded border border-rule px-2" title="話して入力">
            {speech.listening ? <Square size={14} /> : <Mic size={14} />}
          </button>
        )}
        <button type="button" disabled={!text.trim() || busy} onClick={read} className="shrink-0 whitespace-nowrap rounded bg-ai px-3 py-1.5 font-bold text-white disabled:opacity-40">
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
            <input value={f[k]} onChange={set(k)} inputMode="decimal" enterKeyHint="next" className={input} />
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
      {last && (
        <p className="text-[11px] text-ink-faint">
          前回 {last.time}：BT {last.bt} HR {last.hr} BP {last.sbp}/{last.dbp} RR {last.rr} SpO2 {last.spo2}%（{last.o2}）
        </p>
      )}
      {when && (
        <div className="nums flex flex-wrap items-center gap-2 rounded-md border border-ai/40 bg-ai-soft/40 px-2 py-1 text-xs text-ink-soft">
          測った時刻
          <span className="font-bold text-ink">{fmtDay ? fmtDay(when.day) : when.day === 0 ? "今日" : `${when.day}日`}</span>
          <input value={when.time} onChange={(e) => setWhen({ ...when, time: e.target.value })} inputMode="numeric" aria-label="測った時刻" className="w-16 rounded border border-rule bg-paper px-1.5 py-0.5 text-right text-[13px]" />
          <button type="button" onClick={() => setWhen(null)} className="rounded border border-rule px-1.5 py-0.5">
            いまにする
          </button>
          {!whenOk && <span className="text-shu">「14:20」のように、いまより前の時刻を入れてください。</span>}
        </div>
      )}
      <button
        type="button"
        disabled={!filled || !whenOk}
        onClick={() => {
          onSave({ day: at.day, time: at.time, ...v, by: me.name });
          setF(empty);
          setText("");
        }}
        className="w-full rounded-md bg-ai px-3 py-2 font-bold text-white disabled:opacity-40"
      >
        確定（{at.day === 0 ? "" : fmtDay ? `${fmtDay(at.day)} ` : ""}
        {at.time}）
      </button>
      {onDaily && <DailyForm today={today} prevWeight={prevWeight} onDaily={onDaily} onOpenIo={onOpenIo} />}
    </div>
  );
}
