"use client";

import { Mic, Square } from "lucide-react";
import { useState } from "react";
import { ACVPU_LABEL, news2, type Acvpu } from "@/lib/news2";
import { useSpeech } from "@/lib/use-speech";
import type { VitalSign } from "@/lib/types";
import { CLAUDE, auditLog } from "@/lib/audit";

interface Props {
  nowTime: string;
  last?: VitalSign;
  onSave: (v: VitalSign) => void;
}

type Form = { bt: string; hr: string; sbp: string; dbp: string; rr: string; spo2: string; o2: string; avpu: Acvpu | "" };
const empty: Form = { bt: "", hr: "", sbp: "", dbp: "", rr: "", spo2: "", o2: "室内気", avpu: "" };
const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

const RISK_STYLE = { 低: "bg-wakatake-soft text-wakatake", "低〜中": "bg-yamabuki-soft text-yamabuki", 中: "bg-yamabuki-soft text-yamabuki", 高: "bg-shu-soft text-shu" } as const;

/** Vital signs entry (typed or spoken). Claude copies the numbers; NEWS2 is code; the nurse confirms. */
export function VitalsPanel({ nowTime, last, onSave }: Props) {
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
          onSave({ day: 0, time: nowTime, ...v, by: "看護師（あなた）" });
          setF(empty);
          setText("");
        }}
        className="w-full rounded-md bg-ai px-3 py-2 font-bold text-white disabled:opacity-40"
      >
        確定（{nowTime}）
      </button>
    </div>
  );
}
