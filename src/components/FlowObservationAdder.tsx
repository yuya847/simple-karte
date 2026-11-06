"use client";
import { useState } from "react";
import { OBSERVATION_PRESETS, observationOrder } from "@/lib/flow-observation";
import type { CareOrder } from "@/lib/care-orders";
import { TimeInputs } from "./TimeInput";
import { useMe } from "./RoleContext";
export function FlowObservationAdder({ patientId, nowTime, onAdd }: { patientId: string; nowTime: string; onAdd: (o: CareOrder) => void }) {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState("");
  const [kind, setKind] = useState<NonNullable<CareOrder["inputKind"]>>("text");
  const [unit, setUnit] = useState("");
  const [choices, setChoices] = useState("");
  const [fixed, setFixed] = useState(false);
  const [times, setTimes] = useState<string[]>([]);
  const options = choices.split(/[、,]/).map(s => s.trim()).filter(Boolean);
  const valid = item.trim() && (kind !== "choice" || options.length > 0) && (!fixed || times.length > 0 && times.every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)));
  const box = "rounded border border-rule bg-sheet px-2 py-1.5";
  return <div className="p-1 text-xs"><button type="button" className={box} onClick={() => setOpen(!open)}>＋項目を足す</button>{open && <div className="space-y-2 border border-rule bg-paper p-2">
    <div className="flex flex-wrap gap-1">{OBSERVATION_PRESETS.map(p => <button type="button" key={p.item} className={box} onClick={() => { setItem(p.item); setKind(p.inputKind); setUnit("unit" in p ? p.unit ?? "" : ""); setChoices("choices" in p ? p.choices?.join("、") ?? "" : ""); }}>{p.item}</button>)}</div>
    <div className="flex flex-wrap gap-2"><label>名前 <input aria-label="観察項目の名前" className={box} value={item} onChange={e => setItem(e.target.value)} /></label>
    <label>入力 <select className={box} value={kind} onChange={e => setKind(e.target.value as typeof kind)}>{([["number", "数値＋単位"], ["choice", "選ぶ"], ["check", "チェック"], ["text", "文"]] as const).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    {kind === "number" && <label>単位 <input className={box} value={unit} onChange={e => setUnit(e.target.value)} /></label>}
    {kind === "choice" && <label>選択肢 <input className={box} value={choices} onChange={e => setChoices(e.target.value)} placeholder="なし、あり" /></label>}
    <label>時刻 <select className={box} value={fixed ? "fixed" : "prn"} onChange={e => setFixed(e.target.value === "fixed")}><option value="prn">必要時・指示どおり</option><option value="fixed">定時</option></select></label>
    {fixed && <TimeInputs times={times} onChange={setTimes} label="観察の時刻" />}
    <button type="button" className={box} disabled={!valid} onClick={() => { onAdd(observationOrder({ item, inputKind: kind, unit: kind === "number" ? unit : undefined, choices: kind === "choice" ? options : undefined, schedule: fixed ? { kind: "times", times } : { kind: "prn" }, patientId, by: me.name, time: nowTime, id: crypto.randomUUID() })); setOpen(false); setItem(""); }}>追加</button></div>
    
  </div>}</div>;
}
